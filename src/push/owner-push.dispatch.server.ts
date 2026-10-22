import { createHash, randomUUID } from 'node:crypto'

import webpush from 'web-push'
import { and, eq, gt, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'

import { db } from '../db/client.server'
import { ownerNotificationEvents } from '../db/schema/owner-notifications'
import { ownerPushDeliveries, ownerPushSubscriptions } from '../db/schema/owner-push-subscriptions'
import { classifyProviderError, parseRetryAfterSeconds } from './push.dispatch.server'
import { deactivateOwnerPushSubscription } from './owner-push.service.server'
import { getVapidConfig } from './vapid.server'

/**
 * Verzending van de pushmeldingen van de **eigenaar**
 * (BUSINESS_RULES.md §29 "Eigenaarpush").
 *
 * De pushintentie is het duurzame gebeurtenisregister van de interne
 * eigenaar-notificaties (`owner_notification_events`): een gebeurtenis levert
 * per actief apparaat precies één delivery op. De ontdubbeling zit in de
 * unieke combinatie van gebeurtenis en abonnement, zodat herhaalde events en
 * retries nooit een tweede melding op hetzelfde apparaat opleveren.
 *
 * De klantenpush (`push.dispatch.server.ts`) wordt niet aangeraakt; alleen de
 * pure foutclassificatie wordt hergebruikt. Eigen tabellen, eigen payloads,
 * eigen retentie en eigen foutafhandeling.
 */

/** Aantal verzendpogingen per delivery; database-constraint houdt dit tegen. */
const OWNER_PUSH_MAX_ATTEMPTS = 3
const OWNER_PUSH_ATTEMPT_TIMEOUT_MS = 10_000
const OWNER_PUSH_DISPATCH_BUDGET_MS = 20_000
const OWNER_PUSH_MAX_DELIVERIES_PER_RUN = 50
const OWNER_PUSH_TTL_SECONDS = 900
/**
 * Verzendhorizon. Binnen dit venster kan een gebeurtenis nog als push
 * worden afgeleverd; daarna is de gebeurtenis alleen nog in de interne bel
 * zichtbaar. De waarde is gelijk aan de horizon van de klantenpush.
 */
const OWNER_PUSH_EVENT_MAX_AGE_MS = 30 * 60_000
const OWNER_PUSH_STALE_CLAIM_LEASE_MS = 5 * 60_000
const OWNER_PUSH_MAX_RETRY_AFTER_SECONDS = 3600
/**
 * Basis-uitstel voor een volgende poging na een tijdelijke fout. De
 * pogingen worden over verschillende runs verdeeld; de wachttijd groeit met
 * het aantal gebruikte pogingen.
 */
const OWNER_PUSH_RETRY_DELAY_MS = 30_000

const TERMINAL_DELIVERY_STATUSES = ['sent', 'failed', 'expired', 'invalid'] as const

export type OwnerPushDispatchSummary = {
  created: number
  claimed: number
  sent: number
  retried: number
  failed: number
  invalid: number
  expired: number
}

export type OwnerPushDispatchResult = OwnerPushDispatchSummary & {
  skipped: string | null
}

/**
 * Bouwt de pushpayload voor de eigenaar.
 *
 * De payload bevat uitsluitend een technische tag en het soort gebeurtenis:
 * geen klantnaam, geen contactgegevens, geen notities en geen verwijzing naar
 * een specifieke wachtrij-entry of afspraak. De tag is een eenmalige
 * vingerafdruk van de gebeurtenissleutel en is dus stabiel per gebeurtenis
 * (voor deduplicatie op het apparaat) maar niet herleidbaar.
 */
export function buildOwnerPushPayload(event: {
  event: string
  dedupKey: string
}): { body: string; tag: string } {
  const fingerprint = createHash('sha256').update(event.dedupKey).digest('hex').slice(0, 16)
  const tag = `owner-${event.event}-${fingerprint}`
  return { body: JSON.stringify({ tag, kind: event.event }), tag }
}

function isOwnerPushEventFresh(eventCreatedAt: Date, now: number): boolean {
  return eventCreatedAt.getTime() > now - OWNER_PUSH_EVENT_MAX_AGE_MS
}

/**
 * Legt de ontbrekende deliveries vast voor recente gebeurtenissen.
 *
 * De aanmaak is idempotent: een bestaande combinatie van gebeurtenis en
 * abonnement wordt niet opnieuw aangemaakt (`ON CONFLICT DO NOTHING`).
 */
export async function ensureOwnerPushDeliveries(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - OWNER_PUSH_EVENT_MAX_AGE_MS)
  // Eerst de apparaten: zonder actief apparaat is er niets te bezorgen.
  const subscriptions = await db
    .select({ id: ownerPushSubscriptions.id, ownerUserId: ownerPushSubscriptions.ownerUserId })
    .from(ownerPushSubscriptions)
    .where(eq(ownerPushSubscriptions.active, true))
  if (subscriptions.length === 0) return 0

  const events = await db
    .select({
      id: ownerNotificationEvents.id,
      recipientUserId: ownerNotificationEvents.recipientUserId,
    })
    .from(ownerNotificationEvents)
    .where(gt(ownerNotificationEvents.createdAt, cutoff))
    .orderBy(ownerNotificationEvents.createdAt)
    .limit(OWNER_PUSH_MAX_DELIVERIES_PER_RUN)
  if (events.length === 0) return 0

  const existing = await db
    .select({
      eventId: ownerPushDeliveries.eventId,
      subscriptionId: ownerPushDeliveries.subscriptionId,
    })
    .from(ownerPushDeliveries)
    .where(inArray(ownerPushDeliveries.eventId, events.map((event) => event.id)))
  const existingKeys = new Set(existing.map((row) => `${row.eventId}:${row.subscriptionId}`))

  let created = 0
  for (const event of events) {
    for (const subscription of subscriptions) {
      // Alleen de eigenaar die de gebeurtenis heeft ontvangen.
      if (subscription.ownerUserId !== event.recipientUserId) continue
      if (existingKeys.has(`${event.id}:${subscription.id}`)) continue
      const inserted = await db
        .insert(ownerPushDeliveries)
        .values({ eventId: event.id, subscriptionId: subscription.id, status: 'pending', attempts: 0 })
        .onConflictDoNothing()
        .returning({ id: ownerPushDeliveries.id })
      if (inserted.length > 0) created += 1
    }
  }
  return created
}

