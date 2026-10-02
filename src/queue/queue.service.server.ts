import { and, eq, isNull } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'

import { recordAuditEvent } from '../auth/audit.server'
import { AuthError } from '../auth/auth.errors'
import { db } from '../db/client.server'
import { services } from '../db/schema/services'
import { users } from '../db/schema/users'
import { getBookingSettings } from '../settings/settings.service.server'
import { formatAmsterdamDateKey } from '../timezone'
import {
  authorizeQueueJoin,
  requireQueueEntryAccess,
  requireQueueMutationOwnership,
  requireStaffQueueActor,
  type QueueActor,
  type QueueMutationActor,
} from './queue.authorization'
import { canTransitionQueueStatus, calculateEstimatedWaitMinutes, calculateQueuePosition, compareQueueOrder, isActiveQueueStatus, type QueueStatus } from './queue.domain'
import {
  acquireQueueLock,
  findActiveCustomerEntry,
  findQueueEntryById,
  findQueueEntryByIdForUpdate,
  insertQueueEntry,
  listActiveQueueEntries,
  listQueueEntries,
  type QueueExecutor,
  updateQueueEntry,
} from './queue.repository.server'
import type { QueueJoinInput } from './queue.schemas'

export class QueueError extends Error {
  constructor(message: string, readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'FAILED') {
    super(message)
    this.name = 'QueueError'
  }
}

export type QueueEntryDTO = {
  id: string
  customerUserId: string | null
  guestName: string | null
  guestPhone: string | null
  guestCapability?: string
  serviceId: string
  serviceName: string
  serviceDurationMinutes: number
  appointmentId: string | null
  queueDate: string
  joinedAt: Date
  status: QueueStatus
  note: string | null
  calledAt: Date | null
  completedAt: Date | null
  createdByUserId: string | null
  createdAt: Date
  updatedAt: Date
}

export type QueueEntryMetadata = {
  position: number
  count: number
  estimatedWaitMinutes: number
}

type QueueRow = Awaited<ReturnType<typeof listQueueEntries>>[number]
type QueueActiveRow = Awaited<ReturnType<typeof listActiveQueueEntries>>[number]
type QueueTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

function mapQueueEntry(row: QueueRow): QueueEntryDTO {
  return {
    id: row.id,
    customerUserId: row.customerUserId,
    guestName: row.guestName,
    guestPhone: row.guestPhone,
    guestCapability: undefined,
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    serviceDurationMinutes: row.serviceDurationMinutes,
    appointmentId: row.appointmentId,
    queueDate: row.queueDate,
    joinedAt: row.joinedAt,
    status: row.status,
    note: row.note,
    calledAt: row.calledAt,
    completedAt: row.completedAt,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function findDetails(executor: QueueExecutor, id: string, queueDate: string): Promise<QueueEntryDTO | null> {
  const row = (await listQueueEntries(executor, queueDate)).find((entry) => entry.id === id)
  return row ? mapQueueEntry(row) : null
}

function auditMetadata(before: QueueStatus | null, after: QueueEntryDTO, extra?: Record<string, string | null>) {
  return {
    ...(before ? { before: { status: before } } : {}),
    after: { status: after.status, queueDate: after.queueDate, serviceId: after.serviceId },
    ...extra,
  }
}

async function resolveCustomer(executor: QueueTransaction, customerUserId: string): Promise<void> {
  const [customer] = await executor
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, customerUserId), eq(users.role, 'customer')))
    .limit(1)
  if (!customer) throw new QueueError('De gekozen customer bestaat niet.', 'INVALID')
}

async function resolveService(executor: QueueTransaction, serviceId: string) {
  const [service] = await executor
    .select({ id: services.id, name: services.name, durationMinutes: services.durationMinutes })
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.active, true), isNull(services.archivedAt)))
    .limit(1)
  if (!service) throw new QueueError('Deze dienst is niet beschikbaar.', 'INVALID')
  return service
}

function requireStaff(actor: QueueMutationActor): asserts actor is { kind: 'staff'; userId: string } {
  requireStaffQueueActor(actor)
}

