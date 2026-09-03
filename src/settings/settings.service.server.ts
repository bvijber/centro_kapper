import { asc, eq } from 'drizzle-orm'

import { recordAuditEvent } from '../auth/audit.server'
import { db } from '../db/client.server'
import type { JsonValue } from '../db/schema/audit-logs'
import { breakPeriods, businessProfile, openingHours, wholeDayBlocks } from '../db/schema/business'
import type { Database } from '../db/client.server'
import type { BreakPeriodCreate, BusinessProfileUpdate, OpeningHoursUpdate, WholeDayBlockCreate } from './settings.schemas'

type SettingsExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

export class SettingsError extends Error {
  constructor(message: string, readonly code: 'NOT_FOUND' | 'CONFLICT' | 'FAILED') {
    super(message)
    this.name = 'SettingsError'
  }
}

function isUniqueViolation(error: unknown): boolean {
  return String(error).toLowerCase().includes('unique')
}

async function audit(executor: SettingsExecutor, action: string, entityId?: string, metadata?: JsonValue) {
  await recordAuditEvent({ action, entityType: 'settings', entityId, metadata }, executor)
}

function mapOpeningHour(row: Pick<typeof openingHours.$inferSelect, 'weekday' | 'isOpen' | 'openingTime' | 'closingTime'>) {
  return { weekday: row.weekday, isOpen: row.isOpen, openingTime: row.openingTime, closingTime: row.closingTime }
}

function mapBreakPeriod(row: typeof breakPeriods.$inferSelect) {
  return { id: row.id, startsAt: row.startsAt, endsAt: row.endsAt, note: row.note, active: row.active, createdAt: row.createdAt, updatedAt: row.updatedAt }
}

function mapWholeDayBlock(row: typeof wholeDayBlocks.$inferSelect) {
  return { id: row.id, blockDate: row.blockDate, note: row.note, active: row.active, createdAt: row.createdAt, updatedAt: row.updatedAt }
}

export async function getBusinessProfile() {
  try {
    const [profile] = await db.select({ name: businessProfile.name, address: businessProfile.address, phone: businessProfile.phone }).from(businessProfile).where(eq(businessProfile.id, 1)).limit(1)
    return profile ?? null
  } catch {
    throw new SettingsError('Bedrijfsinformatie kon niet worden geladen.', 'FAILED')
  }
}

export async function getOpeningHours() {
  try {
    const rows = await db.select().from(openingHours).orderBy(asc(openingHours.weekday))
    return rows.map(mapOpeningHour)
  } catch {
    throw new SettingsError('Openingstijden konden niet worden geladen.', 'FAILED')
  }
}

export async function getSettings() {
  try {
    const [profile, hours, breaks, blocks] = await Promise.all([
      db.select().from(businessProfile).where(eq(businessProfile.id, 1)).limit(1),
      db.select().from(openingHours).orderBy(asc(openingHours.weekday)),
      db.select().from(breakPeriods).orderBy(asc(breakPeriods.startsAt), asc(breakPeriods.id)),
      db.select().from(wholeDayBlocks).orderBy(asc(wholeDayBlocks.blockDate), asc(wholeDayBlocks.id)),
    ])
    if (!profile[0]) throw new SettingsError('Bedrijfsinformatie ontbreekt.', 'NOT_FOUND')
    return {
      businessProfile: profile[0],
      openingHours: hours.map(mapOpeningHour),
      breakPeriods: breaks.map(mapBreakPeriod),
      wholeDayBlocks: blocks.map(mapWholeDayBlock),
    }
  } catch (error) {
    if (error instanceof SettingsError) throw error
    throw new SettingsError('Instellingen konden niet worden geladen.', 'FAILED')
  }
}

export async function updateBusinessProfile(input: BusinessProfileUpdate) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(businessProfile).where(eq(businessProfile.id, 1)).limit(1)
    if (!before) throw new SettingsError('Bedrijfsinformatie ontbreekt.', 'NOT_FOUND')
    const [updated] = await tx.update(businessProfile).set({ ...input, updatedAt: new Date() }).where(eq(businessProfile.id, 1)).returning()
    if (!updated) throw new SettingsError('Bedrijfsinformatie kon niet worden opgeslagen.', 'FAILED')
    await audit(tx, 'settings.business_profile.update', '1', { before: { name: before.name, address: before.address, phone: before.phone }, after: input })
    return { name: updated.name, address: updated.address, phone: updated.phone }
  })
}