type ClaimedOwnerPushDelivery = typeof ownerPushDeliveries.$inferSelect & {
  subscriptionEndpoint: string
  subscriptionP256dh: string
  subscriptionAuth: string
  subscriptionActive: boolean
  eventType: string
  eventDedupKey: string
  eventCreatedAt: Date
}

async function hydrateClaimedOwnerPushDelivery(
  deliveryId: string,
): Promise<ClaimedOwnerPushDelivery | null> {
  const [row] = await db
    .select({
      delivery: ownerPushDeliveries,
      endpoint: ownerPushSubscriptions.endpoint,
      p256dh: ownerPushSubscriptions.p256dhKey,
      auth: ownerPushSubscriptions.authKey,
      subscriptionActive: ownerPushSubscriptions.active,
      eventType: ownerNotificationEvents.event,
      eventDedupKey: ownerNotificationEvents.dedupKey,
      eventCreatedAt: ownerNotificationEvents.createdAt,
    })
    .from(ownerPushDeliveries)
    .innerJoin(ownerPushSubscriptions, eq(ownerPushSubscriptions.id, ownerPushDeliveries.subscriptionId))
    .innerJoin(ownerNotificationEvents, eq(ownerNotificationEvents.id, ownerPushDeliveries.eventId))
    .where(eq(ownerPushDeliveries.id, deliveryId))
    .limit(1)
  if (!row) return null
  return {
    ...row.delivery,
    subscriptionEndpoint: row.endpoint,
    subscriptionP256dh: row.p256dh,
    subscriptionAuth: row.auth,
    subscriptionActive: row.subscriptionActive,
    eventType: row.eventType,
    eventDedupKey: row.eventDedupKey,
    eventCreatedAt: row.eventCreatedAt,
  }
}

