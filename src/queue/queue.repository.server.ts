import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm'

import type { Database } from '../db/client.server'
import { appointments } from '../db/schema/appointments'
import { services } from '../db/schema/services'
import { waitingListEntries } from '../db/schema/waiting-list'
import type { QueueStatus } from './queue.domain'

export type QueueExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0]
export type QueueCreateRecord = typeof waitingListEntries.$inferInsert
export type QueueUpdateRecord = Partial<typeof waitingListEntries.$inferInsert>

export function getQueueLockKey(queueDate: string): string {
  return `queue:${queueDate}`
}

export async function acquireQueueLock(executor: QueueExecutor, queueDate: string): Promise<void> {
  await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${getQueueLockKey(queueDate)}, 0))`)
}

export async function insertQueueEntry(executor: QueueExecutor, values: QueueCreateRecord) {
  const [created] = await executor.insert(waitingListEntries).values(values).returning()
  return created ?? null
}

export async function findQueueEntryById(executor: QueueExecutor, id: string) {
  const [entry] = await executor.select().from(waitingListEntries).where(eq(waitingListEntries.id, id)).limit(1)
  return entry ?? null
}

export async function findQueueEntryByIdForUpdate(executor: QueueExecutor, id: string) {
  const [entry] = await executor.select().from(waitingListEntries).where(eq(waitingListEntries.id, id)).for('update').limit(1)
  return entry ?? null
}

export async function findActiveCustomerEntry(executor: QueueExecutor, customerUserId: string, queueDate: string) {
  const [entry] = await executor
    .select()
    .from(waitingListEntries)
    .where(and(
      eq(waitingListEntries.customerUserId, customerUserId),
      eq(waitingListEntries.queueDate, queueDate),
      sql`${waitingListEntries.status} IN ('waiting', 'called', 'in_service')`,
    ))
    .limit(1)
  return entry ?? null
}

export async function updateQueueEntry(executor: QueueExecutor, id: string, values: QueueUpdateRecord) {
  const [updated] = await executor
    .update(waitingListEntries)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(waitingListEntries.id, id))
    .returning()
  return updated ?? null
}

export async function listQueueEntries(executor: QueueExecutor, queueDate: string) {
  return executor
    .select({
      ...getTableColumns(waitingListEntries),
      serviceName: services.name,
      serviceDurationMinutes: services.durationMinutes,
      appointmentId: appointments.id,
    })
    .from(waitingListEntries)
    .innerJoin(services, eq(services.id, waitingListEntries.serviceId))
    .leftJoin(appointments, eq(appointments.id, waitingListEntries.appointmentId))
    .where(eq(waitingListEntries.queueDate, queueDate))
    .orderBy(asc(waitingListEntries.joinedAt), asc(waitingListEntries.id))
}

export async function listActiveQueueEntries(executor: QueueExecutor, queueDate: string) {
  return executor
    .select({
      id: waitingListEntries.id,
      customerUserId: waitingListEntries.customerUserId,
      joinedAt: waitingListEntries.joinedAt,
      status: waitingListEntries.status,
      serviceId: waitingListEntries.serviceId,
      serviceName: services.name,
      serviceDurationMinutes: services.durationMinutes,
    })
    .from(waitingListEntries)
    .innerJoin(services, eq(services.id, waitingListEntries.serviceId))
    .where(and(
      eq(waitingListEntries.queueDate, queueDate),
      sql`${waitingListEntries.status} IN ('waiting', 'called', 'in_service')`,
    ))
    .orderBy(asc(waitingListEntries.joinedAt), asc(waitingListEntries.id))
}
