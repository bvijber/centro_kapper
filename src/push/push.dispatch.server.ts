import { randomUUID } from 'node:crypto'

import webpush from 'web-push'
import { and, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'

import { db } from '../db/client.server'
import type { Database } from '../db/client.server'
import {
  pushNotificationDeliveries,
  pushNotifications,
  pushSubscriptions,
} from '../db/schema/push-subscriptions'
import { waitingListEntries } from '../db/schema/waiting-list'
import { findQueueEntryById } from '../queue/queue.repository.server'
import { getVapidConfig } from './vapid.server'

export type PushErrorCategory = 'transient' | 'permanent' | 'invalid' | 'config' | 'unknown'

export type DispatchSummary = {
  claimed: number
  sent: number
  retried: number
  failed: number
  invalid: number
  expired: number
}

export type DispatchResult = DispatchSummary & {
  skipped: string | null
}

type PushExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

// Begrensd inline-werk past ruim binnen het Hobby-plafond van 300 s per
// functie-uitvoering; providerverzoeken antwoorden doorgaans binnen
// fracties van seconden. Concrete waarden worden bij implementatie aan
// gemeten provider-latentie getoetst (acceptatiecriterium).
const PUSH_MAX_ATTEMPTS = 3
const PUSH_ATTEMPT_TIMEOUT_MS = 10_000
const PUSH_DISPATCH_BUDGET_MS = 20_000
const PUSH_MAX_DELIVERIES_PER_RUN = 50
const PUSH_TTL_SECONDS = 900
const PUSH_NOTIFICATION_MAX_AGE_MS = 30 * 60_000
const STALE_CLAIM_LEASE_MS = 5 * 60_000
const MAX_RETRY_AFTER_SECONDS = 3600
const PUSH_RETENTION_DAYS = 30

/**
 * Basis-uitstel voor een volgende poging na een tijdelijke fout.
 *
 * Zonder uitstel zou de dispatchloop dezelfde delivery direct opnieuw
 * claimen (de claim-conditie accepteert `next_attempt_at <= now`) en alle
 * pogingen binnen één run verbruiken. De wachttijd groeit met het aantal
 * gebruikte pogingen, zodat de retries over verschillende runs verdeeld
 * zijn. De uitgestelde poging blijft binnen het versendvenster en het
 * maximumaantal pogingen blijft ongewijzigd.
 */
export const PUSH_RETRY_DELAY_MS = 30_000

const TERMINAL_DELIVERY_STATUSES = ['sent', 'failed', 'expired', 'invalid'] as const

export function buildPushPayload(idempotencyKey: string): { body: string; tag: string } {
  return { body: JSON.stringify({ tag: idempotencyKey }), tag: idempotencyKey }
}

export function parseRetryAfterSeconds(headers: unknown): number | undefined {
  if (!headers || typeof headers !== 'object') return undefined
  const record = headers as Record<string, unknown>
  const raw = record['retry-after'] ?? record['Retry-After']
  const seconds = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN
  if (!Number.isInteger(seconds) || seconds < 0) return undefined
  return Math.min(seconds, MAX_RETRY_AFTER_SECONDS)
}

export function classifyProviderError(error: unknown): { category: Exclude<PushErrorCategory, 'config'>; statusCode?: number; retryAfterSeconds?: number } {
  const record = (error ?? {}) as { statusCode?: unknown; headers?: unknown }
  const statusCode = typeof record.statusCode === 'number' ? record.statusCode : undefined
  if (statusCode === 404 || statusCode === 410) return { category: 'invalid', statusCode }
  if (statusCode === 429 || (statusCode !== undefined && statusCode >= 500)) {
    return { category: 'transient', statusCode, retryAfterSeconds: parseRetryAfterSeconds(record.headers) }
  }
  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) return { category: 'permanent', statusCode }
  // Netwerk-, time-out- en overige fouten zonder statuscode: uitsluitend
  // transient-equivalent omdat pogingen (max 3), TTL-horizon en
  // stale-controles de schade begrenzen. Documenteert onzekerheid, zie plan.
  return { category: 'transient', statusCode }
}

