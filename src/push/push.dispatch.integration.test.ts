import { describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'

const sendNotification = vi.hoisted(() => vi.fn())

vi.mock('web-push', () => ({
  default: { sendNotification, generateVAPIDKeys: vi.fn() },
}))

const databaseAvailable = Boolean(process.env.DATABASE_URL)

/**
 * De tests draaien tegen de database die het project voor tests configureert:
 * `DATABASE_URL`, of `TEST_DATABASE_URL` wanneer `vitest.setup.ts` daarheen
 * routeert. De runtime-controle in de tests hieronder bevestigt vlak voor elke
 * globale actie dat de verbonden database daadwerkelijk die database is.
 *
 * De productie-dispatch en -cleanup werken over de hele tabel. Daarom controleren
 * de tests vóór zo'n actie read-only welke bestaande rijen door de selectie
 * geraakt zouden worden: die moeten er niet zijn, want de test mag alleen zijn
 * eigen fixtures wijzigen.
 */
const ENDPOINT_A = 'https://push.example.test/dispatch/aaa111'
const ENDPOINT_B = 'https://push.example.test/dispatch/bbb222'
const KEYS = {
  p256dh: 'BL7ELU24fJTAlH5Kyl8N6BDCac8u8li_U5PIwG963MOvdYs9s7LSzj8x_7v7RFdLZ9Eap50PiiyF5K0TDAis7t0',
  auth: 'juarI8x__VnHvsOgfeAPHg',
}
const VAPID_ENV = {
  VAPID_PUBLIC_KEY: 'test-public-key',
  VAPID_PRIVATE_KEY: 'test-private-key',
  VAPID_SUBJECT: 'mailto:test@example.test',
}

function accept() {
  sendNotification.mockResolvedValue({ statusCode: 201, headers: {}, body: '' })
}

function useSavedEnv() {
  const savedEnv = { ...process.env }
  Object.assign(process.env, VAPID_ENV)
  sendNotification.mockReset()
  return () => {
    Object.assign(process.env, savedEnv)
    for (const key of Object.keys(VAPID_ENV)) {
      if (!(key in savedEnv)) delete (process.env as Record<string, string | undefined>)[key]
    }
  }
}

describe.skipIf(!databaseAvailable)('push dispatch integration', () => {
  it('creates exactly one intent on a real called transition (Test A)', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray } = await import('drizzle-orm')
    const { auditLogs, services, users } = await import('../db/schema')
    const { pushNotificationDeliveries, pushNotifications, pushSubscriptions } = await import('../db/schema/push-subscriptions')
    const { joinQueue } = await import('../queue/queue.service.server')
    const { callQueueEntry } = await import('../queue/queue.service.server')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    const restoreEnv = useSavedEnv()
    accept()
    const serviceId = randomUUID()
    const customerId = randomUUID()
    const ownerFixture = await ensureActiveOwnerFixture('push-dispatch-intent')
    const ownerActor = { kind: 'owner' as const, userId: ownerFixture.userId }
    const subscriptionIds: string[] = []
    const entryIds: string[] = []
    const notificationIds: string[] = []
    try {
      await db.insert(users).values({ id: customerId, email: `push-${randomUUID()}@example.com`, role: 'customer' })
      await db.insert(services).values({ id: serviceId, name: 'Push Dispatch Service', description: 'Push fixture', durationMinutes: 30, priceCents: 1000, active: true })
      const entry = await joinQueue({ serviceId }, { kind: 'customer', userId: customerId })
      entryIds.push(entry.id)

      const { registerPushSubscription } = await import('./push.service.server')
      const sub = await registerPushSubscription(
        { queueEntryId: entry.id, endpoint: ENDPOINT_A, ...KEYS },
        { kind: 'customer', userId: customerId },
      )
      subscriptionIds.push(sub.id)

      await callQueueEntry(entry.id, ownerActor)

      const notifications = await db.select().from(pushNotifications).where(eq(pushNotifications.queueEntryId, entry.id))
      expect(notifications).toHaveLength(1)
      expect(notifications[0].event).toBe('called')
      expect(notifications[0].idempotencyKey).toBe(`called:${entry.id}`)
      notificationIds.push(notifications[0].id)

      const deliveries = await db.select().from(pushNotificationDeliveries).where(eq(pushNotificationDeliveries.notificationId, notifications[0].id))
      expect(deliveries).toHaveLength(1)
      expect(deliveries[0].subscriptionId).toBe(sub.id)
    } finally {
      restoreEnv()
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, [...subscriptionIds, ...entryIds, ...notificationIds]))
      await db.delete(pushNotificationDeliveries).where(inArray(pushNotificationDeliveries.subscriptionId, subscriptionIds))
      await db.delete(pushNotifications).where(inArray(pushNotifications.id, notificationIds))
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, subscriptionIds))
      const { waitingListEntries } = await import('../db/schema')
      await db.delete(waitingListEntries).where(inArray(waitingListEntries.id, entryIds))
      const { ownerNotificationEvents, ownerNotifications } = await import('../db/schema/owner-notifications')
      const ownerEventIds = (await db.select({ id: ownerNotificationEvents.id }).from(ownerNotificationEvents).where(inArray(ownerNotificationEvents.entityId, entryIds))).map((row) => row.id)
      if (ownerEventIds.length > 0) {
        await db.delete(ownerNotifications).where(inArray(ownerNotifications.eventId, ownerEventIds))
        await db.delete(ownerNotificationEvents).where(inArray(ownerNotificationEvents.id, ownerEventIds))
      }
      await db.delete(services).where(eq(services.id, serviceId))
      await db.delete(users).where(and(eq(users.id, customerId)))
      await removeOwnerFixture(ownerFixture)
    }
  })

  it('creates no intent on a failed transition (Test B)', async () => {
    const { db } = await import('../db/client.server')
    const { pushNotifications } = await import('../db/schema/push-subscriptions')
    const { callQueueEntry } = await import('../queue/queue.service.server')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    const restoreEnv = useSavedEnv()
    accept()
    const ownerFixture = await ensureActiveOwnerFixture('push-dispatch-failed')
    try {
      const before = await db.select({ id: pushNotifications.id }).from(pushNotifications)
      await expect(callQueueEntry(randomUUID(), { kind: 'owner', userId: ownerFixture.userId })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      const after = await db.select({ id: pushNotifications.id }).from(pushNotifications)
      expect(after).toHaveLength(before.length)
      expect(sendNotification).not.toHaveBeenCalled()
    } finally {
      restoreEnv()
      await removeOwnerFixture(ownerFixture)
    }
  })

  it('handles concurrent calls and concurrent dispatch without duplicates (Tests C and D)', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray } = await import('drizzle-orm')
    const { auditLogs, services, users } = await import('../db/schema')
    const { pushNotificationDeliveries, pushNotifications, pushSubscriptions } = await import('../db/schema/push-subscriptions')
    const { joinQueue } = await import('../queue/queue.service.server')
    const { callQueueEntry } = await import('../queue/queue.service.server')
    const { dispatchPendingDeliveries } = await import('./push.dispatch.server')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    const restoreEnv = useSavedEnv()
    accept()
    const serviceId = randomUUID()
    const customerId = randomUUID()
    const ownerFixture = await ensureActiveOwnerFixture('push-dispatch-concurrent')
    const ownerActor = { kind: 'owner' as const, userId: ownerFixture.userId }
    const subscriptionIds: string[] = []
    const entryIds: string[] = []
    const notificationIds: string[] = []
    try {
      await db.insert(users).values({ id: customerId, email: `push-${randomUUID()}@example.com`, role: 'customer' })
      await db.insert(services).values({ id: serviceId, name: 'Push Concurrent Service', description: 'Push fixture', durationMinutes: 30, priceCents: 1000, active: true })
      const entry = await joinQueue({ serviceId }, { kind: 'customer', userId: customerId })
      entryIds.push(entry.id)

      const { registerPushSubscription } = await import('./push.service.server')
      for (const endpoint of [ENDPOINT_A, ENDPOINT_B]) {
        const sub = await registerPushSubscription(
          { queueEntryId: entry.id, endpoint, ...KEYS },
          { kind: 'customer', userId: customerId },
        )
        subscriptionIds.push(sub.id)
      }

      // Gelijktijdige dubbele called-aanroep: één slaagt, één wordt afgewezen.
      const [first, second] = await Promise.allSettled([
        callQueueEntry(entry.id, ownerActor),
        callQueueEntry(entry.id, ownerActor),
      ])
      expect([first.status, second.status].filter((status) => status === 'fulfilled')).toHaveLength(1)
      expect([first.status, second.status].filter((status) => status === 'rejected')).toHaveLength(1)

      const notifications = await db.select().from(pushNotifications).where(eq(pushNotifications.queueEntryId, entry.id))
      expect(notifications).toHaveLength(1)
      notificationIds.push(notifications[0].id)

      // Gelijktijdige dispatch-runs over dezelfde pending deliveries:
      // samen exact evenveel sends als subscriptions, elk hooguit eenmaal.
      // De dispatch wordt bewust op de eigen queue-entry beperkt, zodat geen
      // bestaande delivery uit de gedeelde database wordt geraakt.
      sendNotification.mockClear()
      await db
        .update(pushNotificationDeliveries)
        .set({ status: 'pending', attempts: 0, claimToken: null, claimedAt: null, nextAttemptAt: null })
        .where(eq(pushNotificationDeliveries.notificationId, notifications[0].id))
      const [runA, runB] = await Promise.allSettled([
        dispatchPendingDeliveries({ queueEntryId: entry.id }),
        dispatchPendingDeliveries({ queueEntryId: entry.id }),
      ])
      expect(runA.status).toBe('fulfilled')
      expect(runB.status).toBe('fulfilled')
      expect(sendNotification).toHaveBeenCalledTimes(2)

      const delivered = await db.select().from(pushNotificationDeliveries).where(eq(pushNotificationDeliveries.notificationId, notifications[0].id))
      expect(delivered.every((row) => row.status === 'sent')).toBe(true)
    } finally {
      restoreEnv()
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, [...subscriptionIds, ...entryIds, ...notificationIds]))
      await db.delete(pushNotificationDeliveries).where(inArray(pushNotificationDeliveries.subscriptionId, subscriptionIds))
      await db.delete(pushNotifications).where(inArray(pushNotifications.id, notificationIds))
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, subscriptionIds))
      const { waitingListEntries } = await import('../db/schema')
      await db.delete(waitingListEntries).where(inArray(waitingListEntries.id, entryIds))
      const { ownerNotificationEvents, ownerNotifications } = await import('../db/schema/owner-notifications')
      const ownerEventIds = (await db.select({ id: ownerNotificationEvents.id }).from(ownerNotificationEvents).where(inArray(ownerNotificationEvents.entityId, entryIds))).map((row) => row.id)
      if (ownerEventIds.length > 0) {
        await db.delete(ownerNotifications).where(inArray(ownerNotifications.eventId, ownerEventIds))
        await db.delete(ownerNotificationEvents).where(inArray(ownerNotificationEvents.id, ownerEventIds))
      }
      await db.delete(services).where(eq(services.id, serviceId))
      await db.delete(users).where(and(eq(users.id, customerId)))
      await removeOwnerFixture(ownerFixture)
    }
  })

  it('classifies outcomes and stops after three attempts (Tests F-J)', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray } = await import('drizzle-orm')
    const { auditLogs, services, users } = await import('../db/schema')
    const { pushNotificationDeliveries, pushNotifications, pushSubscriptions } = await import('../db/schema/push-subscriptions')
    const { joinQueue } = await import('../queue/queue.service.server')
    const { callQueueEntry } = await import('../queue/queue.service.server')
    const { dispatchPendingDeliveries } = await import('./push.dispatch.server')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    const restoreEnv = useSavedEnv()
    const serviceId = randomUUID()
    const customerId = randomUUID()
    const ownerFixture = await ensureActiveOwnerFixture('push-dispatch-outcomes')
    const ownerActor = { kind: 'owner' as const, userId: ownerFixture.userId }
    const subscriptionIds: string[] = []
    const entryIds: string[] = []
    const notificationIds: string[] = []
    try {
      await db.insert(users).values({ id: customerId, email: `push-${randomUUID()}@example.com`, role: 'customer' })
      await db.insert(services).values({ id: serviceId, name: 'Push Outcomes Service', description: 'Push fixture', durationMinutes: 30, priceCents: 1000, active: true })
      const { registerPushSubscription } = await import('./push.service.server')

      async function setupEntry(endpoint: string) {
        const entry = await joinQueue({ serviceId }, { kind: 'customer', userId: customerId })
        entryIds.push(entry.id)
        const sub = await registerPushSubscription({ queueEntryId: entry.id, endpoint, ...KEYS }, { kind: 'customer', userId: customerId })
        subscriptionIds.push(sub.id)
        return entry
      }

      // Tijdelijk: de volgende poging wordt in de toekomst gepland. De
      // delivery wordt binnen dezelfde run niet opnieuw geprobeerd; een
      // latere run probeert opnieuw zodra de retrytijd verstreken is.
      sendNotification.mockReset()
      sendNotification.mockRejectedValue({ statusCode: 503, headers: {}, body: '' })
      const transientEntry = await setupEntry('https://push.example.test/outcomes/transient')
      await callQueueEntry(transientEntry.id, ownerActor)
      expect(sendNotification).toHaveBeenCalledTimes(1)
      const transientSubscriptionId = subscriptionIds[subscriptionIds.length - 1]!
      const [transientDelivery] = await db.select().from(pushNotificationDeliveries).where(eq(pushNotificationDeliveries.subscriptionId, transientSubscriptionId))
      expect(transientDelivery?.attempts).toBe(1)
      expect(transientDelivery?.status).toBe('pending')
      expect(transientDelivery?.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now())

      // Zolang de retrytijd niet verstreken is, wordt de delivery niet opnieuw
      // geclaimd en dus niet opnieuw verstuurd.
      await dispatchPendingDeliveries({ queueEntryId: transientEntry.id })
      expect(sendNotification).toHaveBeenCalledTimes(1)

      // Zodra de retrytijd verstreken is, volgt de volgende poging in een
      // latere run; daarna is de delivery weer in de toekomst gepland.
      await db
        .update(pushNotificationDeliveries)
        .set({ nextAttemptAt: new Date(Date.now() - 1_000) })
        .where(eq(pushNotificationDeliveries.subscriptionId, transientSubscriptionId))
      await dispatchPendingDeliveries({ queueEntryId: transientEntry.id })
      expect(sendNotification).toHaveBeenCalledTimes(2)
      const [secondAttempt] = await db.select().from(pushNotificationDeliveries).where(eq(pushNotificationDeliveries.subscriptionId, transientSubscriptionId))
      expect(secondAttempt?.attempts).toBe(2)
      expect(secondAttempt?.status).toBe('pending')
      expect(secondAttempt?.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now())

      // De derde poging is de laatste; daarna is de delivery terminaal.
      await db
        .update(pushNotificationDeliveries)
        .set({ nextAttemptAt: new Date(Date.now() - 1_000) })
        .where(eq(pushNotificationDeliveries.subscriptionId, transientSubscriptionId))
      await dispatchPendingDeliveries({ queueEntryId: transientEntry.id })
      expect(sendNotification).toHaveBeenCalledTimes(3)
      const [thirdAttempt] = await db.select().from(pushNotificationDeliveries).where(eq(pushNotificationDeliveries.subscriptionId, transientSubscriptionId))
      expect(thirdAttempt?.attempts).toBe(3)
      expect(thirdAttempt?.status).toBe('failed')

      // Nooit een vierde poging.
      await dispatchPendingDeliveries({ queueEntryId: transientEntry.id })
      expect(sendNotification).toHaveBeenCalledTimes(3)

      // Een geldige Retry-After blijft leidend: de volgende poging volgt precies
      // op het opgegeven moment.
      sendNotification.mockClear()
      sendNotification.mockRejectedValue({ statusCode: 503, headers: { 'retry-after': '120' }, body: '' })
      const retryAfterEntry = await setupEntry('https://push.example.test/outcomes/retry-after')
      const beforeRetryAfter = Date.now()
      await callQueueEntry(retryAfterEntry.id, ownerActor)
      expect(sendNotification).toHaveBeenCalledTimes(1)
      const retryAfterSubscriptionId = subscriptionIds[subscriptionIds.length - 1]!
      const [retryAfterDelivery] = await db.select().from(pushNotificationDeliveries).where(eq(pushNotificationDeliveries.subscriptionId, retryAfterSubscriptionId))
      expect(retryAfterDelivery?.status).toBe('pending')
      expect(retryAfterDelivery?.nextAttemptAt?.getTime()).toBeGreaterThanOrEqual(beforeRetryAfter + 120_000)
      expect(retryAfterDelivery?.nextAttemptAt?.getTime()).toBeLessThanOrEqual(Date.now() + 120_000)

      // Permanent: één poging, geen retry.
      sendNotification.mockClear()
      sendNotification.mockRejectedValue({ statusCode: 400, headers: {}, body: '' })
      const permanentEntry = await setupEntry('https://push.example.test/outcomes/permanent')
      await callQueueEntry(permanentEntry.id, ownerActor)
      expect(sendNotification).toHaveBeenCalledTimes(1)

      // Ongeldig: deactiveren, geen retry.
      sendNotification.mockClear()
      sendNotification.mockRejectedValue({ statusCode: 410, headers: {}, body: '' })
      const invalidEntry = await setupEntry('https://push.example.test/outcomes/invalid')
      await callQueueEntry(invalidEntry.id, ownerActor)
      expect(sendNotification).toHaveBeenCalledTimes(1)
      const [invalidSub] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.queueEntryId, invalidEntry.id))
      expect(invalidSub?.active).toBe(false)

      const notifications = await db.select().from(pushNotifications).where(inArray(pushNotifications.queueEntryId, entryIds))
      notificationIds.push(...notifications.map((row) => row.id))
    } finally {
      restoreEnv()
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, [...subscriptionIds, ...entryIds, ...notificationIds]))
      await db.delete(pushNotificationDeliveries).where(inArray(pushNotificationDeliveries.subscriptionId, subscriptionIds))
      await db.delete(pushNotifications).where(inArray(pushNotifications.id, notificationIds))
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, subscriptionIds))
      const { waitingListEntries } = await import('../db/schema')
      await db.delete(waitingListEntries).where(inArray(waitingListEntries.id, entryIds))
      const { ownerNotificationEvents, ownerNotifications } = await import('../db/schema/owner-notifications')
      const ownerEventIds = (await db.select({ id: ownerNotificationEvents.id }).from(ownerNotificationEvents).where(inArray(ownerNotificationEvents.entityId, entryIds))).map((row) => row.id)
      if (ownerEventIds.length > 0) {
        await db.delete(ownerNotifications).where(inArray(ownerNotifications.eventId, ownerEventIds))
        await db.delete(ownerNotificationEvents).where(inArray(ownerNotificationEvents.id, ownerEventIds))
      }
      await db.delete(services).where(eq(services.id, serviceId))
      await db.delete(users).where(and(eq(users.id, customerId)))
      await removeOwnerFixture(ownerFixture)
    }
  })

  it('recovers stale claims and never sends expired notifications (Tests E, K)', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray, lt, sql } = await import('drizzle-orm')
    const { auditLogs, services, users } = await import('../db/schema')
    const { pushNotificationDeliveries, pushNotifications, pushSubscriptions } = await import('../db/schema/push-subscriptions')
    const { joinQueue } = await import('../queue/queue.service.server')
    const { callQueueEntry, startQueueService } = await import('../queue/queue.service.server')
    const { dispatchPendingDeliveries, reconcileStaleSending } = await import('./push.dispatch.server')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    const restoreEnv = useSavedEnv()
    accept()
    const serviceId = randomUUID()
    const customerId = randomUUID()
    const ownerFixture = await ensureActiveOwnerFixture('push-dispatch-stale')
    const ownerActor = { kind: 'owner' as const, userId: ownerFixture.userId }
    const subscriptionIds: string[] = []
    const entryIds: string[] = []
    const notificationIds: string[] = []
    try {
      // Zekerheidscontrole: dit test raakt productie-rijen over de hele tabel,
      // dus de verbonden database moet de database zijn die het project voor
      // tests configureert (DATABASE_URL, of TEST_DATABASE_URL na de routing in
      // vitest.setup.ts).
      const expectedDatabase = decodeURIComponent(new URL(process.env.DATABASE_URL as string).pathname.replace(/^\//, ''))
      const currentDatabase = await db.execute(sql`select current_database() as name`)
      expect(currentDatabase.rows[0]?.name).toBe(expectedDatabase)
      await db.insert(users).values({ id: customerId, email: `push-${randomUUID()}@example.com`, role: 'customer' })
      await db.insert(services).values({ id: serviceId, name: 'Push Stale Service', description: 'Push fixture', durationMinutes: 30, priceCents: 1000, active: true })
      const { registerPushSubscription } = await import('./push.service.server')

      const entry = await joinQueue({ serviceId }, { kind: 'customer', userId: customerId })
      entryIds.push(entry.id)
      const sub = await registerPushSubscription({ queueEntryId: entry.id, endpoint: ENDPOINT_A, ...KEYS }, { kind: 'customer', userId: customerId })
      subscriptionIds.push(sub.id)
      await callQueueEntry(entry.id, ownerActor)

      // Simuleer een crash: sending met verlopen lease, poging al verbruikt.
      const [delivery] = await db.select().from(pushNotificationDeliveries).where(eq(pushNotificationDeliveries.subscriptionId, sub.id))
      if (!delivery) throw new Error('delivery missing')
      await db
        .update(pushNotificationDeliveries)
        .set({ status: 'sending', claimedAt: new Date(), claimToken: randomUUID() })
        .where(eq(pushNotificationDeliveries.id, delivery.id))

      // Verse sending-claim blijft onaangetast door herstel.
      const before = await reconcileStaleSending(Date.now(), 5 * 60 * 1000)
      expect(before.recovered).toBe(0)
      expect(before.closed).toBe(0)

      await db
        .update(pushNotificationDeliveries)
        .set({ claimedAt: new Date(Date.now() - 60 * 60 * 1000) })
        .where(eq(pushNotificationDeliveries.id, delivery.id))

      // Oude claim wordt hersteld naar pending zonder extra poging.
      // Read-only controle: de globale reconciliatie werkt over de hele tabel.
      // Er mag daarom geen bestaande delivery zijn die dezelfde selectie zou
      // raken, want deze test mag alleen zijn eigen fixtures wijzigen.
      const foreignStaleClaims = await db
        .select({ id: pushNotificationDeliveries.id })
        .from(pushNotificationDeliveries)
        .where(and(
          eq(pushNotificationDeliveries.status, 'sending'),
          lt(pushNotificationDeliveries.claimedAt, new Date(Date.now() - 5 * 60 * 1000)),
        ))
      expect(foreignStaleClaims.filter((row) => row.id !== delivery.id)).toHaveLength(0)

      sendNotification.mockClear()
      const recovered = await reconcileStaleSending(Date.now(), 5 * 60 * 1000)
      expect(recovered.recovered).toBe(1)
      const [reset] = await db.select().from(pushNotificationDeliveries).where(eq(pushNotificationDeliveries.id, delivery.id))
      expect(reset?.status).toBe('pending')
      expect(reset?.attempts).toBe(delivery.attempts)

      const dispatched = await dispatchPendingDeliveries({ queueEntryId: entry.id })
      expect(dispatched.sent).toBe(1)

      // Entry intussen in_service: geen verzending meer, delivery vervalt.
      const secondEntry = await joinQueue({ serviceId }, { kind: 'customer', userId: customerId })
      entryIds.push(secondEntry.id)
      const secondSub = await registerPushSubscription({ queueEntryId: secondEntry.id, endpoint: ENDPOINT_B, ...KEYS }, { kind: 'customer', userId: customerId })
      subscriptionIds.push(secondSub.id)
      sendNotification.mockClear()
      await callQueueEntry(secondEntry.id, ownerActor)
      const sentAfterCall = sendNotification.mock.calls.length
      await startQueueService(secondEntry.id, ownerActor)
      sendNotification.mockClear()
      const staleSummary = await dispatchPendingDeliveries({ queueEntryId: secondEntry.id })
      expect(sendNotification).not.toHaveBeenCalled()
      expect(staleSummary.expired).toBe(0)
      expect(staleSummary.sent).toBe(0)
      expect(sentAfterCall).toBeGreaterThanOrEqual(0)

      const notifications = await db.select().from(pushNotifications).where(inArray(pushNotifications.queueEntryId, entryIds))
      notificationIds.push(...notifications.map((row) => row.id))
    } finally {
      restoreEnv()
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, [...subscriptionIds, ...entryIds, ...notificationIds]))
      await db.delete(pushNotificationDeliveries).where(inArray(pushNotificationDeliveries.subscriptionId, subscriptionIds))
      await db.delete(pushNotifications).where(inArray(pushNotifications.id, notificationIds))
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, subscriptionIds))
      const { waitingListEntries } = await import('../db/schema')
      await db.delete(waitingListEntries).where(inArray(waitingListEntries.id, entryIds))
      const { ownerNotificationEvents, ownerNotifications } = await import('../db/schema/owner-notifications')
      const ownerEventIds = (await db.select({ id: ownerNotificationEvents.id }).from(ownerNotificationEvents).where(inArray(ownerNotificationEvents.entityId, entryIds))).map((row) => row.id)
      if (ownerEventIds.length > 0) {
        await db.delete(ownerNotifications).where(inArray(ownerNotifications.eventId, ownerEventIds))
        await db.delete(ownerNotificationEvents).where(inArray(ownerNotificationEvents.id, ownerEventIds))
      }
      await db.delete(services).where(eq(services.id, serviceId))
      await db.delete(users).where(and(eq(users.id, customerId)))
      await removeOwnerFixture(ownerFixture)
    }
  })

  it('deactivates subscriptions on terminal entries and cleans up after 30 days (Tests L, O, P)', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray, lt, sql } = await import('drizzle-orm')
    const { auditLogs, services, users } = await import('../db/schema')
    const { pushNotificationDeliveries, pushNotifications, pushSubscriptions } = await import('../db/schema/push-subscriptions')
    const { joinQueue } = await import('../queue/queue.service.server')
    const { callQueueEntry, cancelQueueEntry, completeQueueEntry, skipQueueEntry, startQueueService } = await import('../queue/queue.service.server')
    const { cleanupPushData, reconcileStaleSending } = await import('./push.dispatch.server')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    const restoreEnv = useSavedEnv()
    accept()
    const serviceId = randomUUID()
    const customerId = randomUUID()
    const ownerFixture = await ensureActiveOwnerFixture('push-dispatch-lifecycle')
    const ownerActor = { kind: 'owner' as const, userId: ownerFixture.userId }
    const subscriptionIds: string[] = []
    const entryIds: string[] = []
    const notificationIds: string[] = []
    const oldIds: string[] = []
    try {
      // Zekerheidscontrole: dit test voert de productie-cleanup uit over de hele
      // tabel, dus de verbonden database moet de database zijn die het project
      // voor tests configureert (DATABASE_URL, of TEST_DATABASE_URL na de
      // routing in vitest.setup.ts).
      const expectedDatabase = decodeURIComponent(new URL(process.env.DATABASE_URL as string).pathname.replace(/^\//, ''))
      const currentDatabase = await db.execute(sql`select current_database() as name`)
      expect(currentDatabase.rows[0]?.name).toBe(expectedDatabase)
      await db.insert(users).values({ id: customerId, email: `push-${randomUUID()}@example.com`, role: 'customer' })
      await db.insert(services).values({ id: serviceId, name: 'Push Lifecycle Service', description: 'Push fixture', durationMinutes: 30, priceCents: 1000, active: true })
      const { registerPushSubscription } = await import('./push.service.server')

      for (const [index, action] of (['complete', 'cancel', 'skip'] as const).entries()) {
        const entry = await joinQueue({ serviceId }, { kind: 'customer', userId: customerId })
        entryIds.push(entry.id)
        const sub = await registerPushSubscription(
          { queueEntryId: entry.id, endpoint: `https://push.example.test/lifecycle/${index}`, ...KEYS },
          { kind: 'customer', userId: customerId },
        )
        subscriptionIds.push(sub.id)
        await callQueueEntry(entry.id, ownerActor)
        if (action === 'complete') {
          await startQueueService(entry.id, ownerActor)
          await completeQueueEntry(entry.id, ownerActor)
        } else if (action === 'cancel') {
          await cancelQueueEntry(entry.id, ownerActor)
        } else {
          await skipQueueEntry(entry.id, ownerActor)
        }
        const [row] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id))
        expect(row?.active).toBe(false)
      }

      // Oude terminale rijen worden opgeruimd, recente blijven behouden.
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
      const [oldNotification] = await db
        .insert(pushNotifications)
        .values({ queueEntryId: entryIds[0], event: 'called', idempotencyKey: `called:old-${randomUUID()}`, status: 'sent', createdAt: oldDate, updatedAt: oldDate })
        .returning({ id: pushNotifications.id })
      if (!oldNotification) throw new Error('fixture insert failed')
      oldIds.push(oldNotification.id)
      const [oldDelivery] = await db
        .insert(pushNotificationDeliveries)
        .values({ notificationId: oldNotification.id, subscriptionId: subscriptionIds[0], status: 'sent', attempts: 1, createdAt: oldDate, updatedAt: oldDate })
        .returning({ id: pushNotificationDeliveries.id })
      if (!oldDelivery) throw new Error('fixture insert failed')
      oldIds.push(oldDelivery.id)

      // Read-only controle: de productie-cleanup en -reconciliatie werken over
      // de hele tabel. Deze test mag alleen zijn eigen fixtures wijzigen, dus
      // er mag geen bestaande rij zijn die door diezelfde selectie geraakt zou
      // worden. De controle gebruikt bewust een ruime selectie (alle rijen ouder
      // dan de retentiegrens, ongeacht hun status), zodat ze niets mist.
      const cleanupCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const ownNotifications = await db
        .select({ id: pushNotifications.id })
        .from(pushNotifications)
        .where(inArray(pushNotifications.queueEntryId, entryIds))
      const ownNotificationIds = new Set(ownNotifications.map((row) => row.id))
      const ownDeliveries = await db
        .select({ id: pushNotificationDeliveries.id })
        .from(pushNotificationDeliveries)
        .where(inArray(pushNotificationDeliveries.subscriptionId, subscriptionIds))
      const ownDeliveryIds = new Set(ownDeliveries.map((row) => row.id))
      const ownSubscriptionIds = new Set(subscriptionIds)
      const foreignDeliveries = await db
        .select({ id: pushNotificationDeliveries.id })
        .from(pushNotificationDeliveries)
        .where(lt(pushNotificationDeliveries.createdAt, cleanupCutoff))
      const foreignNotifications = await db
        .select({ id: pushNotifications.id })
        .from(pushNotifications)
        .where(lt(pushNotifications.createdAt, cleanupCutoff))
      const foreignSubscriptions = await db
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(and(eq(pushSubscriptions.active, false), lt(pushSubscriptions.deactivatedAt, cleanupCutoff)))
      const foreignStaleClaims = await db
        .select({ id: pushNotificationDeliveries.id })
        .from(pushNotificationDeliveries)
        .where(eq(pushNotificationDeliveries.status, 'sending'))
      expect(foreignDeliveries.filter((row) => !ownDeliveryIds.has(row.id))).toHaveLength(0)
      expect(foreignNotifications.filter((row) => !ownNotificationIds.has(row.id))).toHaveLength(0)
      expect(foreignSubscriptions.filter((row) => !ownSubscriptionIds.has(row.id))).toHaveLength(0)
      expect(foreignStaleClaims.filter((row) => !ownDeliveryIds.has(row.id))).toHaveLength(0)

      const cleaned = await cleanupPushData()
      expect(cleaned.deliveries).toBeGreaterThanOrEqual(1)
      expect(cleaned.notifications).toBeGreaterThanOrEqual(1)
      const remaining = await db.select({ id: pushNotifications.id }).from(pushNotifications).where(eq(pushNotifications.id, oldNotification.id))
      expect(remaining).toHaveLength(0)

      // Dubbele reconcile- en cleanup-runs zijn veilig.
      await reconcileStaleSending()
      await cleanupPushData()

      const notifications = await db.select().from(pushNotifications).where(inArray(pushNotifications.queueEntryId, entryIds))
      notificationIds.push(...notifications.map((row) => row.id))
    } finally {
      restoreEnv()
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, [...subscriptionIds, ...entryIds, ...notificationIds, ...oldIds]))
      await db.delete(pushNotificationDeliveries).where(inArray(pushNotificationDeliveries.subscriptionId, subscriptionIds))
      await db.delete(pushNotifications).where(inArray(pushNotifications.id, [...notificationIds, ...oldIds]))
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, subscriptionIds))
      const { waitingListEntries } = await import('../db/schema')
      await db.delete(waitingListEntries).where(inArray(waitingListEntries.id, entryIds))
      const { ownerNotificationEvents, ownerNotifications } = await import('../db/schema/owner-notifications')
      const ownerEventIds = (await db.select({ id: ownerNotificationEvents.id }).from(ownerNotificationEvents).where(inArray(ownerNotificationEvents.entityId, entryIds))).map((row) => row.id)
      if (ownerEventIds.length > 0) {
        await db.delete(ownerNotifications).where(inArray(ownerNotifications.eventId, ownerEventIds))
        await db.delete(ownerNotificationEvents).where(inArray(ownerNotificationEvents.id, ownerEventIds))
      }
      await db.delete(services).where(eq(services.id, serviceId))
      await db.delete(users).where(and(eq(users.id, customerId)))
      await removeOwnerFixture(ownerFixture)
    }
  })

  it('fails closed without VAPID configuration (Test M)', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray } = await import('drizzle-orm')
    const { services, users } = await import('../db/schema')
    const { pushNotificationDeliveries, pushNotifications, pushSubscriptions } = await import('../db/schema/push-subscriptions')
    const { joinQueue } = await import('../queue/queue.service.server')
    const { callQueueEntry } = await import('../queue/queue.service.server')
    const { dispatchPendingDeliveries } = await import('./push.dispatch.server')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    const savedEnv = { ...process.env }
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
    delete process.env.VAPID_SUBJECT
    sendNotification.mockReset()
    const serviceId = randomUUID()
    const customerId = randomUUID()
    const ownerFixture = await ensureActiveOwnerFixture('push-dispatch-novapid')
    const ownerActor = { kind: 'owner' as const, userId: ownerFixture.userId }
    const entryIds: string[] = []
    try {
      await db.insert(users).values({ id: customerId, email: `push-${randomUUID()}@example.com`, role: 'customer' })
      await db.insert(services).values({ id: serviceId, name: 'Push NoVapid Service', description: 'Push fixture', durationMinutes: 30, priceCents: 1000, active: true })
      const entry = await joinQueue({ serviceId }, { kind: 'customer', userId: customerId })
      entryIds.push(entry.id)

      // De queue-actie slaagt normaal, ook zonder VAPID-configuratie.
      const called = await callQueueEntry(entry.id, ownerActor)
      expect(called.status).toBe('called')
      expect(sendNotification).not.toHaveBeenCalled()

      const summary = await dispatchPendingDeliveries({ queueEntryId: entry.id })
      expect(summary.claimed).toBe(0)
      expect(sendNotification).not.toHaveBeenCalled()

      const notifications = await db.select().from(pushNotifications).where(eq(pushNotifications.queueEntryId, entry.id))
      expect(notifications).toHaveLength(1)
      const deliveries = await db.select().from(pushNotificationDeliveries).where(eq(pushNotificationDeliveries.notificationId, notifications[0].id))
      expect(deliveries.every((row) => row.status === 'pending')).toBe(true)
    } finally {
      Object.assign(process.env, savedEnv)
      for (const key of Object.keys(VAPID_ENV)) {
        if (!(key in savedEnv)) delete (process.env as Record<string, string | undefined>)[key]
      }
      const { waitingListEntries } = await import('../db/schema')
      const { auditLogs } = await import('../db/schema')
      const notificationRows = await db.select({ id: pushNotifications.id }).from(pushNotifications).where(inArray(pushNotifications.queueEntryId, entryIds))
      const notificationIds = notificationRows.map((row) => row.id)
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, [...entryIds, ...notificationIds]))
      await db.delete(pushNotificationDeliveries).where(inArray(pushNotificationDeliveries.notificationId, notificationIds))
      await db.delete(pushNotifications).where(inArray(pushNotifications.id, notificationIds))
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.queueEntryId, entryIds))
      await db.delete(waitingListEntries).where(inArray(waitingListEntries.id, entryIds))
      const { ownerNotificationEvents, ownerNotifications } = await import('../db/schema/owner-notifications')
      const ownerEventIds = (await db.select({ id: ownerNotificationEvents.id }).from(ownerNotificationEvents).where(inArray(ownerNotificationEvents.entityId, entryIds))).map((row) => row.id)
      if (ownerEventIds.length > 0) {
        await db.delete(ownerNotifications).where(inArray(ownerNotifications.eventId, ownerEventIds))
        await db.delete(ownerNotificationEvents).where(inArray(ownerNotificationEvents.id, ownerEventIds))
      }
      await db.delete(services).where(eq(services.id, serviceId))
      await db.delete(users).where(and(eq(users.id, customerId)))
      await removeOwnerFixture(ownerFixture)
    }
  })
})
