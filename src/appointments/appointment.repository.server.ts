import { and, asc, desc, eq, gt, gte, getTableColumns, inArray, isNull, lt, or } from 'drizzle-orm'

import type { Database } from '../db/client.server'
import { appointments } from '../db/schema/appointments'
import { cancellationRequests } from '../db/schema/cancellation-requests'
import { customerProfiles } from '../db/schema/profiles'
import type { CancellationRequestStatus } from './appointment.domain'

type AppointmentExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

const blockingStatuses = ['new', 'confirmed', 'in_progress'] as const

export type AppointmentCreateRecord = typeof appointments.$inferInsert
export type CancellationRequestCreateRecord = typeof cancellationRequests.$inferInsert
export type CancellationRequestUpdateRecord = Partial<typeof cancellationRequests.$inferInsert>

export async function insertAppointment(executor: AppointmentExecutor, values: AppointmentCreateRecord) {
  const [created] = await executor.insert(appointments).values(values).returning()
  return created ?? null
}

export async function updateAppointment(executor: AppointmentExecutor, id: string, values: Partial<AppointmentCreateRecord>) {
  const [updated] = await executor.update(appointments).set({ ...values, updatedAt: new Date() }).where(eq(appointments.id, id)).returning()
  return updated ?? null
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
    .select({ ...getTableColumns(appointments), customerName: customerProfiles.fullName })
    .from(appointments)
    .leftJoin(customerProfiles, eq(customerProfiles.userId, appointments.customerUserId))
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

export async function insertCancellationRequest(executor: AppointmentExecutor, values: CancellationRequestCreateRecord) {
  const [created] = await executor.insert(cancellationRequests).values(values).returning()
  return created ?? null
}

export async function findCancellationRequestById(executor: AppointmentExecutor, id: string) {
  const [request] = await executor.select().from(cancellationRequests).where(eq(cancellationRequests.id, id)).limit(1)
  return request ?? null
}

export async function findCancellationRequestByIdForUpdate(executor: AppointmentExecutor, id: string) {
  const [request] = await executor.select().from(cancellationRequests).where(eq(cancellationRequests.id, id)).for('update').limit(1)
  return request ?? null
}

export async function findPendingCancellationRequestByAppointmentId(executor: AppointmentExecutor, appointmentId: string) {
  const [request] = await executor
    .select()
    .from(cancellationRequests)
    .where(and(eq(cancellationRequests.appointmentId, appointmentId), eq(cancellationRequests.status, 'pending')))
    .limit(1)
  return request ?? null
}

export async function updateCancellationRequest(executor: AppointmentExecutor, id: string, values: CancellationRequestUpdateRecord) {
  const [updated] = await executor.update(cancellationRequests).set({ ...values, updatedAt: new Date() }).where(eq(cancellationRequests.id, id)).returning()
  return updated ?? null
}

export type CancellationRequestListFilter = {
  appointmentId?: string
  status?: CancellationRequestStatus
  customerUserId?: string
}

export async function listCancellationRequests(executor: AppointmentExecutor, filter: CancellationRequestListFilter = {}) {
  const conditions = []
  if (filter.appointmentId) conditions.push(eq(cancellationRequests.appointmentId, filter.appointmentId))
  if (filter.status) conditions.push(eq(cancellationRequests.status, filter.status))
  if (filter.customerUserId) conditions.push(eq(appointments.customerUserId, filter.customerUserId))

  return executor
    .select({
      request: cancellationRequests,
      appointment: {
        id: appointments.id,
        customerUserId: appointments.customerUserId,
        guestName: appointments.guestName,
        guestPhone: appointments.guestPhone,
        serviceNameAtBooking: appointments.serviceNameAtBooking,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        status: appointments.status,
      },
    })
    .from(cancellationRequests)
    .innerJoin(appointments, eq(cancellationRequests.appointmentId, appointments.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(cancellationRequests.createdAt))
}
