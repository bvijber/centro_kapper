import { randomUUID } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

const sendNotification = vi.hoisted(() => vi.fn())

vi.mock('web-push', () => ({
  default: { sendNotification, generateVAPIDKeys: vi.fn() },
}))

import {
  ownerPushSchemaAvailable,
  reportOwnerPushSchemaBlocked,
} from '../../tests/helpers/owner-push-schema'

/**
 * Integratietests voor de dispatch van eigenaarpush.
 *
 * `web-push` wordt gemockt: er verlaat geen echte push de machine. De
 * database is de database die het project voor tests configureert; de test
 * raakt uitsluitend de eigen fixtures. De tabellen komen uit migratie 0013;
 * zolang die migratie niet is toegepast, worden de tests expliciet
 * overgeslagen en gemeld als geblokkeerd.
 */
const databaseAvailable = Boolean(process.env.DATABASE_URL)
const schemaAvailable = databaseAvailable ? await ownerPushSchemaAvailable() : false
if (databaseAvailable && !schemaAvailable) reportOwnerPushSchemaBlocked()
const suiteTitle = schemaAvailable
  ? 'owner push dispatch integration'
  : 'owner push dispatch integration [GEBLOKKEERD: migratie 0013 is nog niet toegepast]'

const ENDPOINT_A = 'https://push.example.test/owner/dispatch-aaa111'
const ENDPOINT_B = 'https://push.example.test/owner/dispatch-bbb222'
const KEYS = {
  p256dh: 'BL7ELU24fJTAlH5Kyl8N6BDCac8u8li_U5PIwG963MOvdYs9s7LSzj8x_7v7RFdLZ9Eap50PiiyF5K0TDAis7t0',
  auth: 'juarI8x__VnHvsOgfeAPHg',
}
const VAPID_ENV = {
  VAPID_PUBLIC_KEY: 'test-public-key',
  VAPID_PRIVATE_KEY: 'test-private-key',
  VAPID_SUBJECT: 'mailto:test@example.test',
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

function accept() {
  sendNotification.mockResolvedValue({ statusCode: 201, headers: {}, body: '' })
}

function sendsFor(endpoint: string) {
  return sendNotification.mock.calls.filter((call) => (call[0] as { endpoint: string }).endpoint === endpoint)
}

describe.skipIf(!schemaAvailable)(suiteTitle, () => {
  it('koppelt een eigenaargebeurtenis aan één push per apparaat en verstuurt geen tweede keer', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray, sql } = await import('drizzle-orm')
    const { ownerNotificationEvents } = await import('../db/schema/owner-notifications')
    const { ownerPushDeliveries, ownerPushSubscriptions } = await import('../db/schema/owner-push-subscriptions')
    const { services, users } = await import('../db/schema')
    const { joinQueue } = await import('../queue/queue.service.server')
    const { registerOwnerPushSubscription } = await import('./owner-push.service.server')
    const { buildOwnerPushPayload, dispatchOwnerPushDeliveries } = await import('./owner-push.dispatch.server')
    const { ownerNotificationDedupKey } = await import('../notifications/owner-notification.events')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    const expectedDatabase = decodeURIComponent(
      new URL(process.env.DATABASE_URL as string).pathname.replace(/^\//, ''),
    )
    const currentDatabase = await db.execute(sql`select current_database() as name`)
    expect(currentDatabase.rows[0]?.name).toBe(expectedDatabase)

    const restoreEnv = useSavedEnv()
    accept()
    const suffix = randomUUID()
    const customerId = randomUUID()
    const serviceId = randomUUID()
    const customerEmail = `owner-push-${suffix}@example.com`
    const ownerFixture = await ensureActiveOwnerFixture('owner-push-dispatch')
    const createdSubscriptionIds: string[] = []
    const createdEventIds: string[] = []
    const createdEntryIds: string[] = []
    try {
      await db.insert(users).values({ id: customerId, email: customerEmail, role: 'customer' })
      await db.insert(services).values({
        id: serviceId,
        name: 'Owner Push Service',
        description: 'Owner push fixture',
        durationMinutes: 30,
        priceCents: 1000,
        active: true,
      })
      const subscription = await registerOwnerPushSubscription({ endpoint: ENDPOINT_A, ...KEYS }, ownerFixture.userId)
      createdSubscriptionIds.push(subscription.id)

      const entry = await joinQueue({ serviceId }, { kind: 'customer', userId: customerId })
      createdEntryIds.push(entry.id)

      // De businessactie levert een duurzaam gebeurtenis op.
      const events = await db
        .select({ id: ownerNotificationEvents.id, event: ownerNotificationEvents.event })
        .from(ownerNotificationEvents)
        .where(
          and(
            eq(ownerNotificationEvents.event, 'queue_joined'),
            eq(ownerNotificationEvents.entityId, entry.id),
          ),
        )
      expect(events).toHaveLength(1)
      createdEventIds.push(events[0]!.id)

      // Zorg dat de delivery voor deze gebeurtenis daadwerkelijk is
      // verwerkt, ook wanneer er recentere gebeurtenissen in de wacht
      // staan uit andere testruns.
      await dispatchOwnerPushDeliveries({ maxDeliveries: 500 })

      // Het gebeurtenis is gekoppeld aan precies één delivery voor dit apparaat.
      const deliveries = await db
        .select()
        .from(ownerPushDeliveries)
        .where(eq(ownerPushDeliveries.eventId, events[0]!.id))
      expect(deliveries).toHaveLength(1)
      expect(deliveries[0]!.subscriptionId).toBe(subscription.id)
      expect(deliveries[0]!.status).toBe('sent')
      expect(deliveries[0]!.attempts).toBe(1)

      // De push is daadwerkelijk verstuurd, zonder persoonsgegevens. De
      // send van deze gebeurtenis wordt op de technische tag gezocht; een
      // achtergrond van andere gebeurtenissen mag de assertie niet raken.
      const sends = sendsFor(ENDPOINT_A)
      expect(sends.length).toBeGreaterThanOrEqual(1)
      const expectedTag = buildOwnerPushPayload({
        event: 'queue_joined',
        dedupKey: ownerNotificationDedupKey('queue_joined', entry.id),
      }).tag
      const own = sends.find((call) => {
        const payload = JSON.parse(String(call[1])) as { tag: string }
        return payload.tag === expectedTag
      })
      expect(own).toBeDefined()
      const body = String(own![1])
      const payload = JSON.parse(body) as { tag: string; kind: string }
      expect(payload.kind).toBe('queue_joined')
      expect(payload.tag).toMatch(/^owner-queue_joined-[a-f0-9]{16}$/)
      expect(body).not.toContain(customerEmail)
      expect(body).not.toContain(entry.id)
      expect(body).not.toContain(customerId)

      // Een herhaalde dispatch levert geen tweede push voor hetzelfde evenement op.
      const before = sendsFor(ENDPOINT_A).length
      await dispatchOwnerPushDeliveries()
      const after = sendsFor(ENDPOINT_A).length
      expect(after).toBe(before)
      const again = await db
        .select()
        .from(ownerPushDeliveries)
        .where(eq(ownerPushDeliveries.eventId, events[0]!.id))
      expect(again).toHaveLength(1)
      expect(again[0]!.status).toBe('sent')
    } finally {
      await db.delete(ownerPushSubscriptions).where(inArray(ownerPushSubscriptions.id, createdSubscriptionIds))
      await db.delete(ownerNotificationEvents).where(inArray(ownerNotificationEvents.id, createdEventIds))
      // De wachtrij-entry moet vóór de klant worden verwijderd: de FK
      // customer_user_id is ON DELETE SET NULL en zou anders de
      // waiting_list_party_check schenden.
      const { waitingListEntries } = await import('../db/schema')
      await db.delete(waitingListEntries).where(inArray(waitingListEntries.id, createdEntryIds))
      await db.delete(users).where(eq(users.id, customerId))
      await db.delete(services).where(eq(services.id, serviceId))
      await removeOwnerFixture(ownerFixture)
      restoreEnv()
    }
  }, 30_000)

  it('deactiveert een apparaat wanneer de provider het endpoint verwerpt (404)', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray } = await import('drizzle-orm')
    const { ownerNotificationEvents } = await import('../db/schema/owner-notifications')
    const { ownerPushDeliveries, ownerPushSubscriptions } = await import('../db/schema/owner-push-subscriptions')
    const { services, users } = await import('../db/schema')
    const { joinQueue } = await import('../queue/queue.service.server')
    const { registerOwnerPushSubscription } = await import('./owner-push.service.server')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    const restoreEnv = useSavedEnv()
    const providerError = Object.assign(new Error('gone'), { statusCode: 404 })
    sendNotification.mockRejectedValue(providerError)
    const suffix = randomUUID()
    const customerId = randomUUID()
    const serviceId = randomUUID()
    const ownerFixture = await ensureActiveOwnerFixture('owner-push-invalid')
    const createdSubscriptionIds: string[] = []
    const createdEventIds: string[] = []
    const createdEntryIds: string[] = []
    try {
      await db.insert(users).values({ id: customerId, email: `owner-push-404-${suffix}@example.com`, role: 'customer' })
      await db.insert(services).values({
        id: serviceId,
        name: 'Owner Push 404 Service',
        description: 'Owner push fixture',
        durationMinutes: 30,
        priceCents: 1000,
        active: true,
      })
      const subscription = await registerOwnerPushSubscription({ endpoint: ENDPOINT_B, ...KEYS }, ownerFixture.userId)
      createdSubscriptionIds.push(subscription.id)

      const entry = await joinQueue({ serviceId }, { kind: 'customer', userId: customerId })
      createdEntryIds.push(entry.id)
      const events = await db
        .select({ id: ownerNotificationEvents.id })
        .from(ownerNotificationEvents)
        .where(
          and(
            eq(ownerNotificationEvents.event, 'queue_joined'),
            eq(ownerNotificationEvents.entityId, entry.id),
          ),
        )
      expect(events).toHaveLength(1)
      createdEventIds.push(events[0]!.id)

      const [row] = await db
        .select({ active: ownerPushSubscriptions.active, reason: ownerPushSubscriptions.deactivateReason })
        .from(ownerPushSubscriptions)
        .where(eq(ownerPushSubscriptions.id, subscription.id))
      expect(row?.active).toBe(false)
      expect(row?.reason).toBe('invalid')

      const deliveries = await db
        .select()
        .from(ownerPushDeliveries)
        .where(
          and(
            eq(ownerPushDeliveries.eventId, events[0]!.id),
            eq(ownerPushDeliveries.subscriptionId, subscription.id),
          ),
        )
      expect(deliveries.length).toBeGreaterThanOrEqual(1)
      // Na de eerste 404 is het apparaat gedeactiveerd; de resterende
      // deliveries kunnen daardoor niet meer worden verstuurd en sluiten als
      // 'expired'. Alle moeten terminaal zijn.
      expect(
        deliveries.every(
          (delivery) => delivery.status === 'invalid' || delivery.status === 'expired',
        ),
      ).toBe(true)
    } finally {
      await db.delete(ownerPushSubscriptions).where(inArray(ownerPushSubscriptions.id, createdSubscriptionIds))
      await db.delete(ownerNotificationEvents).where(inArray(ownerNotificationEvents.id, createdEventIds))
      // De wachtrij-entry moet vóór de klant worden verwijderd: de FK
      // customer_user_id is ON DELETE SET NULL en zou anders de
      // waiting_list_party_check schenden.
      const { waitingListEntries } = await import('../db/schema')
      await db.delete(waitingListEntries).where(inArray(waitingListEntries.id, createdEntryIds))
      await db.delete(users).where(eq(users.id, customerId))
      await db.delete(services).where(eq(services.id, serviceId))
      await removeOwnerFixture(ownerFixture)
      restoreEnv()
    }
  }, 30_000)

  it('houdt een tijdelijke providerfout herstelbaar voor een volgende poging', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray } = await import('drizzle-orm')
    const { ownerNotificationEvents } = await import('../db/schema/owner-notifications')
    const { ownerPushDeliveries, ownerPushSubscriptions } = await import('../db/schema/owner-push-subscriptions')
    const { services, users } = await import('../db/schema')
    const { joinQueue } = await import('../queue/queue.service.server')
    const { registerOwnerPushSubscription } = await import('./owner-push.service.server')
    const { dispatchOwnerPushDeliveries } = await import('./owner-push.dispatch.server')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    const restoreEnv = useSavedEnv()
    const providerError = Object.assign(new Error('server error'), { statusCode: 503 })
    sendNotification.mockRejectedValue(providerError)
    const suffix = randomUUID()
    const customerId = randomUUID()
    const serviceId = randomUUID()
    const ownerFixture = await ensureActiveOwnerFixture('owner-push-retry')
    const createdSubscriptionIds: string[] = []
    const createdEventIds: string[] = []
    const createdEntryIds: string[] = []
    try {
      await db.insert(users).values({ id: customerId, email: `owner-push-503-${suffix}@example.com`, role: 'customer' })
      await db.insert(services).values({
        id: serviceId,
        name: 'Owner Push 503 Service',
        description: 'Owner push fixture',
        durationMinutes: 30,
        priceCents: 1000,
        active: true,
      })
      const subscription = await registerOwnerPushSubscription({ endpoint: ENDPOINT_A, ...KEYS }, ownerFixture.userId)
      createdSubscriptionIds.push(subscription.id)

      const entry = await joinQueue({ serviceId }, { kind: 'customer', userId: customerId })
      createdEntryIds.push(entry.id)
      const events = await db
        .select({ id: ownerNotificationEvents.id })
        .from(ownerNotificationEvents)
        .where(
          and(
            eq(ownerNotificationEvents.event, 'queue_joined'),
            eq(ownerNotificationEvents.entityId, entry.id),
          ),
        )
      expect(events).toHaveLength(1)
      createdEventIds.push(events[0]!.id)

      // Zorg dat de delivery voor deze gebeurtenis daadwerkelijk is
      // verwerkt, ook wanneer er recentere gebeurtenissen in de wacht
      // staan uit andere testruns.
      await dispatchOwnerPushDeliveries({ maxDeliveries: 500 })

      const deliveries = await db
        .select()
        .from(ownerPushDeliveries)
        .where(
          and(
            eq(ownerPushDeliveries.eventId, events[0]!.id),
            eq(ownerPushDeliveries.subscriptionId, subscription.id),
          ),
        )
      expect(deliveries.length).toBeGreaterThanOrEqual(1)
      expect(deliveries.every((delivery) => delivery.status === 'pending')).toBe(true)
      expect(deliveries.every((delivery) => delivery.attempts >= 1)).toBe(true)
      expect(deliveries.every((delivery) => delivery.lastErrorCategory === 'transient')).toBe(true)

      // Het abonnement blijft actief: een tijdelijke fout is geen dood endpoint.
      const [row] = await db
        .select({ active: ownerPushSubscriptions.active })
        .from(ownerPushSubscriptions)
        .where(eq(ownerPushSubscriptions.id, subscription.id))
      expect(row?.active).toBe(true)
    } finally {
      await db.delete(ownerPushSubscriptions).where(inArray(ownerPushSubscriptions.id, createdSubscriptionIds))
      await db.delete(ownerNotificationEvents).where(inArray(ownerNotificationEvents.id, createdEventIds))
      // De wachtrij-entry moet vóór de klant worden verwijderd: de FK
      // customer_user_id is ON DELETE SET NULL en zou anders de
      // waiting_list_party_check schenden.
      const { waitingListEntries } = await import('../db/schema')
      await db.delete(waitingListEntries).where(inArray(waitingListEntries.id, createdEntryIds))
      await db.delete(users).where(eq(users.id, customerId))
      await db.delete(services).where(eq(services.id, serviceId))
      await removeOwnerFixture(ownerFixture)
      restoreEnv()
    }
  }, 30_000)
})
