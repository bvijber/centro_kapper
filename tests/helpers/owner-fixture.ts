import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'

import { db } from '../../src/db/client.server'
import { ownerProfiles, users } from '../../src/db/schema'

export type OwnerFixture = { userId: string; created: boolean }

/**
 * Resolves the single active owner used by appointment/queue tests.
 * Creates a temporary owner only when the database has no active owner at all,
 * because the database enforces at most one owner account.
 */
export async function ensureActiveOwnerFixture(label: string): Promise<OwnerFixture> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(ownerProfiles, eq(ownerProfiles.userId, users.id))
    .where(and(eq(users.role, 'owner'), eq(ownerProfiles.active, true)))
    .limit(1)
  if (existing) return { userId: existing.id, created: false }

  const id = randomUUID()
  await db.insert(users).values({ id, email: `${label}-${id}@example.com`, role: 'owner' })
  await db.insert(ownerProfiles).values({ userId: id, displayName: `${label} Owner`, phone: '0612345678', active: true })
  return { userId: id, created: true }
}

export async function removeOwnerFixture(fixture: OwnerFixture): Promise<void> {
  if (!fixture.created) return
  await db.delete(ownerProfiles).where(eq(ownerProfiles.userId, fixture.userId))
  await db.delete(users).where(eq(users.id, fixture.userId))
}