/**
 * Bepaalt hoeveel milliseconden tot de volgende poging wordt gewacht.
 *
 * Een bruikbare `Retry-After` van de provider blijft leidend en wordt
 * ongewijzigd overgenomen. Zonder zo'n header (of met een waarde van nul,
 * die feitelijk "nu" betekent) geldt de oplopende back-off, zodat een
 * tijdelijke fout de resterende pogingen niet binnen één dispatch-run
 * verbruikt.
 */
export function computeRetryDelayMs(attempts: number, retryAfterSeconds: number | undefined): number {
  if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000
  }
  return PUSH_RETRY_DELAY_MS * Math.max(1, attempts)
}

function isNotificationFresh(notificationCreatedAt: Date, now: number): boolean {
  return notificationCreatedAt.getTime() > now - PUSH_NOTIFICATION_MAX_AGE_MS
}

type ClaimedDelivery = typeof pushNotificationDeliveries.$inferSelect & {
  subscriptionEndpoint: string
  subscriptionP256dh: string
  subscriptionAuth: string
  subscriptionActive: boolean
  notificationIdempotencyKey: string
  notificationCreatedAt: Date
}

async function claimOneDelivery(
  queueEntryId: string | undefined,
  now: number,
): Promise<ClaimedDelivery | null> {
  const candidateConditions = [
    eq(pushNotificationDeliveries.status, 'pending'),
    lt(pushNotificationDeliveries.attempts, PUSH_MAX_ATTEMPTS),
    or(isNull(pushNotificationDeliveries.nextAttemptAt), lte(pushNotificationDeliveries.nextAttemptAt, new Date(now))),
  ]
  if (queueEntryId !== undefined) {
    const candidates = await db
      .select({ id: pushNotificationDeliveries.id })
      .from(pushNotificationDeliveries)
      .innerJoin(pushNotifications, eq(pushNotifications.id, pushNotificationDeliveries.notificationId))
      .where(and(...candidateConditions, eq(pushNotifications.queueEntryId, queueEntryId)))
      .orderBy(pushNotificationDeliveries.createdAt)
      .limit(1)
    if (candidates.length === 0) return null
    const [claimed] = await db
      .update(pushNotificationDeliveries)
      .set({ status: 'sending', attempts: sql`${pushNotificationDeliveries.attempts} + 1`, claimedAt: new Date(now), claimToken: randomUUID(), updatedAt: new Date(now) })
      .where(and(eq(pushNotificationDeliveries.id, candidates[0].id), eq(pushNotificationDeliveries.status, 'pending')))
      .returning()
    if (!claimed) return null
    return hydrateClaimedDelivery(claimed.id)
  }
  const candidates = await db
    .select({ id: pushNotificationDeliveries.id })
    .from(pushNotificationDeliveries)
    .where(and(...candidateConditions))
    .orderBy(pushNotificationDeliveries.createdAt)
    .limit(1)
  if (candidates.length === 0) return null
  const [claimed] = await db
    .update(pushNotificationDeliveries)
    .set({ status: 'sending', attempts: sql`${pushNotificationDeliveries.attempts} + 1`, claimedAt: new Date(now), claimToken: randomUUID(), updatedAt: new Date(now) })
    .where(and(eq(pushNotificationDeliveries.id, candidates[0].id), eq(pushNotificationDeliveries.status, 'pending')))
    .returning()
  if (!claimed) return null
  return hydrateClaimedDelivery(claimed.id)
}

async function hydrateClaimedDelivery(deliveryId: string): Promise<ClaimedDelivery | null> {
  const [row] = await db
    .select({
      delivery: pushNotificationDeliveries,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dhKey,
      auth: pushSubscriptions.authKey,
      subscriptionActive: pushSubscriptions.active,
      idempotencyKey: pushNotifications.idempotencyKey,
      notificationCreatedAt: pushNotifications.createdAt,
    })
    .from(pushNotificationDeliveries)
    .innerJoin(pushNotifications, eq(pushNotifications.id, pushNotificationDeliveries.notificationId))
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.id, pushNotificationDeliveries.subscriptionId))
    .where(eq(pushNotificationDeliveries.id, deliveryId))
    .limit(1)
  if (!row) return null
  return {
    ...row.delivery,
    subscriptionEndpoint: row.endpoint,
    subscriptionP256dh: row.p256dh,
    subscriptionAuth: row.auth,
    subscriptionActive: row.subscriptionActive,
    notificationIdempotencyKey: row.idempotencyKey,
    notificationCreatedAt: row.notificationCreatedAt,
  }
}