export async function updateOpeningHours(input: OpeningHoursUpdate) {
  return db.transaction(async (tx) => {
    const before = await tx.select().from(openingHours).orderBy(asc(openingHours.weekday))
    const entries = [...input.openingHours].sort((a, b) => a.weekday - b.weekday)
    for (const entry of entries) {
      const [existing] = await tx.select({ id: openingHours.id }).from(openingHours).where(eq(openingHours.weekday, entry.weekday)).limit(1)
      if (existing) {
        await tx.update(openingHours).set({ isOpen: entry.isOpen, openingTime: entry.isOpen ? entry.openingTime : null, closingTime: entry.isOpen ? entry.closingTime : null, updatedAt: new Date() }).where(eq(openingHours.id, existing.id))
      } else {
        await tx.insert(openingHours).values({ ...entry, openingTime: entry.isOpen ? entry.openingTime : null, closingTime: entry.isOpen ? entry.closingTime : null })
      }
    }
    await audit(tx, 'settings.opening_hours.update', undefined, { before: before.map(mapOpeningHour), after: entries.map(mapOpeningHour) })
    const rows = await tx.select().from(openingHours).orderBy(asc(openingHours.weekday))
    return rows.map(mapOpeningHour)
  })
}

export async function createBreakPeriod(input: BreakPeriodCreate) {
  return db.transaction(async (tx) => {
    try {
      const [created] = await tx.insert(breakPeriods).values(input).returning()
      if (!created) throw new SettingsError('Pauze kon niet worden aangemaakt.', 'FAILED')
      await audit(tx, 'settings.break_period.create', created.id, { startsAt: created.startsAt.toISOString(), endsAt: created.endsAt.toISOString(), active: created.active })
      return mapBreakPeriod(created)
    } catch (error) {
      if (error instanceof SettingsError) throw error
      throw new SettingsError('Pauze kon niet worden aangemaakt.', isUniqueViolation(error) ? 'CONFLICT' : 'FAILED')
    }
  })
}

export async function deleteBreakPeriod(id: string) {
  return db.transaction(async (tx) => {
    const [deleted] = await tx.delete(breakPeriods).where(eq(breakPeriods.id, id)).returning()
    if (!deleted) throw new SettingsError('Pauze bestaat niet.', 'NOT_FOUND')
    await audit(tx, 'settings.break_period.delete', id, { startsAt: deleted.startsAt.toISOString(), endsAt: deleted.endsAt.toISOString() })
    return { id }
  })
}

export async function createWholeDayBlock(input: WholeDayBlockCreate) {
  return db.transaction(async (tx) => {
    try {
      const [created] = await tx.insert(wholeDayBlocks).values(input).returning()
      if (!created) throw new SettingsError('Blokkade kon niet worden aangemaakt.', 'FAILED')
      await audit(tx, 'settings.whole_day_block.create', created.id, { blockDate: created.blockDate, active: created.active })
      return mapWholeDayBlock(created)
    } catch (error) {
      if (error instanceof SettingsError) throw error
      throw new SettingsError(isUniqueViolation(error) ? 'Deze datum is al geblokkeerd.' : 'Blokkade kon niet worden aangemaakt.', isUniqueViolation(error) ? 'CONFLICT' : 'FAILED')
    }
  })
}

export async function deleteWholeDayBlock(id: string) {
  return db.transaction(async (tx) => {
    const [deleted] = await tx.delete(wholeDayBlocks).where(eq(wholeDayBlocks.id, id)).returning()
    if (!deleted) throw new SettingsError('Blokkade bestaat niet.', 'NOT_FOUND')
    await audit(tx, 'settings.whole_day_block.delete', id, { blockDate: deleted.blockDate, active: deleted.active })
    return { id }
  })
}
