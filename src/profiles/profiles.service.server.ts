import { and, asc, eq } from 'drizzle-orm'

import { recordAuditEvent } from '../auth/audit.server'
import { db } from '../db/client.server'
import type { Database } from '../db/client.server'
import { customerProfiles, ownerProfiles } from '../db/schema/profiles'
import { users } from '../db/schema/users'
import type { CustomerProfileUpdateInput, OwnerProfileUpdateInput } from './profiles.schemas'

type ProfilesExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

export type CustomerProfileDTO = {
  userId: string
  email: string
  fullName: string
  phone: string
}

export type OwnerProfileDTO = {
  userId: string
  email: string
  displayName: string
  phone: string
}

export class ProfilesError extends Error {
  constructor(message: string, readonly code: 'NOT_FOUND' | 'FAILED') {
    super(message)
    this.name = 'ProfilesError'
  }
}

export async function getCustomerProfile(userId: string): Promise<CustomerProfileDTO> {
  try {
    const [row] = await db
      .select({ userId: users.id, email: users.email, fullName: customerProfiles.fullName, phone: customerProfiles.phone })
      .from(customerProfiles)
      .innerJoin(users, eq(users.id, customerProfiles.userId))
      .where(eq(customerProfiles.userId, userId))
      .limit(1)
    if (!row) throw new ProfilesError('Profiel niet gevonden.', 'NOT_FOUND')
    return row
  } catch (error) {
    if (error instanceof ProfilesError) throw error
    throw new ProfilesError('Profiel kon niet worden geladen.', 'FAILED')
  }
}

export async function updateCustomerProfile(userId: string, input: CustomerProfileUpdateInput): Promise<CustomerProfileDTO> {
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(customerProfiles).where(eq(customerProfiles.userId, userId)).limit(1)
      if (!before) throw new ProfilesError('Profiel niet gevonden.', 'NOT_FOUND')
      const [updated] = await tx.update(customerProfiles).set({ fullName: input.fullName, phone: input.phone, updatedAt: new Date() }).where(eq(customerProfiles.userId, userId)).returning()
      if (!updated) throw new ProfilesError('Profiel kon niet worden bijgewerkt.', 'FAILED')
      await recordAuditEvent({
        action: 'profile.customer.update',
        actorUserId: userId,
        entityType: 'profile',
        entityId: userId,
        metadata: { before: { fullName: before.fullName, phone: before.phone }, after: { fullName: updated.fullName, phone: updated.phone } },
      }, tx)
      const [user] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1)
      return { userId, email: user?.email ?? '', fullName: updated.fullName, phone: updated.phone }
    })
  } catch (error) {
    if (error instanceof ProfilesError) throw error
    throw new ProfilesError('Profiel kon niet worden bijgewerkt.', 'FAILED')
  }
}

export async function getOwnerProfile(userId: string): Promise<OwnerProfileDTO> {
  try {
    const [row] = await db
      .select({ userId: users.id, email: users.email, displayName: ownerProfiles.displayName, phone: ownerProfiles.phone })
      .from(ownerProfiles)
      .innerJoin(users, eq(users.id, ownerProfiles.userId))
      .where(and(eq(ownerProfiles.userId, userId), eq(ownerProfiles.active, true)))
      .limit(1)
    if (!row) throw new ProfilesError('Profiel niet gevonden.', 'NOT_FOUND')
    return row
  } catch (error) {
    if (error instanceof ProfilesError) throw error
    throw new ProfilesError('Profiel kon niet worden geladen.', 'FAILED')
  }
}

export type PublicOwnerProfileDTO = {
  displayName: string
}

export async function getPublicOwnerProfile(): Promise<PublicOwnerProfileDTO | null> {
  try {
    const [row] = await db
      .select({ displayName: ownerProfiles.displayName })
      .from(ownerProfiles)
      .where(eq(ownerProfiles.active, true))
      .orderBy(asc(ownerProfiles.createdAt))
      .limit(1)
    return row ?? null
  } catch {
    throw new ProfilesError('Eigenaarnaam kon niet worden geladen.', 'FAILED')
  }
}

export async function updateOwnerProfile(userId: string, input: OwnerProfileUpdateInput): Promise<OwnerProfileDTO> {
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(ownerProfiles).where(and(eq(ownerProfiles.userId, userId), eq(ownerProfiles.active, true))).limit(1)
      if (!before) throw new ProfilesError('Profiel niet gevonden.', 'NOT_FOUND')
      const [updated] = await tx.update(ownerProfiles).set({ displayName: input.displayName, phone: input.phone, updatedAt: new Date() }).where(eq(ownerProfiles.userId, userId)).returning()
      if (!updated) throw new ProfilesError('Profiel kon niet worden bijgewerkt.', 'FAILED')
      await recordAuditEvent({
        action: 'profile.owner.update',
        actorUserId: userId,
        entityType: 'profile',
        entityId: userId,
        metadata: { before: { displayName: before.displayName, phone: before.phone }, after: { displayName: updated.displayName, phone: updated.phone } },
      }, tx)
      const [user] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1)
      return { userId, email: user?.email ?? '', displayName: updated.displayName, phone: updated.phone }
    })
  } catch (error) {
    if (error instanceof ProfilesError) throw error
    throw new ProfilesError('Profiel kon niet worden bijgewerkt.', 'FAILED')
  }
}