async function closeDelivery(
  deliveryId: string,
  claimToken: string | null,
  values: Partial<typeof pushNotificationDeliveries.$inferInsert>,
): Promise<boolean> {
  const conditions = [eq(pushNotificationDeliveries.id, deliveryId), eq(pushNotificationDeliveries.status, 'sending')]
  if (claimToken) conditions.push(eq(pushNotificationDeliveries.claimToken, claimToken))
  const [updated] = await db
    .update(pushNotificationDeliveries)
    .set({ ...values, updatedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: pushNotificationDeliveries.id })
  return updated !== undefined
}

async function deactivateSubscription(subscriptionId: string, reason: 'invalid' | 'expired'): Promise<void> {
  await db
    .update(pushSubscriptions)
    .set({ active: false, deactivatedAt: new Date(), deactivateReason: reason, updatedAt: new Date() })
    .where(eq(pushSubscriptions.id, subscriptionId))
}

async function sendClaimedDelivery(
  claimed: ClaimedDelivery,
  vapid: { publicKey: string; privateKey: string; subject: string },
  now: number,
  summary: DispatchSummary,
): Promise<void> {
  // Geldigheidscontrole direct vóór de provider-call: nooit verzenden als
  // de entry niet meer called is, de notificatie verouderd is of de
  // subscription inactief is geworden.
  const fresh = await hydrateClaimedDelivery(claimed.id)
  if (!fresh) return
  const queueEntryId = await notificationEntryId(fresh.notificationId)
  const queueEntry = queueEntryId ? await findQueueEntryById(db, queueEntryId) : null
  if (!queueEntry || queueEntry.status !== 'called' || !isNotificationFresh(fresh.notificationCreatedAt, now) || !fresh.subscriptionActive) {
    await closeDelivery(fresh.id, fresh.claimToken, { status: 'expired' })
    summary.expired += 1
    return
  }
  const payload = buildPushPayload(fresh.notificationIdempotencyKey)
  try {
    await webpush.sendNotification(
      { endpoint: fresh.subscriptionEndpoint, expirationTime: null, keys: { p256dh: fresh.subscriptionP256dh, auth: fresh.subscriptionAuth } },
      payload.body,
      {
        vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
        TTL: PUSH_TTL_SECONDS,
        urgency: 'high',
        timeout: PUSH_ATTEMPT_TIMEOUT_MS,
      },
    )
    await closeDelivery(fresh.id, fresh.claimToken, { status: 'sent' })
    summary.sent += 1
  } catch (error) {
    const classification = classifyProviderError(error)
    if (classification.category === 'invalid') {
      await deactivateSubscription(fresh.subscriptionId, 'invalid')
      await closeDelivery(fresh.id, fresh.claimToken, { status: 'invalid' })
      summary.invalid += 1
      return
    }
    if (classification.category === 'permanent') {
      await closeDelivery(fresh.id, fresh.claimToken, { status: 'failed' })
      summary.failed += 1
      return
    }
    if (fresh.attempts >= PUSH_MAX_ATTEMPTS) {
      await closeDelivery(fresh.id, fresh.claimToken, { status: 'failed' })
      summary.failed += 1
      return
    }
    // De volgende poging wordt in de toekomst gepland: zonder uitstel zou
    // de dispatchloop deze delivery direct opnieuw claimen en alle pogingen
    // binnen één run verbruiken. Een Retry-After van de provider blijft
    // leidend; zonder bruikbare Retry-After geldt de oplopende back-off.
    const delayMs = computeRetryDelayMs(fresh.attempts, classification.retryAfterSeconds)
    const nextAttemptAt = new Date(now + delayMs)
    await closeDelivery(fresh.id, fresh.claimToken, { status: 'pending', nextAttemptAt })
    summary.retried += 1
  }
}

async function notificationEntryId(notificationId: string): Promise<string | null> {
  const [row] = await db
    .select({ queueEntryId: pushNotifications.queueEntryId })
    .from(pushNotifications)
    .where(eq(pushNotifications.id, notificationId))
    .limit(1)
  return row?.queueEntryId ?? null
}

