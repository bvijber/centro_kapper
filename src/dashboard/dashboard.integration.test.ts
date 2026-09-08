import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

const databaseAvailable = Boolean(process.env.DATABASE_URL)

describe.skipIf(!databaseAvailable)('dashboard integration', () => {
  it('computes server-derived metrics from actual appointment data', async () => {
    const { db } = await import('../db/client.server')
    const { eq, inArray } = await import('drizzle-orm')
    const { appointments, auditLogs, bookingSettings, services, users, staffProfiles } = await import('../db/schema')
    const { getStaffDashboard } = await import('./dashboard.service.server')
    const { formatAmsterdamDateKey, getAmsterdamDayBounds } = await import('../timezone')

    const staffId = randomUUID()
    const serviceId = randomUUID()

    const [existingBarber] = await db.select({ id: users.id }).from(users).innerJoin(staffProfiles, eq(staffProfiles.userId, users.id)).where(eq(staffProfiles.active, true)).limit(1)
    const fixtureStaffId = existingBarber?.id ?? staffId
    if (!existingBarber) {
      await db.insert(users).values({ id: staffId, email: `dashboard-staff-${randomUUID()}@example.com`, role: 'staff' })
      await db.insert(staffProfiles).values({ userId: staffId, displayName: 'Dashboard Test Barber', phone: '0612345678', active: true })
    }
    await db.insert(bookingSettings).values({ id: 1 }).onConflictDoNothing()
    await db.insert(services).values({ id: serviceId, name: 'Dashboard Test Service', description: 'Dashboard fixture', durationMinutes: 30, priceCents: 1000, active: true })

    const todayBounds = getAmsterdamDayBounds(formatAmsterdamDateKey(new Date()))
    const now = new Date()
    const completedTodayStarts = todayBounds ? new Date(Math.min(todayBounds.end.getTime() - 60_000, now.getTime())) : now
    const completedTodayEnd = new Date(completedTodayStarts.getTime() + 30 * 60_000)

    const todayIds: string[] = []
    try {
      for (let index = 0; index < 3; index += 1) {
        const id = randomUUID()
        const startsAt = new Date(completedTodayStarts.getTime() + index * 30 * 60_000)
        await db.insert(appointments).values({
          id,
          customerUserId: null,
          guestName: `Dashboard Guest ${index}`,
          guestPhone: '0612345678',
          barberUserId: fixtureStaffId,
          serviceId,
          serviceNameAtBooking: 'Dashboard Test Service',
          servicePriceCentsAtBooking: 1000,
          serviceDurationMinutesAtBooking: 30,
          bufferMinutesAtBooking: 0,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60_000),
          status: 'completed',
          completedAt: startsAt,
        })
        todayIds.push(id)
      }

      const metrics = await getStaffDashboard()
      expect(metrics.appointmentsToday).toBeGreaterThanOrEqual(3)
      expect(metrics.completedToday).toBeGreaterThanOrEqual(3)
      expect(metrics.revenueThisMonthCents).toBeGreaterThanOrEqual(3000)
      expect(metrics.activeStaff).toBeGreaterThanOrEqual(1)
    } finally {
      if (todayIds.length > 0) {
        await db.delete(auditLogs).where(inArray(auditLogs.entityId, todayIds))
        await db.delete(appointments).where(inArray(appointments.id, todayIds))
      }
      await db.delete(services).where(eq(services.id, serviceId))
      if (!existingBarber) {
        await db.delete(staffProfiles).where(eq(staffProfiles.userId, fixtureStaffId))
        await db.delete(users).where(eq(users.id, fixtureStaffId))
      }
    }
  })

  it('does not count cancelled appointments as completed revenue or today activity', async () => {
    const { db } = await import('../db/client.server')
    const { eq } = await import('drizzle-orm')
    const { appointments, auditLogs, bookingSettings, services, users, staffProfiles } = await import('../db/schema')
    const { getStaffDashboard } = await import('./dashboard.service.server')
    const { formatAmsterdamDateKey, getAmsterdamDayBounds } = await import('../timezone')

    const staffId = randomUUID()
    const serviceId = randomUUID()

    const [existingBarber] = await db.select({ id: users.id }).from(users).innerJoin(staffProfiles, eq(staffProfiles.userId, users.id)).where(eq(staffProfiles.active, true)).limit(1)
    const fixtureStaffId = existingBarber?.id ?? staffId
    if (!existingBarber) {
      await db.insert(users).values({ id: staffId, email: `dashboard-cancel-${randomUUID()}@example.com`, role: 'staff' })
      await db.insert(staffProfiles).values({ userId: staffId, displayName: 'Dashboard Cancel Barber', phone: '0612345678', active: true })
    }
    await db.insert(bookingSettings).values({ id: 1 }).onConflictDoNothing()
    await db.insert(services).values({ id: serviceId, name: 'Dashboard Cancel Service', description: 'Dashboard cancel fixture', durationMinutes: 30, priceCents: 1000, active: true })

    const todayBounds = getAmsterdamDayBounds(formatAmsterdamDateKey(new Date()))
    const cancelledStarts = todayBounds ? new Date(Math.min(todayBounds.end.getTime() - 120_000, new Date().getTime())) : new Date()
    const cancelledId = randomUUID()

    try {
      const before = await getStaffDashboard()

      await db.insert(appointments).values({
        id: cancelledId,
        customerUserId: null,
        guestName: 'Cancelled Guest',
        guestPhone: '0612345678',
        barberUserId: fixtureStaffId,
        serviceId,
        serviceNameAtBooking: 'Dashboard Cancel Service',
        servicePriceCentsAtBooking: 9999,
        serviceDurationMinutesAtBooking: 30,
        bufferMinutesAtBooking: 0,
        startsAt: cancelledStarts,
        endsAt: new Date(cancelledStarts.getTime() + 30 * 60_000),
        status: 'cancelled',
        cancelledAt: cancelledStarts,
      })

      const after = await getStaffDashboard()
      expect(after.completedToday).toBe(before.completedToday)
      expect(after.revenueThisMonthCents).toBe(before.revenueThisMonthCents)
    } finally {
      await db.delete(auditLogs).where(eq(auditLogs.entityId, cancelledId))
      await db.delete(appointments).where(eq(appointments.id, cancelledId))
      await db.delete(services).where(eq(services.id, serviceId))
      if (!existingBarber) {
        await db.delete(staffProfiles).where(eq(staffProfiles.userId, fixtureStaffId))
        await db.delete(users).where(eq(users.id, fixtureStaffId))
      }
    }
  })
})