import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

const databaseAvailable = Boolean(process.env.DATABASE_URL)

describe.skipIf(!databaseAvailable)('availability integration', () => {
  it('reads active service and Amsterdam opening hours from PostgreSQL', async () => {
    const { db } = await import('../db/client.server')
    const { eq } = await import('drizzle-orm')
    const { businessProfile, bookingSettings, openingHours, services } = await import('../db/schema')
    const { getAvailability } = await import('../appointments/appointment.service.server')
    const serviceId = randomUUID()

    await db.insert(services).values({ id: serviceId, name: 'Phase 4 Availability Service', description: 'Integration fixture', durationMinutes: 30, priceCents: 1000, active: true })
    await db.insert(businessProfile).values({ id: 1, name: 'Test salon', address: 'Test address', phone: '0612345678', timezone: 'Europe/Amsterdam' }).onConflictDoNothing()
    await db.insert(bookingSettings).values({ id: 1 }).onConflictDoNothing()
    await db.insert(openingHours).values({ weekday: 4, isOpen: true, openingTime: '09:00', closingTime: '18:00' }).onConflictDoUpdate({ target: openingHours.weekday, set: { isOpen: true, openingTime: '09:00', closingTime: '18:00' } })
    try {
      const result = await getAvailability({ serviceId, date: '2099-01-01' })
      expect(result.date).toBe('2099-01-01')
      expect(result.slots.some((slot) => slot.time === '09:00')).toBe(true)
      expect(result.slots.every((slot) => slot.startsAt.endsWith('Z') && slot.endsAt.endsWith('Z'))).toBe(true)
    } finally {
      await db.delete(services).where(eq(services.id, serviceId))
    }
  })
})