async function claimOneOwnerPushDelivery(now: number): Promise<ClaimedOwnerPushDelivery | null> {
  const candidates = await db
    .select({ id: ownerPushDeliveries.id })
    .from(ownerPushDeliveries)
    .where(
      and(
        eq(ownerPushDeliveries.status, 'pending'),
        lt(ownerPushDeliveries.attempts, OWNER_PUSH_MAX_ATTEMPTS),
        or(isNull(ownerPushDeliveries.nextAttemptAt), lte(ownerPushDeliveries.nextAttemptAt, new Date(now))),
      ),
    )
    .orderBy(ownerPushDeliveries.createdAt)
    .limit(1)
  if (candidates.length === 0) return null
  const [claimed] = await db
    .update(ownerPushDeliveries)
    .set({
      status: 'sending',
      attempts: sql`${ownerPushDeliveries.attempts} + 1`,
      claimedAt: new Date(now),
      claimToken: randomUUID(),
      updatedAt: new Date(now),
    })
    .where(
      and(
        eq(ownerPushDeliveries.id, candidates[0].id),
        eq(ownerPushDeliveries.status, 'pending'),
      ),
    )
    .returning()
  if (!claimed) return null
  return hydrateClaimedOwnerPushDelivery(claimed.id)
}

async function closeOwnerPushDelivery(
  deliveryId: string,
  claimToken: string | null,
  values: Partial<typeof ownerPushDeliveries.$inferInsert>,
): Promise<boolean> {
  const conditions = [
    eq(ownerPushDeliveries.id, deliveryId),
    eq(ownerPushDeliveries.status, 'sending'),
  ]
  if (claimToken) conditions.push(eq(ownerPushDeliveries.claimToken, claimToken))
  const [updated] = await db
    .update(ownerPushDeliveries)
    .set({ ...values, updatedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: ownerPushDeliveries.id })
  return updated !== undefined
}

