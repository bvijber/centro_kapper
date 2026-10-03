import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

const databaseAvailable = Boolean(process.env.DATABASE_URL)

describe.skipIf(!databaseAvailable)('appointment concurrency integration', () => {
  it('serializes conflicting creates through the PostgreSQL transaction advisory lock', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray } = await import('drizzle-orm')
     const { appointments, auditLogs, bookingSettings, businessProfile, openingHours, services, ownerProfiles, users } = await import('../db/schema')
    const { createAppointment } = await import('./appointment.service.server')

    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')
    const serviceId = randomUUID()
    const startsAt = new Date('2099-01-01T09:45:00.000Z')

    const ownerFixture = await ensureActiveOwnerFixture('concurrency')
    await db.insert(services).values({ id: serviceId, name: 'Phase 3 Test Service', description: 'Concurrency fixture', durationMinutes: 30, priceCents: 1000, active: true })
    await db.insert(bookingSettings).values({ id: 1 }).onConflictDoNothing()
    await db.insert(businessProfile).values({ id: 1, name: 'Test salon', address: 'Test address', phone: '0612345678', timezone: 'Europe/Amsterdam' }).onConflictDoNothing()
    await db.insert(openingHours).values({ weekday: 4, isOpen: true, openingTime: '09:00', closingTime: '18:00' }).onConflictDoUpdate({ target: openingHours.weekday, set: { isOpen: true, openingTime: '09:00', closingTime: '18:00' } })

    let results: PromiseSettledResult<{ id: string }>[] = []
    try {
      const invalidInput = {
        serviceId,
        startsAt: new Date('2099-01-01T09:37:00.000Z'),
        guestName: 'Concurrency Guest',
        guestPhone: '0612345678',
        overrideOpeningHours: false,
        overrideBreak: false,
        overrideWholeDayBlock: false,
      }
      await expect(createAppointment(invalidInput, { kind: 'guest' })).rejects.toMatchObject({ code: 'INVALID' })

      const input = {
        serviceId,
        startsAt,
        guestName: 'Concurrency Guest',
        guestPhone: '0612345678',
        overrideOpeningHours: false,
        overrideBreak: false,
        overrideWholeDayBlock: false,
      }
      results = await Promise.allSettled([
        createAppointment(input, { kind: 'guest' }),
        createAppointment(input, { kind: 'guest' }),
      ])
      const fulfilled = results.filter((result) => result.status === 'fulfilled')
      const rejected = results.filter((result) => result.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect(rejected[0]).toMatchObject({ reason: { code: 'CONFLICT' } })
    } finally {
      const createdIds = results
        .filter((result): result is PromiseFulfilledResult<{ id: string }> => result.status === 'fulfilled')
        .map((result) => result.value.id)
      if (createdIds.length > 0) {
        await db.delete(auditLogs).where(and(eq(auditLogs.action, 'appointment.create'), inArray(auditLogs.entityId, createdIds)))
      }
      await db.delete(appointments).where(eq(appointments.serviceId, serviceId))
      await db.delete(services).where(eq(services.id, serviceId))
      await removeOwnerFixture(ownerFixture)
    }
  })
})
