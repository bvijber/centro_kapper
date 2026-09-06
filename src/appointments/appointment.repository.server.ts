import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, or } from 'drizzle-orm'

import type { Database } from '../db/client.server'
import { appointments } from '../db/schema/appointments'

type AppointmentExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

const blockingStatuses = ['new', 'confirmed', 'in_progress'] as const

export type AppointmentCreateRecord = typeof appointments.$inferInsert

export async function insertAppointment(executor: AppointmentExecutor, values: AppointmentCreateRecord) {
  const [created] = await executor.insert(appointments).values(values).returning()
  return created ?? null
}

export async function findAppointmentById(executor: AppointmentExecutor, id: string) {
  const [appointment] = await executor.select().from(appointments).where(eq(appointments.id, id)).limit(1)
  return appointment ?? null
}

export async function listAppointments(
  executor: AppointmentExecutor,
  filters: { customerUserId?: string; from?: Date; to?: Date } = {},
) {
  const conditions = []
  if (filters.customerUserId) conditions.push(eq(appointments.customerUserId, filters.customerUserId))
  if (filters.from) conditions.push(gte(appointments.startsAt, filters.from))
  if (filters.to) conditions.push(lt(appointments.startsAt, filters.to))

  return executor
    .select()
    .from(appointments)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(appointments.startsAt), desc(appointments.createdAt))
}

export async function findOverlappingAppointments(executor: AppointmentExecutor, requested: { startsAt: Date; endsAt: Date }) {
  return executor
    .select()
    .from(appointments)
    .where(and(
      or(
        inArray(appointments.status, blockingStatuses),
        and(eq(appointments.status, 'no_show'), isNull(appointments.slotReleasedAt)),
      ),
      lt(appointments.startsAt, requested.endsAt),
      gt(appointments.endsAt, requested.startsAt),
    ))
    .limit(1)
}