export async function joinQueue(input: QueueJoinInput, actor: QueueActor, now = new Date()): Promise<QueueEntryDTO> {
  const queueDate = formatAmsterdamDateKey(now)
  try {
    return await db.transaction(async (tx) => {
      await acquireQueueLock(tx, queueDate)
      const service = await resolveService(tx, input.serviceId)

      const customerUserId = actor.kind === 'customer'
        ? actor.userId
        : actor.kind === 'staff'
          ? input.customerUserId ?? null
          : null
      if (customerUserId) {
        await resolveCustomer(tx, customerUserId)
      }
      const guestCapability = actor.kind === 'guest' ? randomBytes(32).toString('base64url') : undefined

      const created = await insertQueueEntry(tx, {
        customerUserId,
        guestName: customerUserId ? null : input.guestName ?? null,
        guestPhone: customerUserId ? null : input.guestPhone ?? null,
        guestAccessTokenHash: guestCapability ? createHash('sha256').update(guestCapability).digest('hex') : null,
        serviceId: service.id,
        queueDate,
        joinedAt: now,
        status: 'waiting',
        note: input.note ?? null,
        createdByUserId: actor.kind === 'guest' ? null : actor.userId,
      })
      if (!created) throw new QueueError('Queue-entry kon niet worden aangemaakt.', 'FAILED')
      const result = await findDetails(tx, created.id, queueDate)
      if (!result) throw new QueueError('Queue-entry kon niet worden geladen.', 'FAILED')
      await recordAuditEvent({
        action: 'queue.join',
        actorUserId: actor.kind === 'guest' ? undefined : actor.userId,
        entityType: 'waiting_list_entry',
        entityId: result.id,
        metadata: auditMetadata(null, result, { identity: customerUserId ? 'customer' : 'guest' }),
      }, tx)
       return guestCapability ? { ...result, guestCapability } : result
    })
  } catch (error) {
    if (error instanceof QueueError || error instanceof AuthError) throw error
    throw new QueueError('Queue-entry kon niet worden aangemaakt.', 'FAILED')
  }
}

export async function getQueueEntry(id: string, actor: QueueActor | null): Promise<QueueEntryDTO> {
  const entry = await findQueueEntryById(db, id)
  if (!entry) throw new QueueError('Queue-entry niet gevonden.', 'NOT_FOUND')
  requireQueueEntryAccess(actor, entry)
  if (actor?.kind === 'guest' && createHash('sha256').update(actor.capability ?? '').digest('hex') !== entry.guestAccessTokenHash) throw new AuthError('Geen toegang.', 'FORBIDDEN')
  const details = await findDetails(db, id, entry.queueDate)
  if (!details) throw new QueueError('Queue-entry niet gevonden.', 'NOT_FOUND')
  return details
}

export async function getQueueEntryMetadata(id: string, actor: QueueActor | null): Promise<QueueEntryMetadata> {
  try {
    const entry = await findQueueEntryById(db, id)
    if (!entry) throw new QueueError('Queue-entry niet gevonden.', 'NOT_FOUND')
    requireQueueEntryAccess(actor, entry)
    if (actor?.kind === 'guest' && createHash('sha256').update(actor.capability ?? '').digest('hex') !== entry.guestAccessTokenHash) throw new AuthError('Geen toegang.', 'FORBIDDEN')

    const [settings, activeEntries] = await Promise.all([
      getBookingSettings(),
      listActiveQueueEntries(db, entry.queueDate),
    ])
    const target = activeEntries.find((activeEntry) => activeEntry.id === id)
    if (!target) throw new QueueError('Actieve queue-entry niet gevonden.', 'NOT_FOUND')

    const position = calculateQueuePosition(activeEntries, id)
    if (position === null) throw new QueueError('Actieve queue-entry niet gevonden.', 'NOT_FOUND')

    const entriesAhead = activeEntries.filter((activeEntry) => compareQueueOrder(activeEntry, target) < 0)
    return {
      position,
      count: entriesAhead.length,
      estimatedWaitMinutes: calculateEstimatedWaitMinutes(entriesAhead, settings.bufferMinutes),
    }
  } catch (error) {
    if (error instanceof QueueError || error instanceof AuthError) throw error
    throw new QueueError('Queue-informatie kon niet worden geladen.', 'FAILED')
  }
}

export async function listStaffQueue(queueDate: string, actor: QueueMutationActor): Promise<QueueEntryDTO[]> {
  requireStaff(actor)
  return (await listQueueEntries(db, queueDate)).map(mapQueueEntry)
}

export async function listCustomerQueue(customerUserId: string, queueDate: string, actor: QueueMutationActor): Promise<QueueEntryDTO[]> {
  if (actor.kind !== 'customer' || actor.userId !== customerUserId) throw new AuthError('Geen toegang.', 'FORBIDDEN')
  const rows = await listQueueEntries(db, queueDate)
  return rows.filter((entry) => entry.customerUserId === customerUserId).map(mapQueueEntry)
}

