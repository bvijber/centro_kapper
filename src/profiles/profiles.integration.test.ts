import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

const databaseAvailable = Boolean(process.env.DATABASE_URL)

describe.skipIf(!databaseAvailable)('profiles integration', () => {
  it('reads and updates the own customer profile and isolates ownership', async () => {
    const { db } = await import('../db/client.server')
    const { eq } = await import('drizzle-orm')
    const { auditLogs, customerProfiles, users } = await import('../db/schema')
    const { getCustomerProfile, updateCustomerProfile } = await import('./profiles.service.server')

    const firstId = randomUUID()
    const secondId = randomUUID()
    const firstEmail = `profile-a-${randomUUID()}@example.com`
    const secondEmail = `profile-b-${randomUUID()}@example.com`

    await db.insert(users).values([{ id: firstId, email: firstEmail, role: 'customer' }, { id: secondId, email: secondEmail, role: 'customer' }])
    await db.insert(customerProfiles).values([{ userId: firstId, fullName: 'Klant Een', phone: '0611111111' }, { userId: secondId, fullName: 'Klant Twee', phone: '0622222222' }])

    try {
      const profile = await getCustomerProfile(firstId)
      expect(profile).toMatchObject({ userId: firstId, email: firstEmail, fullName: 'Klant Een', phone: '0611111111' })

      const updated = await updateCustomerProfile(firstId, { fullName: 'Klant Een Gewijzigd', phone: '0633333333' })
      expect(updated).toMatchObject({ userId: firstId, email: firstEmail, fullName: 'Klant Een Gewijzigd', phone: '0633333333' })

      const second = await getCustomerProfile(secondId)
      expect(second.fullName).toBe('Klant Twee')

      const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.entityId, firstId)).limit(1)
      expect(audit?.action).toBe('profile.customer.update')
    } finally {
      await db.delete(auditLogs).where(eq(auditLogs.entityId, firstId))
      await db.delete(customerProfiles).where(eq(customerProfiles.userId, firstId))
      await db.delete(customerProfiles).where(eq(customerProfiles.userId, secondId))
      await db.delete(users).where(eq(users.id, firstId))
      await db.delete(users).where(eq(users.id, secondId))
    }
  })

  it('reads and updates the own staff profile', async () => {
    const { db } = await import('../db/client.server')
    const { eq } = await import('drizzle-orm')
    const { auditLogs, staffProfiles, users } = await import('../db/schema')
    const { getStaffProfile, updateStaffProfile } = await import('./profiles.service.server')

    const [existingBarber] = await db.select({ id: users.id }).from(users).innerJoin(staffProfiles, eq(staffProfiles.userId, users.id)).where(eq(staffProfiles.active, true)).limit(1)
    const staffId = existingBarber?.id ?? randomUUID()
    const created = !existingBarber
    if (created) {
      await db.insert(users).values({ id: staffId, email: `profile-staff-${randomUUID()}@example.com`, role: 'staff' })
      await db.insert(staffProfiles).values({ userId: staffId, displayName: 'Sam Vermeer', phone: '0612345678', active: true })
    }

    try {
      const profile = await getStaffProfile(staffId)
      expect(profile.userId).toBe(staffId)

      const updated = await updateStaffProfile(staffId, { displayName: 'Sam V. Vermeer', phone: '0687654321' })
      expect(updated).toMatchObject({ userId: staffId, displayName: 'Sam V. Vermeer', phone: '0687654321' })

      const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.entityId, staffId)).limit(1)
      expect(audit?.action).toBe('profile.staff.update')
    } finally {
      await db.delete(auditLogs).where(eq(auditLogs.entityId, staffId))
      if (created) {
        await db.delete(staffProfiles).where(eq(staffProfiles.userId, staffId))
        await db.delete(users).where(eq(users.id, staffId))
      }
    }
  })
})