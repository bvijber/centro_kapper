import { asc, eq } from 'drizzle-orm'

import { recordAuditEvent } from '../auth/audit.server'
import { db } from '../db/client.server'
import type { Database } from '../db/client.server'
import type { JsonValue } from '../db/schema/audit-logs'
import { services } from '../db/schema/services'
import type { ServiceCreateInput, ServiceUpdateInput } from './services.schemas'

type ServicesExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

export type ServiceDTO = {
  id: string
  name: string
  description: string
  durationMinutes: number
  priceCents: number
  active: boolean
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export class ServicesError extends Error {
  constructor(message: string, readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'FAILED') {
    super(message)
    this.name = 'ServicesError'
  }
}

async function audit(executor: ServicesExecutor, action: string, serviceId: string, metadata?: JsonValue) {
  await recordAuditEvent({ action, entityType: 'service', entityId: serviceId, metadata }, executor)
}

function mapService(row: typeof services.$inferSelect): ServiceDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    durationMinutes: row.durationMinutes,
    priceCents: row.priceCents,
    active: row.active,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function listServices(): Promise<ServiceDTO[]> {
  try {
    const rows = await db.select().from(services).orderBy(asc(services.name), asc(services.id))
    return rows.map(mapService)
  } catch {
    throw new ServicesError('Diensten konden niet worden geladen.', 'FAILED')
  }
}

export async function createService(input: ServiceCreateInput): Promise<ServiceDTO> {
  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(services).values({
        name: input.name,
        description: input.description,
        durationMinutes: input.durationMinutes,
        priceCents: input.priceCents,
        active: true,
      }).returning()
      if (!created) throw new ServicesError('Dienst kon niet worden aangemaakt.', 'FAILED')
      await audit(tx, 'service.create', created.id, {
        after: { name: created.name, durationMinutes: created.durationMinutes, priceCents: created.priceCents },
      })
      return mapService(created)
    })
  } catch (error) {
    if (error instanceof ServicesError) throw error
    throw new ServicesError('Dienst kon niet worden aangemaakt.', 'FAILED')
  }
}

export async function updateService(id: string, input: ServiceUpdateInput): Promise<ServiceDTO> {
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(services).where(eq(services.id, id)).limit(1)
      if (!before) throw new ServicesError('Dienst niet gevonden.', 'NOT_FOUND')
      const [updated] = await tx.update(services).set({ ...input, updatedAt: new Date() }).where(eq(services.id, id)).returning()
      if (!updated) throw new ServicesError('Dienst kon niet worden bijgewerkt.', 'FAILED')
      await audit(tx, 'service.update', id, {
        before: { name: before.name, durationMinutes: before.durationMinutes, priceCents: before.priceCents },
        after: { name: updated.name, durationMinutes: updated.durationMinutes, priceCents: updated.priceCents },
      })
      return mapService(updated)
    })
  } catch (error) {
    if (error instanceof ServicesError) throw error
    throw new ServicesError('Dienst kon niet worden bijgewerkt.', 'FAILED')
  }
}

export async function activateService(id: string): Promise<ServiceDTO> {
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(services).where(eq(services.id, id)).limit(1)
      if (!before) throw new ServicesError('Dienst niet gevonden.', 'NOT_FOUND')
      if (before.archivedAt) throw new ServicesError('Een gearchiveerde dienst kan niet worden geactiveerd.', 'INVALID')
      if (before.active) return mapService(before)
      const [updated] = await tx.update(services).set({ active: true, updatedAt: new Date() }).where(eq(services.id, id)).returning()
      if (!updated) throw new ServicesError('Dienst kon niet worden geactiveerd.', 'FAILED')
      await audit(tx, 'service.activate', id, { after: { active: true } })
      return mapService(updated)
    })
  } catch (error) {
    if (error instanceof ServicesError) throw error
    throw new ServicesError('Dienst kon niet worden geactiveerd.', 'FAILED')
  }
}

export async function deactivateService(id: string): Promise<ServiceDTO> {
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(services).where(eq(services.id, id)).limit(1)
      if (!before) throw new ServicesError('Dienst niet gevonden.', 'NOT_FOUND')
      if (!before.active) return mapService(before)
      const [updated] = await tx.update(services).set({ active: false, updatedAt: new Date() }).where(eq(services.id, id)).returning()
      if (!updated) throw new ServicesError('Dienst kon niet worden gedeactiveerd.', 'FAILED')
      await audit(tx, 'service.deactivate', id, { after: { active: false } })
      return mapService(updated)
    })
  } catch (error) {
    if (error instanceof ServicesError) throw error
    throw new ServicesError('Dienst kon niet worden gedeactiveerd.', 'FAILED')
  }
}

export async function archiveService(id: string): Promise<ServiceDTO> {
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(services).where(eq(services.id, id)).limit(1)
      if (!before) throw new ServicesError('Dienst niet gevonden.', 'NOT_FOUND')
      if (before.archivedAt) throw new ServicesError('Deze dienst is al gearchiveerd.', 'CONFLICT')
      const [updated] = await tx.update(services).set({ active: false, archivedAt: new Date(), updatedAt: new Date() }).where(eq(services.id, id)).returning()
      if (!updated) throw new ServicesError('Dienst kon niet worden gearchiveerd.', 'FAILED')
      await audit(tx, 'service.archive', id, { after: { active: false, archivedAt: updated.archivedAt?.toISOString() ?? null } })
      return mapService(updated)
    })
  } catch (error) {
    if (error instanceof ServicesError) throw error
    throw new ServicesError('Dienst kon niet worden gearchiveerd.', 'FAILED')
  }
}