import { createHash } from 'node:crypto'

import { and, eq } from 'drizzle-orm'

import { recordAuditEvent } from '../auth/audit.server'
import { AuthError } from '../auth/auth.errors'
import { db } from '../db/client.server'
import type { Database } from '../db/client.server'
import { pushNotifications, pushNotificationDeliveries, pushSubscriptions } from '../db/schema/push-subscriptions'
import type { QueueActor } from '../queue/queue.authorization'
import { isActiveQueueStatus } from '../queue/queue.domain'
import { findQueueEntryById } from '../queue/queue.repository.server'
import type {
  PushSubscriptionRegisterInput,
  PushSubscriptionStatusInput,
  PushSubscriptionUnregisterInput,
} from './push.schemas'

export class PushError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'FAILED',
  ) {
    super(message)
    this.name = 'PushError'
  }
}

export type PushSubscriptionDTO = {
  id: string
  queueEntryId: string
  active: boolean
}

export type PushSubscriptionStatusDTO = {
  subscribed: boolean
}

export type PushUnregisterResultDTO = {
  queueEntryId: string
  active: boolean
}

export type PushConfigDTO = {
  publicKey: string | null
}

type PushExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

function mapPushError(error: unknown, fallback: string): never {
  if (error instanceof PushError) throw error
  if (error instanceof AuthError) throw error
  throw new PushError(fallback, 'FAILED')
}

function isUniqueViolation(error: unknown): boolean {
  // Drizzle verpakt databasefouten in een DrizzleQueryError waarvan het
  // bericht alleen de query bevat; de onderliggende oorzaak (o.a. code
  // 23505 voor unique violations) zit in `cause`. Doorloop de keten.
  let current: unknown = error
  const seen = new Set<unknown>()
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const record = current as { message?: unknown; code?: unknown; cause?: unknown }
    if (typeof record.message === 'string' && record.message.toLowerCase().includes('unique')) return true
    if (record.code === '23505') return true
    current = record.cause
  }
  return false
}

/** Leest uitsluitend de publieke VAPID-sleutel. De private key wordt nergens ingelezen. */
export function getVapidPublicKey(): string | null {
  const value = process.env.VAPID_PUBLIC_KEY?.trim()
  return value ? value : null
}

export function getPushConfig(): PushConfigDTO {
  return { publicKey: getVapidPublicKey() }
}

function requirePushActor(actor: QueueActor): asserts actor is Exclude<QueueActor, { kind: 'owner' }> {
  if (actor.kind === 'owner') {
    throw new AuthError('Push is alleen beschikbaar voor klanten in de wachtrij.', 'FORBIDDEN')
  }
}

async function loadAccessibleEntry(
  executor: PushExecutor,
  queueEntryId: string,
  actor: QueueActor,
) {
  const entry = await findQueueEntryById(executor, queueEntryId)
  if (!entry) throw new PushError('Queue-entry niet gevonden.', 'NOT_FOUND')
  if (actor.kind === 'customer') {
    if (entry.customerUserId !== actor.userId) throw new AuthError('Geen toegang.', 'FORBIDDEN')
  } else if (actor.kind === 'owner') {
    throw new AuthError('Push is alleen beschikbaar voor klanten in de wachtrij.', 'FORBIDDEN')
  } else {
    if (!actor.capability) throw new AuthError('Geen toegang.', 'FORBIDDEN')
    if (entry.customerUserId !== null) throw new AuthError('Geen toegang.', 'FORBIDDEN')
    if (createHash('sha256').update(actor.capability).digest('hex') !== entry.guestAccessTokenHash) {
      throw new AuthError('Geen toegang.', 'FORBIDDEN')
    }
  }
  return entry
}

async function recordSubscriptionAudit(
  executor: PushExecutor,
  action: 'push.subscribe' | 'push.unsubscribe',
  actor: QueueActor,
  subscriptionId: string,
  queueEntryId: string,
): Promise<void> {
  await recordAuditEvent(
    {
      action,
      actorUserId: actor.kind === 'guest' ? undefined : actor.userId,
      entityType: 'push_subscription',
      entityId: subscriptionId,
      metadata: { queueEntryId },
    },
    executor,
  )
}

async function verifyRegistrationAccess(
  executor: PushExecutor,
  input: PushSubscriptionRegisterInput,
  actor: QueueActor,
) {
  const entry = await loadAccessibleEntry(executor, input.queueEntryId, actor)
  if (!isActiveQueueStatus(entry.status)) {
    throw new PushError('Alleen actieve wachtrijvermeldingen kunnen pushmeldingen ontvangen.', 'INVALID')
  }
  return entry
}

