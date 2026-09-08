import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

const databaseAvailable = Boolean(process.env.DATABASE_URL)

describe.skipIf(!databaseAvailable)('appointment lifecycle integration', () => {
  it('enforces the full lifecycle, cancellation requests and deadlines transactionally', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray } = await import('drizzle-orm')
    const { appointments, auditLogs, bookingSettings, cancellationRequests, customerProfiles, services, staffProfiles, users } = await import('../db/schema')
    const {
      approveCancellationRequest,
      cancelAppointment,
      modifyAppointment,
      requestCancellation,
      updateAppointmentStatus,
    } = await import('./appointment.service.server')

    const suffix = randomUUID()
    const staffId = randomUUID()
    const customerId = randomUUID()
    const serviceId = randomUUID()
    const staffEmail = `lifecycle-staff-${suffix}@example.com`
    const customerEmail = `lifecycle-customer-${suffix}@example.com`

    const [existingBarber] = await db.select({ id: users.id }).from(users).innerJoin(staffProfiles, eq(staffProfiles.userId, users.id)).where(and(eq(users.role, 'staff'), eq(staffProfiles.active, true))).limit(1)
    const barberId = existingBarber?.id ?? staffId
    if (!existingBarber) {
      await db.insert(users).values({ id: staffId, email: staffEmail, role: 'staff' })
      await db.insert(staffProfiles).values({ userId: staffId, displayName: 'Lifecycle Test Barber', phone: '0612345678', active: true })
    }
    await db.insert(users).values({ id: customerId, email: customerEmail, role: 'customer' })
    await db.insert(customerProfiles).values({ userId: customerId, fullName: 'Lifecycle Customer', phone: '0612345678' })
    await db.insert(services).values({ id: serviceId, name: 'Lifecycle Test Service', description: 'Lifecycle fixture', durationMinutes: 30, priceCents: 1000, active: true })
    await db.insert(bookingSettings).values({ id: 1 }).onConflictDoNothing()

    const createdIds: string[] = []
    const requestIds: string[] = []

    try {
      const insertAppointment = async (startsAt: Date, customerUserId: string | null) => {
        const [created] = await db.insert(appointments).values({
          customerUserId,
          guestName: customerUserId ? null : 'Lifecycle Guest',
          guestPhone: customerUserId ? null : '0612345678',
          barberUserId: barberId,
          serviceId,
          serviceNameAtBooking: 'Lifecycle Test Service',
          servicePriceCentsAtBooking: 1000,
          serviceDurationMinutesAtBooking: 30,
          bufferMinutesAtBooking: 0,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60_000),
          status: 'new',
        }).returning()
        if (!created) throw new Error('fixture insert failed')
        createdIds.push(created.id)
        return created
      }

      const staffActor = { kind: 'staff' as const, userId: barberId }
      const customerActor = { kind: 'customer' as const, userId: customerId }

      const farFuture = new Date('2099-02-02T09:00:00.000Z')
      const nearFuture = new Date(Date.now() + 30 * 60_000)

      const lifecycle = await insertAppointment(farFuture, null)
      const confirmed = await updateAppointmentStatus(lifecycle.id, 'confirmed', staffActor)
      expect(confirmed.status).toBe('confirmed')
      const noShow = await updateAppointmentStatus(lifecycle.id, 'no_show', staffActor)
      expect(noShow.status).toBe('no_show')
      expect(noShow.slotReleasedAt).not.toBeNull()

      const toCancel = await insertAppointment(farFuture, null)
      const cancelled = await cancelAppointment(toCancel.id, staffActor)
      expect(cancelled.status).toBe('cancelled')
      expect(cancelled.cancelledAt).not.toBeNull()

      const toRequest = await insertAppointment(farFuture, customerId)
      const request = await requestCancellation(toRequest.id, 'Verhinderd', customerActor)
      expect(request.status).toBe('pending')
      requestIds.push(request.id)
      await expect(requestCancellation(toRequest.id, 'Opnieuw', customerActor)).rejects.toMatchObject({ code: 'CONFLICT' })
      const approved = await approveCancellationRequest(request.id, staffActor)
      expect(approved.request.status).toBe('approved')
      expect(approved.appointment.status).toBe('cancelled')

      const withinDeadline = await insertAppointment(nearFuture, customerId)
      await expect(cancelAppointment(withinDeadline.id, customerActor)).rejects.toMatchObject({ code: 'CONFLICT' })
      await expect(modifyAppointment(withinDeadline.id, { id: withinDeadline.id, serviceId, overrideOpeningHours: false, overrideBreak: false, overrideWholeDayBlock: false, confirmOverlap: false }, customerActor))
        .rejects.toMatchObject({ code: 'CONFLICT' })

      const auditActions = await db.select({ action: auditLogs.action }).from(auditLogs).where(inArray(auditLogs.entityId, [...createdIds, ...requestIds]))
      const actions = auditActions.map((row) => row.action)
      expect(actions).toContain('appointment.status_change')
      expect(actions).toContain('appointment.no_show')
      expect(actions).toContain('appointment.cancel')
      expect(actions).toContain('appointment.cancellation_request')
      expect(actions).toContain('appointment.cancellation_request.approve')
    } finally {
      await db.delete(cancellationRequests).where(inArray(cancellationRequests.id, requestIds))
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, [...createdIds, ...requestIds]))
      await db.delete(appointments).where(inArray(appointments.id, createdIds))
      await db.delete(customerProfiles).where(eq(customerProfiles.userId, customerId))
      await db.delete(users).where(eq(users.id, customerId))
      await db.delete(services).where(eq(services.id, serviceId))
      if (!existingBarber) {
        await db.delete(staffProfiles).where(eq(staffProfiles.userId, barberId))
        await db.delete(users).where(eq(users.id, barberId))
      }
    }
  })
})