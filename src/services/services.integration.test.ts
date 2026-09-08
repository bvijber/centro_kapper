import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

const databaseAvailable = Boolean(process.env.DATABASE_URL)

describe.skipIf(!databaseAvailable)('services integration', () => {
  it('creates, updates, deactivates, activates and archives services transactionally', async () => {
    const { db } = await import('../db/client.server')
    const { eq, inArray } = await import('drizzle-orm')
    const { auditLogs, bookingSettings, services, users, staffProfiles } = await import('../db/schema')
    const { createService, updateService, deactivateService, activateService, archiveService, listServices } = await import('./services.service.server')

    const staffId = randomUUID()
    const staffEmail = `services-staff-${randomUUID()}@example.com`

    const [existingBarber] = await db.select({ id: users.id }).from(users).innerJoin(staffProfiles, eq(staffProfiles.userId, users.id)).where(eq(staffProfiles.active, true)).limit(1)
    const fixtureStaffId = existingBarber?.id ?? staffId
    if (!existingBarber) {
      await db.insert(users).values({ id: staffId, email: staffEmail, role: 'staff' })
      await db.insert(staffProfiles).values({ userId: staffId, displayName: 'Services Test Barber', phone: '0612345678', active: true })
    }
    await db.insert(bookingSettings).values({ id: 1 }).onConflictDoNothing()

    const serviceIds: string[] = []
    try {
      const created = await createService({ name: 'Knippen', description: 'Knippen & styling', durationMinutes: 30, priceCents: 2500 })
      serviceIds.push(created.id)
      expect(created.active).toBe(true)
      expect(created.archivedAt).toBeNull()

      const updated = await updateService(created.id, { priceCents: 3000 })
      expect(updated.priceCents).toBe(3000)

      const deactivated = await deactivateService(created.id)
      expect(deactivated.active).toBe(false)
      expect(deactivated.archivedAt).toBeNull()

      const reactivated = await activateService(created.id)
      expect(reactivated.active).toBe(true)

      const archived = await archiveService(created.id)
      expect(archived.active).toBe(false)
      expect(archived.archivedAt).not.toBeNull()

      await expect(activateService(created.id)).rejects.toMatchObject({ code: 'INVALID' })
      await expect(archiveService(created.id)).rejects.toMatchObject({ code: 'CONFLICT' })

      const all = await listServices()
      expect(all.some((service) => service.id === created.id)).toBe(true)
    } finally {
      if (serviceIds.length > 0) {
        await db.delete(auditLogs).where(inArray(auditLogs.entityId, serviceIds))
        await db.delete(services).where(inArray(services.id, serviceIds))
      }
      if (!existingBarber) {
        await db.delete(staffProfiles).where(eq(staffProfiles.userId, fixtureStaffId))
        await db.delete(users).where(eq(users.id, fixtureStaffId))
      }
    }
  })

  it('keeps historical appointment snapshots intact after service updates', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray } = await import('drizzle-orm')
    const { appointments, auditLogs, bookingSettings, services, users, staffProfiles } = await import('../db/schema')
    const { createService, updateService, archiveService } = await import('./services.service.server')

    const staffId = randomUUID()
    const serviceId = randomUUID()
    const appointmentId = randomUUID()

    const [existingBarber] = await db.select({ id: users.id }).from(users).innerJoin(staffProfiles, eq(staffProfiles.userId, users.id)).where(eq(staffProfiles.active, true)).limit(1)
    const fixtureStaffId = existingBarber?.id ?? staffId
    if (!existingBarber) {
      await db.insert(users).values({ id: staffId, email: `services-snap-${randomUUID()}@example.com`, role: 'staff' })
      await db.insert(staffProfiles).values({ userId: staffId, displayName: 'Services Snapshot Barber', phone: '0612345678', active: true })
    }
    await db.insert(bookingSettings).values({ id: 1 }).onConflictDoNothing()
    await db.insert(services).values({ id: serviceId, name: 'Snapshot Service', description: 'Snapshot fixture', durationMinutes: 30, priceCents: 1000, active: true })

    const startsAt = new Date('2099-03-01T09:00:00.000Z')
    await db.insert(appointments).values({
      id: appointmentId,
      customerUserId: null,
      guestName: 'Snapshot Guest',
      guestPhone: '0612345678',
      barberUserId: fixtureStaffId,
      serviceId,
      serviceNameAtBooking: 'Snapshot Service',
      servicePriceCentsAtBooking: 1000,
      serviceDurationMinutesAtBooking: 30,
      bufferMinutesAtBooking: 0,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      status: 'new',
    })

    try {
      await updateService(serviceId, { name: 'Snapshot Service Gewijzigd', priceCents: 5000, durationMinutes: 45 })
      await archiveService(serviceId)

      const [appointment] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1)
      expect(appointment).not.toBeNull()
      expect(appointment?.serviceNameAtBooking).toBe('Snapshot Service')
      expect(appointment?.servicePriceCentsAtBooking).toBe(1000)
      expect(appointment?.serviceDurationMinutesAtBooking).toBe(30)
    } finally {
      await db.delete(auditLogs).where(and(eq(auditLogs.action, 'service.update'), eq(auditLogs.entityId, serviceId)))
      await db.delete(auditLogs).where(and(eq(auditLogs.action, 'service.archive'), eq(auditLogs.entityId, serviceId)))
      await db.delete(appointments).where(eq(appointments.id, appointmentId))
      await db.delete(services).where(eq(services.id, serviceId))
      if (!existingBarber) {
        await db.delete(staffProfiles).where(eq(staffProfiles.userId, fixtureStaffId))
        await db.delete(users).where(eq(users.id, fixtureStaffId))
      }
    }
  })
})