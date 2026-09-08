import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

const databaseAvailable = Boolean(process.env.DATABASE_URL)

describe.skipIf(!databaseAvailable)('appointment concurrency integration', () => {
  it('serializes conflicting creates through the PostgreSQL transaction advisory lock', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray } = await import('drizzle-orm')
    const { appointments, auditLogs, bookingSettings, services, staffProfiles, users } = await import('../db/schema')
    const { createAppointment } = await import('./appointment.service.server')

    const barberId = randomUUID()
    const serviceId = randomUUID()
    const email = `phase3-${barberId}@example.com`
    const startsAt = new Date('2099-01-01T09:37:00.000Z')

    const [existingBarber] = await db.select({ id: users.id }).from(users).innerJoin(staffProfiles, eq(staffProfiles.userId, users.id)).where(and(eq(users.role, 'staff'), eq(staffProfiles.active, true))).limit(1)
    const fixtureBarberId = existingBarber?.id ?? barberId
    if (!existingBarber) {
      await db.insert(users).values({ id: barberId, email, role: 'staff' })
      await db.insert(staffProfiles).values({ userId: barberId, displayName: 'Phase 3 Test Barber', phone: '0612345678', active: true })
    }
    await db.insert(services).values({ id: serviceId, name: 'Phase 3 Test Service', description: 'Concurrency fixture', durationMinutes: 30, priceCents: 1000, active: true })
    await db.insert(bookingSettings).values({ id: 1 }).onConflictDoNothing()

    let results: PromiseSettledResult<{ id: string }>[] = []
    try {
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
      if (!existingBarber) {
        await db.delete(staffProfiles).where(eq(staffProfiles.userId, fixtureBarberId))
        await db.delete(users).where(eq(users.id, fixtureBarberId))
      }
    }
  })
})
