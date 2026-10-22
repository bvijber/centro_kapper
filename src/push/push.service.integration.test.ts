import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

import type { PushSubscriptionDTO } from './push.service.server'

const databaseAvailable = Boolean(process.env.DATABASE_URL)

const ENDPOINT_A = 'https://push.example.test/endpoint/aaa111'
const ENDPOINT_B = 'https://push.example.test/endpoint/bbb222'
const KEYS = {
  p256dh: 'BL7ELU24fJTAlH5Kyl8N6BDCac8u8li_U5PIwG963MOvdYs9s7LSzj8x_7v7RFdLZ9Eap50PiiyF5K0TDAis7t0',
  auth: 'juarI8x__VnHvsOgfeAPHg',
}

describe.skipIf(!databaseAvailable)('push subscription service', () => {
  it('registers, reports status and unregisters for a customer', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray } = await import('drizzle-orm')
    const { appointments, auditLogs, services, users } = await import('../db/schema')
    const { pushSubscriptions } = await import('../db/schema/push-subscriptions')
    const { joinQueue } = await import('../queue/queue.service.server')
    const {
      getPushSubscriptionStatus,
      registerPushSubscription,
      unregisterPushSubscription,
    } = await import('./push.service.server')

    const previousPublicKey = process.env.VAPID_PUBLIC_KEY
    process.env.VAPID_PUBLIC_KEY = 'test-public-key'
    const serviceId = randomUUID()
    const customerId = randomUUID()
    const createdSubscriptionIds: string[] = []
    const createdEntryIds: string[] = []
    const createdAppointmentIds: string[] = []
    try {
      await db.insert(users).values({ id: customerId, email: `push-${randomUUID()}@example.com`, role: 'customer' })
      await db.insert(services).values({ id: serviceId, name: 'Push Service', description: 'Push fixture', durationMinutes: 30, priceCents: 1000, active: true })
      const entry = await joinQueue({ serviceId }, { kind: 'customer', userId: customerId })
      createdEntryIds.push(entry.id)

      const registered = await registerPushSubscription(
        { queueEntryId: entry.id, endpoint: ENDPOINT_A, ...KEYS },
        { kind: 'customer', userId: customerId },
      )
      createdSubscriptionIds.push(registered.id)
      expect(registered.queueEntryId).toBe(entry.id)
      expect(registered.active).toBe(true)
      expect(registered).not.toHaveProperty('endpoint')
      expect(registered).not.toHaveProperty('p256dhKey')

      await expect(getPushSubscriptionStatus({ queueEntryId: entry.id }, { kind: 'customer', userId: customerId })).resolves.toEqual({ subscribed: true })

      const unregistered = await unregisterPushSubscription(
        { queueEntryId: entry.id, endpoint: ENDPOINT_A },
        { kind: 'customer', userId: customerId },
      )
      expect(unregistered).toEqual({ queueEntryId: entry.id, active: false })
      await expect(getPushSubscriptionStatus({ queueEntryId: entry.id }, { kind: 'customer', userId: customerId })).resolves.toEqual({ subscribed: false })

      const actions = await db.select({ action: auditLogs.action }).from(auditLogs).where(inArray(auditLogs.entityId, createdSubscriptionIds))
      expect(actions.map((row) => row.action)).toContain('push.subscribe')
      expect(actions.map((row) => row.action)).toContain('push.unsubscribe')
    } finally {
      if (previousPublicKey === undefined) delete process.env.VAPID_PUBLIC_KEY
      else process.env.VAPID_PUBLIC_KEY = previousPublicKey
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, [...createdSubscriptionIds, ...createdEntryIds, ...createdAppointmentIds]))
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, createdSubscriptionIds))
      const { waitingListEntries } = await import('../db/schema')
      await db.delete(waitingListEntries).where(inArray(waitingListEntries.id, createdEntryIds))
      const { ownerNotificationEvents, ownerNotifications } = await import('../db/schema/owner-notifications')
      const ownerEventIds = (await db.select({ id: ownerNotificationEvents.id }).from(ownerNotificationEvents).where(inArray(ownerNotificationEvents.entityId, createdEntryIds))).map((row) => row.id)
      if (ownerEventIds.length > 0) {
        await db.delete(ownerNotifications).where(inArray(ownerNotifications.eventId, ownerEventIds))
        await db.delete(ownerNotificationEvents).where(inArray(ownerNotificationEvents.id, ownerEventIds))
      }
      await db.delete(appointments).where(inArray(appointments.id, createdAppointmentIds))
      await db.delete(services).where(eq(services.id, serviceId))
      await db.delete(users).where(and(eq(users.id, customerId)))
    }
  })

  it('supports guests with capabilities and rejects misuse', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray } = await import('drizzle-orm')
    const { appointments, auditLogs, services, users } = await import('../db/schema')
    const { pushSubscriptions } = await import('../db/schema/push-subscriptions')
    const { joinQueue } = await import('../queue/queue.service.server')
    const {
      getPushSubscriptionStatus,
      registerPushSubscription,
      unregisterPushSubscription,
    } = await import('./push.service.server')

    const previousPublicKey = process.env.VAPID_PUBLIC_KEY
    process.env.VAPID_PUBLIC_KEY = 'test-public-key'
    const serviceId = randomUUID()
    const customerId = randomUUID()
    const otherCustomerId = randomUUID()
    const createdSubscriptionIds: string[] = []
    const createdEntryIds: string[] = []
    try {
      await db.insert(users).values({ id: customerId, email: `push-${randomUUID()}@example.com`, role: 'customer' })
      await db.insert(users).values({ id: otherCustomerId, email: `push-${randomUUID()}@example.com`, role: 'customer' })
      await db.insert(services).values({ id: serviceId, name: 'Push Guest Service', description: 'Push fixture', durationMinutes: 30, priceCents: 1000, active: true })
      const guestEntry = await joinQueue({ serviceId, guestName: 'Push Guest', guestPhone: '0612345678' }, { kind: 'guest' })
      createdEntryIds.push(guestEntry.id)
      const capability = guestEntry.guestCapability
      if (!capability) throw new Error('guest capability missing')
      const customerEntry = await joinQueue({ serviceId }, { kind: 'customer', userId: customerId })
      createdEntryIds.push(customerEntry.id)

      const first = await registerPushSubscription(
        { queueEntryId: guestEntry.id, endpoint: ENDPOINT_A, ...KEYS, capability },
        { kind: 'guest', capability },
      )
      createdSubscriptionIds.push(first.id)
      const second = await registerPushSubscription(
        { queueEntryId: guestEntry.id, endpoint: ENDPOINT_B, ...KEYS, capability },
        { kind: 'guest', capability },
      )
      createdSubscriptionIds.push(second.id)
      expect(second.id).not.toBe(first.id)

      // Herhaalde registratie van hetzelfde endpoint blijft één rij.
      const repeated = await registerPushSubscription(
        { queueEntryId: guestEntry.id, endpoint: ENDPOINT_A, ...KEYS, capability },
        { kind: 'guest', capability },
      )
      expect(repeated.id).toBe(first.id)
      const rows = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.queueEntryId, guestEntry.id))
      expect(rows).toHaveLength(2)

      // Gelijktijdige registratie van hetzelfde endpoint blijft één rij.
      const concurrentEndpoint = 'https://push.example.test/endpoint/ccc333'
      const [concurrentA, concurrentB] = await Promise.allSettled([
        registerPushSubscription({ queueEntryId: guestEntry.id, endpoint: concurrentEndpoint, ...KEYS, capability }, { kind: 'guest', capability }),
        registerPushSubscription({ queueEntryId: guestEntry.id, endpoint: concurrentEndpoint, ...KEYS, capability }, { kind: 'guest', capability }),
      ])
      expect(concurrentA.status).toBe('fulfilled')
      expect(concurrentB.status).toBe('fulfilled')
      const concurrentIds = new Set(
        [concurrentA, concurrentB]
          .filter((result): result is PromiseFulfilledResult<PushSubscriptionDTO> => result.status === 'fulfilled')
          .map((result) => result.value.id),
      )
      expect(concurrentIds.size).toBe(1)
      createdSubscriptionIds.push(...concurrentIds)

      // Ongeldige capability wordt afgewezen.
      await expect(registerPushSubscription(
        { queueEntryId: guestEntry.id, endpoint: 'https://push.example.test/endpoint/xxx999', ...KEYS, capability: 'd'.repeat(64) },
        { kind: 'guest', capability: 'd'.repeat(64) },
      )).rejects.toMatchObject({ code: 'FORBIDDEN' })

      // Entry-ID-manipulatie: gast-capability van entry 1 geeft geen toegang tot entry 2.
      await expect(registerPushSubscription(
        { queueEntryId: customerEntry.id, endpoint: 'https://push.example.test/endpoint/yyy888', ...KEYS, capability },
        { kind: 'guest', capability },
      )).rejects.toMatchObject({ code: 'FORBIDDEN' })

      // Andere klant krijgt geen toegang tot andermans entry.
      await expect(registerPushSubscription(
        { queueEntryId: customerEntry.id, endpoint: 'https://push.example.test/endpoint/zzz777', ...KEYS },
        { kind: 'customer', userId: otherCustomerId },
      )).rejects.toMatchObject({ code: 'FORBIDDEN' })
      await expect(getPushSubscriptionStatus({ queueEntryId: customerEntry.id }, { kind: 'customer', userId: otherCustomerId })).rejects.toMatchObject({ code: 'FORBIDDEN' })

      // Uitschakelen deactiveert alleen de eigen subscription.
      await unregisterPushSubscription({ queueEntryId: guestEntry.id, endpoint: ENDPOINT_A }, { kind: 'guest', capability })
      await expect(getPushSubscriptionStatus({ queueEntryId: guestEntry.id, capability }, { kind: 'guest', capability })).resolves.toEqual({ subscribed: true })
    } finally {
      if (previousPublicKey === undefined) delete process.env.VAPID_PUBLIC_KEY
      else process.env.VAPID_PUBLIC_KEY = previousPublicKey
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, [...createdSubscriptionIds, ...createdEntryIds]))
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, createdSubscriptionIds))
      const { waitingListEntries } = await import('../db/schema')
      await db.delete(waitingListEntries).where(inArray(waitingListEntries.id, createdEntryIds))
      const { ownerNotificationEvents, ownerNotifications } = await import('../db/schema/owner-notifications')
      const ownerEventIds = (await db.select({ id: ownerNotificationEvents.id }).from(ownerNotificationEvents).where(inArray(ownerNotificationEvents.entityId, createdEntryIds))).map((row) => row.id)
      if (ownerEventIds.length > 0) {
        await db.delete(ownerNotifications).where(inArray(ownerNotifications.eventId, ownerEventIds))
        await db.delete(ownerNotificationEvents).where(inArray(ownerNotificationEvents.id, ownerEventIds))
      }
      await db.delete(services).where(eq(services.id, serviceId))
      await db.delete(users).where(inArray(users.id, [customerId, otherCustomerId]))
    }
  })

  it('fails closed without VAPID configuration', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray } = await import('drizzle-orm')
    const { auditLogs, services, users } = await import('../db/schema')
    const { pushSubscriptions } = await import('../db/schema/push-subscriptions')
    const { joinQueue } = await import('../queue/queue.service.server')
    const { registerPushSubscription } = await import('./push.service.server')

    const previousPublicKey = process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PUBLIC_KEY
    const serviceId = randomUUID()
    const customerId = randomUUID()
    const createdEntryIds: string[] = []
    try {
      await db.insert(users).values({ id: customerId, email: `push-${randomUUID()}@example.com`, role: 'customer' })
      await db.insert(services).values({ id: serviceId, name: 'Push Closed Service', description: 'Push fixture', durationMinutes: 30, priceCents: 1000, active: true })
      const entry = await joinQueue({ serviceId }, { kind: 'customer', userId: customerId })
      createdEntryIds.push(entry.id)

      await expect(registerPushSubscription(
        { queueEntryId: entry.id, endpoint: ENDPOINT_A, ...KEYS },
        { kind: 'customer', userId: customerId },
      )).rejects.toMatchObject({ code: 'FAILED' })

      const rows = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.queueEntryId, entry.id))
      expect(rows).toHaveLength(0)
    } finally {
      if (previousPublicKey === undefined) delete process.env.VAPID_PUBLIC_KEY
      else process.env.VAPID_PUBLIC_KEY = previousPublicKey
      // `joinQueue` schrijft een 'queue.join'-auditrij met entityId = de id van
      // de eigen queue-entry. Die rij wordt hier opgeruimd; `audit_logs.entity_id`
      // is een vrije tekstkolom zonder foreign key, dus het filter op de
      // eigen entry-id raakt geen auditgeschiedenis van andere tests of
      // bestaande gebruikers.
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdEntryIds))
      const { waitingListEntries } = await import('../db/schema')
      await db.delete(waitingListEntries).where(inArray(waitingListEntries.id, createdEntryIds))
      const { ownerNotificationEvents, ownerNotifications } = await import('../db/schema/owner-notifications')
      const ownerEventIds = (await db.select({ id: ownerNotificationEvents.id }).from(ownerNotificationEvents).where(inArray(ownerNotificationEvents.entityId, createdEntryIds))).map((row) => row.id)
      if (ownerEventIds.length > 0) {
        await db.delete(ownerNotifications).where(inArray(ownerNotifications.eventId, ownerEventIds))
        await db.delete(ownerNotificationEvents).where(inArray(ownerNotificationEvents.id, ownerEventIds))
      }
      await db.delete(services).where(eq(services.id, serviceId))
      await db.delete(users).where(and(eq(users.id, customerId)))
    }
  })
})