export async function registerPushSubscription(
  input: PushSubscriptionRegisterInput,
  actor: QueueActor,
): Promise<PushSubscriptionDTO> {
  requirePushActor(actor)
  if (!getVapidPublicKey()) throw new PushError('Push is nog niet beschikbaar.', 'FAILED')
  const customerUserId = actor.kind === 'customer' ? actor.userId : null
  const buildValues = (queueEntryId: string) => ({
    queueEntryId,
    customerUserId,
    endpoint: input.endpoint,
    p256dhKey: input.p256dh,
    authKey: input.auth,
    active: true,
    deactivatedAt: null,
    deactivateReason: null,
    updatedAt: new Date(),
  })
  const subscriptionShape = {
    id: pushSubscriptions.id,
    queueEntryId: pushSubscriptions.queueEntryId,
    active: pushSubscriptions.active,
  }
  try {
    return await db.transaction(async (tx) => {
      const entry = await verifyRegistrationAccess(tx, input, actor)
      const [created] = await tx.insert(pushSubscriptions).values(buildValues(entry.id)).returning(subscriptionShape)
      if (!created) throw new PushError('De subscription kon niet worden opgeslagen.', 'FAILED')
      await recordSubscriptionAudit(tx, 'push.subscribe', actor, created.id, entry.id)
      return created
    })
  } catch (error) {
    if (!isUniqueViolation(error)) throw mapPushError(error, 'De subscription kon niet worden opgeslagen.')
    // De mislukte transactie is afgebroken; verplaats of heractiveer daarom
    // in een nieuwe transactie. Gelijktijdige of herhaalde registratie van
    // hetzelfde endpoint eindigt zo in één rij.
    try {
      return await db.transaction(async (tx) => {
        const entry = await verifyRegistrationAccess(tx, input, actor)
        const [existing] = await tx
          .select({ id: pushSubscriptions.id })
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, input.endpoint))
          .limit(1)
        if (!existing) throw new PushError('De subscription kon niet worden opgeslagen.', 'FAILED')
        const [updated] = await tx
          .update(pushSubscriptions)
          .set(buildValues(entry.id))
          .where(eq(pushSubscriptions.id, existing.id))
          .returning(subscriptionShape)
        if (!updated) throw new PushError('De subscription kon niet worden opgeslagen.', 'FAILED')
        await recordSubscriptionAudit(tx, 'push.subscribe', actor, updated.id, entry.id)
        return updated
      })
    } catch (retryError) {
      return mapPushError(retryError, 'De subscription kon niet worden opgeslagen.')
    }
  }
}

export async function getPushSubscriptionStatus(
  input: PushSubscriptionStatusInput,
  actor: QueueActor,
): Promise<PushSubscriptionStatusDTO> {
  requirePushActor(actor)
  try {
    const entry = await loadAccessibleEntry(db, input.queueEntryId, actor)
    const conditions = [eq(pushSubscriptions.queueEntryId, entry.id), eq(pushSubscriptions.active, true)]
    if (actor.kind === 'customer') {
      conditions.push(eq(pushSubscriptions.customerUserId, actor.userId))
    }
    const [row] = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(and(...conditions))
      .limit(1)
    return { subscribed: row !== undefined }
  } catch (error) {
    return mapPushError(error, 'De pushstatus kon niet worden geladen.')
  }
}

export async function unregisterPushSubscription(
  input: PushSubscriptionUnregisterInput,
  actor: QueueActor,
): Promise<PushUnregisterResultDTO> {
  requirePushActor(actor)
  try {
    return await db.transaction(async (tx) => {
      const entry = await loadAccessibleEntry(tx, input.queueEntryId, actor)
      const conditions = [eq(pushSubscriptions.queueEntryId, entry.id), eq(pushSubscriptions.endpoint, input.endpoint)]
      if (actor.kind === 'customer') {
        conditions.push(eq(pushSubscriptions.customerUserId, actor.userId))
      }
      const [existing] = await tx
        .select({ id: pushSubscriptions.id, active: pushSubscriptions.active })
        .from(pushSubscriptions)
        .where(and(...conditions))
        .limit(1)
      if (!existing || !existing.active) return { queueEntryId: entry.id, active: false }
      const [updated] = await tx
        .update(pushSubscriptions)
        .set({ active: false, deactivatedAt: new Date(), deactivateReason: 'opt_out', updatedAt: new Date() })
        .where(eq(pushSubscriptions.id, existing.id))
        .returning({ queueEntryId: pushSubscriptions.queueEntryId, active: pushSubscriptions.active })
      if (!updated) throw new PushError('De subscription kon niet worden uitgeschakeld.', 'FAILED')
      await recordSubscriptionAudit(tx, 'push.unsubscribe', actor, existing.id, entry.id)
      return updated
    })
  } catch (error) {
    return mapPushError(error, 'De subscription kon niet worden uitgeschakeld.')
  }
}

export function pushIntentIdempotencyKey(queueEntryId: string): string {
  return `called:${queueEntryId}`
}

/**
 * Legt de notificatie-intentie en initiële deliveries vast. Uitsluitend
 * aan te roepen na een geslaagde overgang naar `called`, binnen dezelfde
 * transactie. Bij een al bestaande intentie (tweede echte `called` na een
 * skip-cyclus) ontstaat geen nieuwe notificatie.
 */
export async function createPushIntentForCalledEntry(
  executor: PushExecutor,
  queueEntryId: string,
): Promise<{ created: boolean }> {
  const [notification] = await executor
    .insert(pushNotifications)
    .values({ queueEntryId, event: 'called', idempotencyKey: pushIntentIdempotencyKey(queueEntryId), status: 'pending' })
    .onConflictDoNothing()
    .returning({ id: pushNotifications.id })
  if (!notification) return { created: false }
  const subs = await executor
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.queueEntryId, queueEntryId), eq(pushSubscriptions.active, true)))
  for (const sub of subs) {
    await executor
      .insert(pushNotificationDeliveries)
      .values({ notificationId: notification.id, subscriptionId: sub.id, status: 'pending', attempts: 0 })
      .onConflictDoNothing()
  }
  return { created: true }
}

export async function deactivatePushSubscriptionsForEntry(
  executor: PushExecutor,
  queueEntryId: string,
  reason: 'entry_ended' | 'opt_out' | 'invalid' | 'expired' | 'replaced' = 'entry_ended',
): Promise<void> {
  await executor
    .update(pushSubscriptions)
    .set({ active: false, deactivatedAt: new Date(), deactivateReason: reason, updatedAt: new Date() })
    .where(and(eq(pushSubscriptions.queueEntryId, queueEntryId), eq(pushSubscriptions.active, true)))
}