export async function dispatchPendingDeliveries(
  options: { queueEntryId?: string; maxDeliveries?: number; timeBudgetMs?: number; now?: number } = {},
): Promise<DispatchResult> {
  const now = options.now ?? Date.now()
  const summary: DispatchResult = {
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    invalid: 0,
    expired: 0,
    skipped: null,
  }
  const vapid = getVapidConfig()
  if (!vapid) {
    summary.skipped = 'vapid-missing'
    return summary
  }
  const deadline = now + (options.timeBudgetMs ?? PUSH_DISPATCH_BUDGET_MS)
  const limit = options.maxDeliveries ?? PUSH_MAX_DELIVERIES_PER_RUN
  for (let processed = 0; processed < limit; processed += 1) {
    if (Date.now() > deadline) break
    const claimed = await claimOneDelivery(options.queueEntryId, Date.now())
    if (!claimed) break
    summary.claimed += 1
    await sendClaimedDelivery(claimed, vapid, Date.now(), summary)
  }
  return summary
}

export async function reconcileStaleSending(now = Date.now(), leaseMs = STALE_CLAIM_LEASE_MS): Promise<{ recovered: number; closed: number }> {
  const stale = await db
    .select({ id: pushNotificationDeliveries.id })
    .from(pushNotificationDeliveries)
    .where(and(eq(pushNotificationDeliveries.status, 'sending'), lt(pushNotificationDeliveries.claimedAt, new Date(now - leaseMs))))
    .orderBy(pushNotificationDeliveries.claimedAt)
    .limit(PUSH_MAX_DELIVERIES_PER_RUN)
  let recovered = 0
  let closed = 0
  for (const row of stale) {
    const fresh = await hydrateClaimedDelivery(row.id)
    if (!fresh) continue
    const queueEntryId = await notificationEntryId(fresh.notificationId)
    const queueEntry = queueEntryId ? await findQueueEntryById(db, queueEntryId) : null
    const usable = queueEntry?.status === 'called'
      && isNotificationFresh(fresh.notificationCreatedAt, now)
      && fresh.subscriptionActive
      && fresh.attempts < PUSH_MAX_ATTEMPTS
    if (usable) {
      const [updated] = await db
        .update(pushNotificationDeliveries)
        .set({ status: 'pending', claimToken: null, claimedAt: null, nextAttemptAt: new Date(now), updatedAt: new Date(now) })
        .where(and(eq(pushNotificationDeliveries.id, fresh.id), eq(pushNotificationDeliveries.status, 'sending')))
        .returning({ id: pushNotificationDeliveries.id })
      if (updated) recovered += 1
    } else {
      const [updated] = await db
        .update(pushNotificationDeliveries)
        .set({ status: queueEntry && queueEntry.status === 'called' ? 'failed' : 'expired', updatedAt: new Date(now) })
        .where(and(eq(pushNotificationDeliveries.id, fresh.id), eq(pushNotificationDeliveries.status, 'sending')))
        .returning({ id: pushNotificationDeliveries.id })
      if (updated) closed += 1
    }
  }
  return { recovered, closed }
}

export async function cleanupPushData(now = Date.now()): Promise<{ deliveries: number; notifications: number; subscriptions: number }> {
  const cutoff = new Date(now - PUSH_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const deletedDeliveries = await db
    .delete(pushNotificationDeliveries)
    .where(and(inArray(pushNotificationDeliveries.status, [...TERMINAL_DELIVERY_STATUSES]), lt(pushNotificationDeliveries.createdAt, cutoff)))
    .returning({ id: pushNotificationDeliveries.id })
  const deletedNotifications = await db
    .delete(pushNotifications)
    .where(
      and(
        lt(pushNotifications.createdAt, cutoff),
        sql`NOT EXISTS (SELECT 1 FROM ${pushNotificationDeliveries} WHERE ${pushNotificationDeliveries.notificationId} = ${pushNotifications.id} AND ${pushNotificationDeliveries.status} IN ('pending', 'sending'))`,
      ),
    )
    .returning({ id: pushNotifications.id })
  const deletedSubscriptions = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.active, false), lt(pushSubscriptions.deactivatedAt, cutoff)))
    .returning({ id: pushSubscriptions.id })
  return { deliveries: deletedDeliveries.length, notifications: deletedNotifications.length, subscriptions: deletedSubscriptions.length }
}