async function sendClaimedOwnerPushDelivery(
  claimed: ClaimedOwnerPushDelivery,
  vapid: { publicKey: string; privateKey: string; subject: string },
  now: number,
  summary: OwnerPushDispatchSummary,
): Promise<void> {
  // Geldigheidscontrole direct vóór de provider-call: nooit verzenden als het
  // apparaat inmiddel uitgeschakeld is of de gebeurtenis buiten het
  // verzendvenster ligt.
  const fresh = await hydrateClaimedOwnerPushDelivery(claimed.id)
  if (!fresh) return
  if (!fresh.subscriptionActive || !isOwnerPushEventFresh(fresh.eventCreatedAt, now)) {
    await closeOwnerPushDelivery(fresh.id, fresh.claimToken, { status: 'expired' })
    summary.expired += 1
    return
  }
  const payload = buildOwnerPushPayload({
    event: fresh.eventType,
    dedupKey: fresh.eventDedupKey,
  })
  try {
    await webpush.sendNotification(
      {
        endpoint: fresh.subscriptionEndpoint,
        expirationTime: null,
        keys: { p256dh: fresh.subscriptionP256dh, auth: fresh.subscriptionAuth },
      },
      payload.body,
      {
        vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
        TTL: OWNER_PUSH_TTL_SECONDS,
        urgency: 'high',
        timeout: OWNER_PUSH_ATTEMPT_TIMEOUT_MS,
      },
    )
    await closeOwnerPushDelivery(fresh.id, fresh.claimToken, { status: 'sent' })
    summary.sent += 1
  } catch (error) {
    const classification = classifyProviderError(error)
    if (classification.category === 'invalid') {
      // 404/410: het endpoint is dood en moet niet opnieuw worden gebruikt.
      await deactivateOwnerPushSubscription(fresh.subscriptionId, 'invalid')
      await closeOwnerPushDelivery(fresh.id, fresh.claimToken, {
        status: 'invalid',
        lastErrorCategory: 'invalid',
      })
      summary.invalid += 1
      return
    }
    if (classification.category === 'permanent') {
      await closeOwnerPushDelivery(fresh.id, fresh.claimToken, {
        status: 'failed',
        lastErrorCategory: 'permanent',
      })
      summary.failed += 1
      return
    }
    if (fresh.attempts >= OWNER_PUSH_MAX_ATTEMPTS) {
      await closeOwnerPushDelivery(fresh.id, fresh.claimToken, {
        status: 'failed',
        lastErrorCategory: 'transient',
      })
      summary.failed += 1
      return
    }
    const retryAfterSeconds = classification.retryAfterSeconds
      ?? parseRetryAfterSeconds((error as { headers?: unknown } | null)?.headers)
    const providerDelayMs = retryAfterSeconds !== undefined
      ? Math.min(retryAfterSeconds, OWNER_PUSH_MAX_RETRY_AFTER_SECONDS) * 1000
      : 0
    // Een tijdelijke fout krijgt een uitgestelde volgende poging. Zonder
    // uitstel zou de dispatchloop dezelfde delivery direct opnieuw claimen en
    // alle pogingen binnen één run verbruiken; de retries moeten over
    // verschillende runs verdeeld zijn. Een door de provider opgegeven
    // Retry-After heeft daarbij voorrang.
    const delayMs = Math.max(OWNER_PUSH_RETRY_DELAY_MS * fresh.attempts, providerDelayMs)
    const nextAttemptAt = new Date(now + delayMs)
    await closeOwnerPushDelivery(fresh.id, fresh.claimToken, {
      status: 'pending',
      nextAttemptAt,
      lastErrorCategory: 'transient',
    })
    summary.retried += 1
  }
}

/**
 * Verzendt de openstaande eigenaarmeldingen. Het aanmaken van ontbrekende
 * deliveries en het verzenden gebeurt in dezelfde run, zodat een gebeurtenis
 * direct na de businessactie wordt afgeleverd.
 */
export async function dispatchOwnerPushDeliveries(
  options: { maxDeliveries?: number; timeBudgetMs?: number; now?: number } = {},
): Promise<OwnerPushDispatchResult> {
  const now = options.now ?? Date.now()
  const summary: OwnerPushDispatchResult = {
    created: 0,
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
    // Fail-closed: zonder VAPID-configuratie wordt niets verzonden.
    summary.skipped = 'vapid-missing'
    return summary
  }
  summary.created = await ensureOwnerPushDeliveries(now)
  const deadline = now + (options.timeBudgetMs ?? OWNER_PUSH_DISPATCH_BUDGET_MS)
  const limit = options.maxDeliveries ?? OWNER_PUSH_MAX_DELIVERIES_PER_RUN
  for (let processed = 0; processed < limit; processed += 1) {
    if (Date.now() > deadline) break
    const claimed = await claimOneOwnerPushDelivery(Date.now())
    if (!claimed) break
    summary.claimed += 1
    await sendClaimedOwnerPushDelivery(claimed, vapid, Date.now(), summary)
  }
  return summary
}

/**
 * Herstelt vastgelopen claims. Een delivery die nog binnen het
 * verzendvenster valt en een geldig apparaat heeft, gaat terug naar `pending`;
 * anders wordt de delivery afgesloten.
 */
