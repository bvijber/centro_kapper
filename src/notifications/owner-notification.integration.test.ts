import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

/**
 * Integratietests voor interne eigenaar-notificaties.
 *
 * De test draait uitsluitend tegen een expliciet als niet-productie
 * gemarkeerde testdatabase (`TEST_DATABASE_URL`). Zonder die variabele
 * worden de tests overgeslagen, zodat er nooit naar een onbekende of
 * productiedatabase wordt geschreven.
 */
const testDatabaseAvailable = Boolean(process.env.TEST_DATABASE_URL)

describe.skipIf(!testDatabaseAvailable)('owner notification integration', () => {
  it('records, deduplicates, reads and cleans up owner notifications', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray } = await import('drizzle-orm')
    const {
      appointments,
      auditLogs,
      bookingSettings,
      businessProfile,
      cancellationRequests,
      customerProfiles,
      openingHours,
      ownerNotificationEvents,
      ownerNotifications,
      services,
      users,
    } = await import('../db/schema')
    const { joinQueue, leaveQueue } = await import('../queue/queue.service.server')
    const {
      approveCancellationRequest,
      cancelAppointment,
      createAppointment,
      requestCancellation,
    } = await import('../appointments/appointment.service.server')
    const {
      cleanupExpiredOwnerNotifications,
      getOwnerUnreadCount,
      listOwnerNotifications,
      markAllOwnerNotificationsRead,
      markOwnerNotificationRead,
      recordOwnerNotification,
    } = await import('./owner-notification.service.server')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    const suffix = randomUUID()
    const customerId = randomUUID()
    const serviceId = randomUUID()
    const createdIds: string[] = []
    const requestIds: string[] = []

    const ownerFixture = await ensureActiveOwnerFixture('owner-notifications')
    const ownerId = ownerFixture.userId

    const createdOpeningHours: number[] = []
    const createdBusinessProfile = (await db.select({ id: businessProfile.id }).from(businessProfile)).length === 0
    const createdBookingSettings = (await db.select({ id: bookingSettings.id }).from(bookingSettings)).length === 0

    try {
      await db.insert(users).values({ id: customerId, email: `owner-notif-${suffix}@example.com`, role: 'customer' })
      await db.insert(customerProfiles).values({
        userId: customerId,
        fullName: 'Notificatie Klant',
        phone: '0612345678',
      })
      await db.insert(services).values({
        id: serviceId,
        name: 'Notificatie Service',
        description: 'Notificatie fixture',
        durationMinutes: 30,
        priceCents: 1000,
        active: true,
      })
      if (createdBusinessProfile) {
        await db.insert(businessProfile).values({
          id: 1,
          name: 'Centro Kapper',
          address: 'Teststraat 1',
          phone: '0612345678',
        })
      }
      if (createdBookingSettings) {
        await db.insert(bookingSettings).values({ id: 1 })
      }
      for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
        const [existing] = await db.select({ id: openingHours.id }).from(openingHours).where(eq(openingHours.weekday, weekday))
        if (existing) continue
        await db.insert(openingHours).values({
          weekday,
          isOpen: true,
          openingTime: '09:00',
          closingTime: '18:00',
        })
        createdOpeningHours.push(weekday)
      }

      const notificationsFor = async (event: string) => {
        const rows = await db
          .select({ id: ownerNotifications.id })
          .from(ownerNotifications)
          .innerJoin(ownerNotificationEvents, eq(ownerNotificationEvents.id, ownerNotifications.eventId))
          .where(
            and(
              eq(ownerNotificationEvents.event, event),
              eq(ownerNotifications.recipientUserId, ownerId),
            ),
          )
        return rows
      }

      // 1. Een klant die zich aanmeldt levert één melding op.
      const customerEntry = await joinQueue({ serviceId }, { kind: 'customer', userId: customerId })
      createdIds.push(customerEntry.id)
      expect(await notificationsFor('queue_joined')).toHaveLength(1)

      // 2. Een walk-in die de eigenaar zelf aanmaakt levert geen melding op.
      await joinQueue({ serviceId, guestName: 'Walk-in Gast', guestPhone: '0612345678' }, { kind: 'owner', userId: ownerId })
      expect(await notificationsFor('queue_joined')).toHaveLength(1)

      // 3. Een klant die de wachtrij verlaat levert één melding op.
      await leaveQueue(customerEntry.id, { kind: 'customer', userId: customerId })
      expect(await notificationsFor('queue_left')).toHaveLength(1)

      // 4. Een nieuwe afspraak levert één melding op, ook als de eigenaar die zelf maakt.
      const ownerAppointment = await createAppointment(
        {
          serviceId,
          localDate: '2099-02-02',
          localTime: '09:00',
          overrideOpeningHours: false,
          overrideBreak: false,
          overrideWholeDayBlock: false,
          confirmOverlap: false,
        },
        { kind: 'owner', userId: ownerId },
      )
      createdIds.push(ownerAppointment.id)
      expect(await notificationsFor('appointment_booked')).toHaveLength(1)

      // 5. Alleen een echte overgang naar cancelled levert een melding op.
      const cancelled = await cancelAppointment(ownerAppointment.id, { kind: 'owner', userId: ownerId })
      expect(cancelled.status).toBe('cancelled')
      expect(await notificationsFor('appointment_cancelled')).toHaveLength(1)
      await expect(cancelAppointment(ownerAppointment.id, { kind: 'owner', userId: ownerId })).rejects.toMatchObject({
        code: 'INVALID',
      })
      expect(await notificationsFor('appointment_cancelled')).toHaveLength(1)

      // 6. Een verzoek levert geen melding op; de goedkeuring wel.
      const customerAppointment = await createAppointment(
        {
          serviceId,
          localDate: '2099-02-03',
          localTime: '09:00',
          overrideOpeningHours: false,
          overrideBreak: false,
          overrideWholeDayBlock: false,
          confirmOverlap: false,
        },
        { kind: 'customer', userId: customerId },
      )
      createdIds.push(customerAppointment.id)
      const request = await requestCancellation(customerAppointment.id, 'Verhinderd', { kind: 'customer', userId: customerId })
      requestIds.push(request.id)
      expect(await notificationsFor('appointment_cancelled')).toHaveLength(1)
      await approveCancellationRequest(request.id, { kind: 'owner', userId: ownerId })
      expect(await notificationsFor('appointment_cancelled')).toHaveLength(2)

      // 7. Dezelfde gebeurtenis tweemaal vastleggen levert één melding op.
      const repeated = await db.transaction(async (tx) =>
        recordOwnerNotification(tx, {
          event: 'queue_joined',
          entityType: 'queue_entry',
          entityId: customerEntry.id,
          title: 'Nieuwe wachtrij-inschrijving',
          body: 'Nogmaals dezelfde gebeurtenis.',
        }),
      )
      expect(repeated.eventCreated).toBe(false)
      expect(repeated.notificationCreated).toBe(false)
      expect(await notificationsFor('queue_joined')).toHaveLength(1)

      // 8. Lezen en alles als gelezen markeren.
      const items = await listOwnerNotifications(ownerId)
      expect(items.length).toBeGreaterThan(0)
      expect(await getOwnerUnreadCount(ownerId)).toBe(items.filter((item) => !item.read).length)
      const first = items[0]
      if (!first) throw new Error('expected at least one notification')
      expect(await markOwnerNotificationRead(ownerId, first.id)).toBe(true)
      expect(await getOwnerUnreadCount(ownerId)).toBe(items.filter((item) => !item.read).length - 1)
      await markAllOwnerNotificationsRead(ownerId)
      expect(await getOwnerUnreadCount(ownerId)).toBe(0)

      // 9. Notificaties van een andere eigenaar zijn niet zichtbaar.
      expect(await listOwnerNotifications(randomUUID())).toHaveLength(0)

      // 10. Meldingen ouder dan 30 dagen worden verwijderd, ongeacht leesstatus.
      const [expired] = await db
        .insert(ownerNotifications)
        .values({
          eventId: (
            await db
              .insert(ownerNotificationEvents)
              .values({
                dedupKey: `queue_joined:expired-${suffix}`,
                event: 'queue_joined',
                recipientUserId: ownerId,
                entityType: 'queue_entry',
                entityId: randomUUID(),
              })
              .returning({ id: ownerNotificationEvents.id })
          )[0]?.id ?? '',
          recipientUserId: ownerId,
          title: 'Verouderde melding',
          body: 'Deze melding is ouder dan 30 dagen.',
          createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        })
        .returning({ id: ownerNotifications.id })
      if (!expired) throw new Error('expired fixture insert failed')
      const deleted = await cleanupExpiredOwnerNotifications()
      expect(deleted).toBeGreaterThanOrEqual(1)
      const [stillThere] = await db.select({ id: ownerNotifications.id }).from(ownerNotifications).where(eq(ownerNotifications.id, expired.id))
      expect(stillThere).toBeUndefined()
    } finally {
      const notificationIds = (
        await db
          .select({ id: ownerNotifications.id })
          .from(ownerNotifications)
          .where(eq(ownerNotifications.recipientUserId, ownerId))
      ).map((row) => row.id)
      await db.delete(ownerNotifications).where(inArray(ownerNotifications.id, notificationIds))
      const eventIds = (
        await db.select({ id: ownerNotificationEvents.id }).from(ownerNotificationEvents).where(eq(ownerNotificationEvents.recipientUserId, ownerId))
      ).map((row) => row.id)
      await db.delete(ownerNotificationEvents).where(inArray(ownerNotificationEvents.id, eventIds))
      await db.delete(cancellationRequests).where(inArray(cancellationRequests.id, requestIds))
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, [...createdIds, ...requestIds]))
      await db.delete(appointments).where(inArray(appointments.id, createdIds))
      const { waitingListEntries } = await import('../db/schema')
      await db.delete(waitingListEntries).where(inArray(waitingListEntries.id, createdIds))
      await db.delete(customerProfiles).where(eq(customerProfiles.userId, customerId))
      await db.delete(users).where(eq(users.id, customerId))
      await db.delete(services).where(eq(services.id, serviceId))
      if (createdOpeningHours.length > 0) {
        await db.delete(openingHours).where(inArray(openingHours.weekday, createdOpeningHours))
      }
      if (createdBusinessProfile) {
        await db.delete(businessProfile).where(eq(businessProfile.id, 1))
      }
      if (createdBookingSettings) {
        await db.delete(bookingSettings).where(eq(bookingSettings.id, 1))
      }
      await removeOwnerFixture(ownerFixture)
    }
  })
})
