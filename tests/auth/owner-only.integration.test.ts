import { randomUUID } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/auth/request-context.server', () => ({
  getRequestAuditContext: () => ({ ip: '127.0.0.1', userAgent: 'vitest' }),
  getClientIP: () => '127.0.0.1',
}))

const databaseAvailable = Boolean(process.env.DATABASE_URL)

describe.skipIf(!databaseAvailable)('owner-only runtime invariants', () => {
  it('rejects a second owner account sequentially', async () => {
    const { createInitialOwnerAccount } = await import('../../src/auth/auth.service.server')
    const { db } = await import('../../src/db/client.server')
    const { sql } = await import('drizzle-orm')
    const { users } = await import('../../src/db/schema')

    const before = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(sql`role = 'owner'`)
    expect(before[0]?.n).toBeGreaterThanOrEqual(1)

    await expect(createInitialOwnerAccount({
      email: `second-owner-${randomUUID()}@example.com`,
      password: 'Welkom1234!',
      displayName: 'Tweede Eigenaar',
      phone: '0612345678',
    })).rejects.toMatchObject({ code: 'SETUP_FAILED' })

    const after = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(sql`role = 'owner'`)
    expect(after[0]?.n).toBe(before[0]?.n)
  })

  it('rejects concurrent owner creation attempts', async () => {
    const { createInitialOwnerAccount } = await import('../../src/auth/auth.service.server')
    const { db } = await import('../../src/db/client.server')
    const { sql } = await import('drizzle-orm')
    const { users } = await import('../../src/db/schema')

    const before = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(sql`role = 'owner'`)
    const suffix = randomUUID()
    const input = (name: string) => ({
      email: `${name}-${suffix}@example.com`,
      password: 'Welkom1234!',
      displayName: name,
      phone: '0612345678',
    })

    const results = await Promise.allSettled([
      createInitialOwnerAccount(input('owner-a')),
      createInitialOwnerAccount(input('owner-b')),
      createInitialOwnerAccount(input('owner-c')),
    ])

    expect(results.every((result) => result.status === 'rejected')).toBe(true)
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(sql`role = 'owner'`)
    expect(after[0]?.n).toBe(before[0]?.n)
  })

  it('enforces the single-owner row in the database itself', async () => {
    const { db } = await import('../../src/db/client.server')
    const { sql } = await import('drizzle-orm')
    const { users } = await import('../../src/db/schema')

    const [owner] = await db.select({ id: users.id }).from(users).where(sql`role = 'owner'`).limit(1)
    expect(owner).toBeDefined()

    const email = `db-second-owner-${randomUUID()}@example.com`
    const violation = await db
      .insert(users)
      .values({ email, passwordHash: null, role: 'owner' })
      .then(() => null)
      .catch((error: unknown) => error)

    try {
      expect(violation).not.toBeNull()
      expect(String(violation).toLowerCase()).toMatch(/unique|duplicate|failed query/)

      const indexRows = await db.execute(sql`SELECT indexname FROM pg_indexes WHERE tablename = 'users' AND indexname = 'users_single_owner_idx'`)
      expect(indexRows.rows.length).toBe(1)
    } finally {
      await db.delete(users).where(sql`email = ${email}`)
    }
  })

  it('keeps multiple customer accounts possible', async () => {
    const { db } = await import('../../src/db/client.server')
    const { eq } = await import('drizzle-orm')
    const { customerProfiles, users } = await import('../../src/db/schema')

    const ids = [randomUUID(), randomUUID()]
    await db.insert(users).values([
      { id: ids[0], email: `multi-a-${ids[0]}@example.com`, role: 'customer' },
      { id: ids[1], email: `multi-b-${ids[1]}@example.com`, role: 'customer' },
    ])
    await db.insert(customerProfiles).values([
      { userId: ids[0], fullName: 'Klant A', phone: '0611111111' },
      { userId: ids[1], fullName: 'Klant B', phone: '0622222222' },
    ])

    try {
      const rows = await db.select({ id: users.id }).from(users).where(eq(users.role, 'customer'))
      expect(rows.map((row) => row.id)).toEqual(expect.arrayContaining(ids))
    } finally {
      await db.delete(customerProfiles).where(eq(customerProfiles.userId, ids[0]))
      await db.delete(customerProfiles).where(eq(customerProfiles.userId, ids[1]))
      await db.delete(users).where(eq(users.id, ids[0]))
      await db.delete(users).where(eq(users.id, ids[1]))
    }
  })

  it('refuses to authenticate a legacy staff-role account', async () => {
    const { db } = await import('../../src/db/client.server')
    const { and, eq, gte } = await import('drizzle-orm')
    const { auditLogs, sessions, users } = await import('../../src/db/schema')
    const { hashPassword } = await import('../../src/auth/password.server')
    const { login } = await import('../../src/auth/auth.service.server')

    const id = randomUUID()
    const email = `legacy-staff-${id}@example.com`
    const passwordHash = await hashPassword('Welkom1234!')
    await db.insert(users).values({ id, email, passwordHash, role: 'staff' })
    const startedAt = new Date()

    try {
      await expect(login({ email, password: 'Welkom1234!' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
      const createdSessions = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, id))
      expect(createdSessions).toHaveLength(0)
    } finally {
      await db.delete(auditLogs).where(and(eq(auditLogs.action, 'auth.login.failed'), gte(auditLogs.createdAt, startedAt)))
      await db.delete(sessions).where(eq(sessions.userId, id))
      await db.delete(users).where(eq(users.id, id))
    }
  })
})