async function transitionQueueEntry(
  id: string,
  targetStatus: QueueStatus,
  actor: QueueActor,
  options: { appointmentId?: string | null; joinedAt?: Date; action?: string } = {},
): Promise<QueueEntryDTO> {
  try {
    return await db.transaction(async (tx) => {
      const initial = await findQueueEntryById(tx, id)
      if (!initial) throw new QueueError('Queue-entry niet gevonden.', 'NOT_FOUND')
      await acquireQueueLock(tx, initial.queueDate)
      const current = await findQueueEntryByIdForUpdate(tx, id)
      if (!current) throw new QueueError('Queue-entry niet gevonden.', 'NOT_FOUND')
      if (!canTransitionQueueStatus(current.status, targetStatus)) {
        throw new QueueError('Deze queue-statusovergang is niet toegestaan.', 'INVALID')
      }
      if (targetStatus === 'waiting' && actor.kind !== 'staff') {
        throw new AuthError('Alleen de barber kan een queue-entry herplaatsen.', 'FORBIDDEN')
      }
       if (actor.kind !== 'staff') {
         requireQueueMutationOwnership(actor, current)
         if (actor.kind === 'guest' && createHash('sha256').update(actor.capability ?? '').digest('hex') !== current.guestAccessTokenHash) throw new AuthError('Geen toegang.', 'FORBIDDEN')
       }
      const updated = await updateQueueEntry(tx, id, {
        status: targetStatus,
        joinedAt: options.joinedAt ?? undefined,
        calledAt: targetStatus === 'called' ? new Date() : undefined,
        completedAt: targetStatus === 'completed' ? new Date() : undefined,
        appointmentId: options.appointmentId ?? undefined,
      })
      if (!updated) throw new QueueError('Queue-entry kon niet worden bijgewerkt.', 'FAILED')
      const result = await findDetails(tx, id, current.queueDate)
      if (!result) throw new QueueError('Queue-entry kon niet worden geladen.', 'FAILED')
      const action = options.action ?? (targetStatus === 'waiting' ? 'queue.rejoin' : targetStatus === 'in_service' ? 'queue.start_service' : `queue.${targetStatus}`)
      await recordAuditEvent({
        action,
        actorUserId: actor.kind === 'guest' ? undefined : actor.userId,
        entityType: 'waiting_list_entry',
        entityId: result.id,
        metadata: auditMetadata(current.status, result),
      }, tx)
      return result
    })
  } catch (error) {
    if (error instanceof QueueError || error instanceof AuthError) throw error
    throw new QueueError('Queue-entry kon niet worden bijgewerkt.', 'FAILED')
  }
}

export function leaveQueue(id: string, actor: QueueActor): Promise<QueueEntryDTO> {
  return transitionQueueEntry(id, 'cancelled', actor, { action: 'queue.leave' })
}

export function callQueueEntry(id: string, actor: QueueMutationActor): Promise<QueueEntryDTO> {
  requireStaff(actor)
  return transitionQueueEntry(id, 'called', actor)
}

export function startQueueService(id: string, actor: QueueMutationActor, appointmentId?: string): Promise<QueueEntryDTO> {
  requireStaff(actor)
  return transitionQueueEntry(id, 'in_service', actor, { appointmentId })
}

export function completeQueueEntry(id: string, actor: QueueMutationActor): Promise<QueueEntryDTO> {
  requireStaff(actor)
  return transitionQueueEntry(id, 'completed', actor)
}

export function cancelQueueEntry(id: string, actor: QueueMutationActor): Promise<QueueEntryDTO> {
  requireStaff(actor)
  return transitionQueueEntry(id, 'cancelled', actor)
}

export function skipQueueEntry(id: string, actor: QueueMutationActor): Promise<QueueEntryDTO> {
  requireStaff(actor)
  return transitionQueueEntry(id, 'skipped', actor)
}

export function rejoinQueueEntry(id: string, actor: QueueMutationActor, now = new Date()): Promise<QueueEntryDTO> {
  requireStaff(actor)
  return db.transaction(async (tx) => {
    const initial = await findQueueEntryById(tx, id)
    if (!initial) throw new QueueError('Queue-entry niet gevonden.', 'NOT_FOUND')
    await acquireQueueLock(tx, initial.queueDate)
    const current = await findQueueEntryByIdForUpdate(tx, id)
    if (!current || current.status !== 'skipped') throw new QueueError('Deze queue-entry kan niet opnieuw worden geplaatst.', 'INVALID')
    const created = await insertQueueEntry(tx, {
      customerUserId: current.customerUserId,
      guestName: current.guestName,
      guestPhone: current.guestPhone,
      guestAccessTokenHash: current.guestAccessTokenHash,
      serviceId: current.serviceId,
      appointmentId: null,
      queueDate: current.queueDate,
      joinedAt: now,
      status: 'waiting',
      note: current.note,
      createdByUserId: actor.userId,
    })
    if (!created) throw new QueueError('Queue-entry kon niet opnieuw worden geplaatst.', 'FAILED')
    const result = await findDetails(tx, created.id, current.queueDate)
    if (!result) throw new QueueError('Queue-entry kon niet worden geladen.', 'FAILED')
    await recordAuditEvent({ action: 'queue.rejoin', actorUserId: actor.userId, entityType: 'waiting_list_entry', entityId: result.id, metadata: auditMetadata('skipped', result, { previousEntryId: current.id }) }, tx)
    return result
  })
}

export async function calculateQueueWaitTime(queueDate: string, entryId: string, bufferMinutes: number): Promise<number> {
  const entries = await listActiveQueueEntries(db, queueDate)
  const target = entries.find((entry) => entry.id === entryId)
  if (!target) throw new QueueError('Actieve queue-entry niet gevonden.', 'NOT_FOUND')
  const ahead: QueueActiveRow[] = entries.filter((entry) => isActiveQueueStatus(entry.status) && (
    entry.joinedAt < target.joinedAt || (entry.joinedAt.getTime() === target.joinedAt.getTime() && entry.id < target.id)
  ))
  return calculateEstimatedWaitMinutes(ahead, bufferMinutes)
}
