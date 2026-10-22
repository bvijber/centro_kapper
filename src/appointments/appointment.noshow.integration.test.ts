import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

const databaseAvailable = Boolean(process.env.DATABASE_URL)

describe.skipIf(!databaseAvailable)('appointment no-show slot release', () => {
  it('releases the slot automatically with the default manual setting (Test A)', { timeout: 30000 }, async () => {
    const { db } = await import('../db/client.server')
    const { eq, inArray } = await import('drizzle-orm')
    const { appointments, auditLogs, bookingSettings, services } = await import('../db/schema')
    const { updateAppointmentStatus } = await import('./appointment.service.server')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    const serviceId = randomUUID()
    const ownerFixture = await ensureActiveOwnerFixture('noshow-release')
    const ownerActor = { kind: 'owner' as const, userId: ownerFixture.userId }
    const createdIds: string[] = []
    const [previousSettings] = await db
      .select({ noShowReleaseBehavior: bookingSettings.noShowReleaseBehavior })
      .from(bookingSettings)
      .where(eq(bookingSettings.id, 1))
      .limit(1)
    if (!previousSettings) {
      await db.insert(bookingSettings).values({ id: 1 }).onConflictDoNothing()
    }
    await db.insert(services).values({ id: serviceId, name: 'No-show Release Service', description: 'No-show fixture', durationMinutes: 30, priceCents: 1000, active: true })
    // Reproduceer het oorspronkelijke defect: de standaardinstelling is manual.
    await db.update(bookingSettings).set({ noShowReleaseBehavior: 'manual' }).where(eq(bookingSettings.id, 1))

    try {
      const startsAt = new Date('2099-03-02T09:00:00.000Z')
      const [created] = await db.insert(appointments).values({
        guestName: 'No-show Guest',
        guestPhone: '0612345678',
        barberUserId: ownerFixture.userId,
        serviceId,
        serviceNameAtBooking: 'No-show Release Service',
        servicePriceCentsAtBooking: 1000,
        serviceDurationMinutesAtBooking: 30,
        bufferMinutesAtBooking: 0,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        status: 'new',
      }).returning()
      if (!created) throw new Error('fixture insert failed')
      createdIds.push(created.id)

      const noShow = await updateAppointmentStatus(created.id, 'no_show', ownerActor)
      expect(noShow.status).toBe('no_show')
      expect(noShow.slotReleasedAt).not.toBeNull()
    } finally {
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdIds))
      await db.delete(appointments).where(inArray(appointments.id, createdIds))
      await db.delete(services).where(eq(services.id, serviceId))
      await db
        .update(bookingSettings)
        .set({ noShowReleaseBehavior: previousSettings?.noShowReleaseBehavior ?? 'manual' })
        .where(eq(bookingSettings.id, 1))
      await removeOwnerFixture(ownerFixture)
    }
  })

  it('makes the released slot bookable again (Test B)', { timeout: 30000 }, async () => {
    const { db } = await import('../db/client.server')
    const { eq, inArray } = await import('drizzle-orm')
    const { appointments, auditLogs, bookingSettings, businessProfile, openingHours, services } = await import('../db/schema')
    const { createAppointment, getAvailability, updateAppointmentStatus } = await import('./appointment.service.server')
    const { parseAmsterdamLocal } = await import('../timezone')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    const date = '2099-06-15'
    const weekday = new Date(Date.UTC(2099, 5, 15, 12)).getUTCDay()
    const serviceId = randomUUID()
    const ownerFixture = await ensureActiveOwnerFixture('noshow-rebook')
    const ownerActor = { kind: 'owner' as const, userId: ownerFixture.userId }
    const createdIds: string[] = []

    const [previousSettings] = await db
      .select({ noShowReleaseBehavior: bookingSettings.noShowReleaseBehavior })
      .from(bookingSettings)
      .where(eq(bookingSettings.id, 1))
      .limit(1)
    if (!previousSettings) {
      await db.insert(bookingSettings).values({ id: 1 }).onConflictDoNothing()
    }
    const [previousProfile] = await db.select({ id: businessProfile.id }).from(businessProfile).where(eq(businessProfile.id, 1)).limit(1)
    const createdProfile = !previousProfile
    if (createdProfile) {
      await db.insert(businessProfile).values({ id: 1, name: 'No-show salon', address: 'Test address', phone: '0612345678', timezone: 'Europe/Amsterdam' })
    }
    const [previousHours] = await db.select().from(openingHours).where(eq(openingHours.weekday, weekday)).limit(1)
    await db.insert(openingHours).values({ weekday, isOpen: true, openingTime: '08:00', closingTime: '18:00' })
      .onConflictDoUpdate({ target: openingHours.weekday, set: { isOpen: true, openingTime: '08:00', closingTime: '18:00' } })
    await db.insert(services).values({ id: serviceId, name: 'No-show Rebook Service', description: 'No-show fixture', durationMinutes: 30, priceCents: 1000, active: true })
    await db.update(bookingSettings).set({ noShowReleaseBehavior: 'manual' }).where(eq(bookingSettings.id, 1))

    try {
      const startsAt = parseAmsterdamLocal(date, '10:00')
      if (!startsAt) throw new Error('fixture local time invalid')
      const [created] = await db.insert(appointments).values({
        guestName: 'No-show Guest',
        guestPhone: '0612345678',
        barberUserId: ownerFixture.userId,
        serviceId,
        serviceNameAtBooking: 'No-show Rebook Service',
        servicePriceCentsAtBooking: 1000,
        serviceDurationMinutesAtBooking: 30,
        bufferMinutesAtBooking: 0,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        status: 'new',
      }).returning()
      if (!created) throw new Error('fixture insert failed')
      createdIds.push(created.id)

      const noShow = await updateAppointmentStatus(created.id, 'no_show', ownerActor)
      expect(noShow.slotReleasedAt).not.toBeNull()

      const availability = await getAvailability({ serviceId, date })
      expect(availability.slots.some((slot) => slot.time === '10:00')).toBe(true)

      const rebooked = await createAppointment({
        serviceId,
        localDate: date,
        localTime: '10:00',
        guestName: 'No-show Rebook',
        guestPhone: '0612345678',
        overrideOpeningHours: false,
        overrideBreak: false,
        overrideWholeDayBlock: false,
        confirmOverlap: false,
      }, ownerActor)
      createdIds.push(rebooked.id)
      expect(rebooked.status).toBe('new')
    } finally {
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdIds))
      await db.delete(appointments).where(inArray(appointments.id, createdIds))
      await db.delete(services).where(eq(services.id, serviceId))
      if (previousHours) {
        await db.update(openingHours).set({
          isOpen: previousHours.isOpen,
          openingTime: previousHours.openingTime,
          closingTime: previousHours.closingTime,
        }).where(eq(openingHours.id, previousHours.id))
      } else {
        await db.delete(openingHours).where(eq(openingHours.weekday, weekday))
      }
      if (createdProfile) {
        await db.delete(businessProfile).where(eq(businessProfile.id, 1))
      }
      await db
        .update(bookingSettings)
        .set({ noShowReleaseBehavior: previousSettings?.noShowReleaseBehavior ?? 'manual' })
        .where(eq(bookingSettings.id, 1))
      await removeOwnerFixture(ownerFixture)
    }
  })

  it('rejects a repeated no-show without changing the release (Test C)', { timeout: 30000 }, async () => {
    const { db } = await import('../db/client.server')
    const { eq, inArray } = await import('drizzle-orm')
    const { appointments, auditLogs, bookingSettings, services } = await import('../db/schema')
    const { updateAppointmentStatus } = await import('./appointment.service.server')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    const serviceId = randomUUID()
    const ownerFixture = await ensureActiveOwnerFixture('noshow-repeat')
    const ownerActor = { kind: 'owner' as const, userId: ownerFixture.userId }
    const createdIds: string[] = []
    await db.insert(bookingSettings).values({ id: 1 }).onConflictDoNothing()
    await db.insert(services).values({ id: serviceId, name: 'No-show Repeat Service', description: 'No-show fixture', durationMinutes: 30, priceCents: 1000, active: true })

    try {
      const startsAt = new Date('2099-04-02T09:00:00.000Z')
      const [created] = await db.insert(appointments).values({
        guestName: 'No-show Guest',
        guestPhone: '0612345678',
        barberUserId: ownerFixture.userId,
        serviceId,
        serviceNameAtBooking: 'No-show Repeat Service',
        servicePriceCentsAtBooking: 1000,
        serviceDurationMinutesAtBooking: 30,
        bufferMinutesAtBooking: 0,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        status: 'new',
      }).returning()
      if (!created) throw new Error('fixture insert failed')
      createdIds.push(created.id)

      const first = await updateAppointmentStatus(created.id, 'no_show', ownerActor)
      expect(first.slotReleasedAt).not.toBeNull()
      await expect(updateAppointmentStatus(created.id, 'no_show', ownerActor)).rejects.toMatchObject({ code: 'INVALID' })

      const [stored] = await db.select({ slotReleasedAt: appointments.slotReleasedAt }).from(appointments).where(eq(appointments.id, created.id)).limit(1)
      expect(stored?.slotReleasedAt?.toISOString()).toBe(first.slotReleasedAt?.toISOString())
    } finally {
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdIds))
      await db.delete(appointments).where(inArray(appointments.id, createdIds))
      await db.delete(services).where(eq(services.id, serviceId))
      await removeOwnerFixture(ownerFixture)
    }
  })

  it('allows exactly one of two concurrent no-show transitions (Test D)', { timeout: 30000 }, async () => {
    const { db } = await import('../db/client.server')
    const { eq, inArray } = await import('drizzle-orm')
    const { appointments, auditLogs, bookingSettings, services } = await import('../db/schema')
    const { updateAppointmentStatus } = await import('./appointment.service.server')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    const serviceId = randomUUID()
    const ownerFixture = await ensureActiveOwnerFixture('noshow-concurrent')
    const ownerActor = { kind: 'owner' as const, userId: ownerFixture.userId }
    const createdIds: string[] = []
    await db.insert(bookingSettings).values({ id: 1 }).onConflictDoNothing()
    await db.insert(services).values({ id: serviceId, name: 'No-show Concurrent Service', description: 'No-show fixture', durationMinutes: 30, priceCents: 1000, active: true })

    try {
      const startsAt = new Date('2099-05-02T09:00:00.000Z')
      const [created] = await db.insert(appointments).values({
        guestName: 'No-show Guest',
        guestPhone: '0612345678',
        barberUserId: ownerFixture.userId,
        serviceId,
        serviceNameAtBooking: 'No-show Concurrent Service',
        servicePriceCentsAtBooking: 1000,
        serviceDurationMinutesAtBooking: 30,
        bufferMinutesAtBooking: 0,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        status: 'new',
      }).returning()
      if (!created) throw new Error('fixture insert failed')
      createdIds.push(created.id)

      const [first, second] = await Promise.allSettled([
        updateAppointmentStatus(created.id, 'no_show', ownerActor),
        updateAppointmentStatus(created.id, 'no_show', ownerActor),
      ])
      expect([first.status, second.status].filter((status) => status === 'fulfilled')).toHaveLength(1)
      expect([first.status, second.status].filter((status) => status === 'rejected')).toHaveLength(1)
      const rejected = [first, second].find((result): result is PromiseRejectedResult => result.status === 'rejected')
      expect(rejected?.reason).toMatchObject({ code: 'INVALID' })

      const [stored] = await db.select({ status: appointments.status, slotReleasedAt: appointments.slotReleasedAt }).from(appointments).where(eq(appointments.id, created.id)).limit(1)
      expect(stored?.status).toBe('no_show')
      expect(stored?.slotReleasedAt).not.toBeNull()
    } finally {
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdIds))
      await db.delete(appointments).where(inArray(appointments.id, createdIds))
      await db.delete(services).where(eq(services.id, serviceId))
      await removeOwnerFixture(ownerFixture)
    }
  })

  it('records the release in the no-show audit entry (Test E)', { timeout: 30000 }, async () => {
    const { db } = await import('../db/client.server')
    const { desc, eq, inArray } = await import('drizzle-orm')
    const { appointments, auditLogs, bookingSettings, services } = await import('../db/schema')
    const { updateAppointmentStatus } = await import('./appointment.service.server')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    const serviceId = randomUUID()
    const ownerFixture = await ensureActiveOwnerFixture('noshow-audit')
    const ownerActor = { kind: 'owner' as const, userId: ownerFixture.userId }
    const createdIds: string[] = []
    await db.insert(bookingSettings).values({ id: 1 }).onConflictDoNothing()
    await db.insert(services).values({ id: serviceId, name: 'No-show Audit Service', description: 'No-show fixture', durationMinutes: 30, priceCents: 1000, active: true })

    try {
      const startsAt = new Date('2099-07-02T09:00:00.000Z')
      const [created] = await db.insert(appointments).values({
        guestName: 'No-show Guest',
        guestPhone: '0612345678',
        barberUserId: ownerFixture.userId,
        serviceId,
        serviceNameAtBooking: 'No-show Audit Service',
        servicePriceCentsAtBooking: 1000,
        serviceDurationMinutesAtBooking: 30,
        bufferMinutesAtBooking: 0,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        status: 'new',
      }).returning()
      if (!created) throw new Error('fixture insert failed')
      createdIds.push(created.id)

      await updateAppointmentStatus(created.id, 'no_show', ownerActor)

      const [entry] = await db
        .select({ metadata: auditLogs.metadata })
        .from(auditLogs)
        .where(eq(auditLogs.entityId, created.id))
        .orderBy(desc(auditLogs.createdAt))
        .limit(1)
      const metadata = entry?.metadata as { after?: { status?: unknown; slotReleasedAt?: unknown } } | null
      expect(metadata?.after?.status).toBe('no_show')
      expect(typeof metadata?.after?.slotReleasedAt).toBe('string')
    } finally {
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdIds))
      await db.delete(appointments).where(inArray(appointments.id, createdIds))
      await db.delete(services).where(eq(services.id, serviceId))
      await removeOwnerFixture(ownerFixture)
    }
  })
})