export async function reconcileStaleOwnerPushDeliveries(
  now = Date.now(),
  leaseMs = OWNER_PUSH_STALE_CLAIM_LEASE_MS,
): Promise<{ recovered: number; closed: number }> {
  const stale = await db
    .select({ id: ownerPushDeliveries.id })
    .from(ownerPushDeliveries)
    .where(
      and(
        eq(ownerPushDeliveries.status, 'sending'),
        lt(ownerPushDeliveries.claimedAt, new Date(now - leaseMs)),
      ),
    )
    .orderBy(ownerPushDeliveries.claimedAt)
    .limit(OWNER_PUSH_MAX_DELIVERIES_PER_RUN)
  let recovered = 0
  let closed = 0
  for (const row of stale) {
    const fresh = await hydrateClaimedOwnerPushDelivery(row.id)
    if (!fresh) continue
    const usable =
      fresh.subscriptionActive &&
      isOwnerPushEventFresh(fresh.eventCreatedAt, now) &&
      fresh.attempts < OWNER_PUSH_MAX_ATTEMPTS
    if (usable) {
      const [updated] = await db
        .update(ownerPushDeliveries)
        .set({
          status: 'pending',
          claimToken: null,
          claimedAt: null,
          nextAttemptAt: new Date(now),
          updatedAt: new Date(now),
        })
        .where(
          and(
            eq(ownerPushDeliveries.id, fresh.id),
            eq(ownerPushDeliveries.status, 'sending'),
          ),
        )
        .returning({ id: ownerPushDeliveries.id })
      if (updated) recovered += 1
    } else {
      const [updated] = await db
        .update(ownerPushDeliveries)
        .set({ status: 'expired', updatedAt: new Date(now) })
        .where(
          and(
            eq(ownerPushDeliveries.id, fresh.id),
            eq(ownerPushDeliveries.status, 'sending'),
          ),
        )
        .returning({ id: ownerPushDeliveries.id })
      if (updated) closed += 1
    }
  }
  return { recovered, closed }
}

/**
 * Opruiming volgt het gebruik, niet een vaste termijn
 * (BUSINESS_RULES.md §29 "Technische pushgegevens").
 *
 * - Deliveries met een eindstatus waarvan de gebeurtenis buiten het
 *   verzendvenster ligt, hebben hun rol (verzending, retry, deduplicatie)
 *   vervuld en worden verwijderd.
 * - Inactieve abonnementen worden verwijderd zodra ze niet meer nodig zijn
 *   voor verzending; een abonnement met een nog herstelbare delivery blijft
 *   staan.
 * - Actieve, geldige abonnementen blijven bestaan zolang ze nodig zijn.
 */
export async function cleanupOwnerPushData(
  now = Date.now(),
): Promise<{ deliveries: number; subscriptions: number }> {
  const cutoff = new Date(now - OWNER_PUSH_EVENT_MAX_AGE_MS)
  const deletedDeliveries = await db
    .delete(ownerPushDeliveries)
    .where(
      and(
        inArray(ownerPushDeliveries.status, [...TERMINAL_DELIVERY_STATUSES]),
        lt(ownerPushDeliveries.createdAt, cutoff),
      ),
    )
    .returning({ id: ownerPushDeliveries.id })
  const deletedSubscriptions = await db
    .delete(ownerPushSubscriptions)
    .where(
      and(
        eq(ownerPushSubscriptions.active, false),
        sql`NOT EXISTS (SELECT 1 FROM ${ownerPushDeliveries} WHERE ${ownerPushDeliveries.subscriptionId} = ${ownerPushSubscriptions.id} AND ${ownerPushDeliveries.status} IN ('pending', 'sending'))`,
      ),
    )
    .returning({ id: ownerPushSubscriptions.id })
  return {
    deliveries: deletedDeliveries.length,
    subscriptions: deletedSubscriptions.length,
  }
}

/**
 * Post-commit hook voor eigenaarpush.
 *
 * Wordt ná de commit van de businessactie aangeroepen. De hook geeft nooit
 * een fout door: een pushprobleem mag de kernactie niet laten mislukken
 * (BUSINESS_RULES.md §29 "Foutafhandeling"). Achtergebleven meldingen worden
 * door de dagelijkse Cron hersteld.
 */
export async function notifyOwnerPush(): Promise<void> {
  try {
    await dispatchOwnerPushDeliveries()
  } catch {
    // Bewust genegeerd: zie hierboven.
  }
}
