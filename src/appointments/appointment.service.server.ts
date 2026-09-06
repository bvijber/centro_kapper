import { and, asc, eq, isNull } from 'drizzle-orm'

import { recordAuditEvent } from '../auth/audit.server'
import { db } from '../db/client.server'
import { staffProfiles } from '../db/schema/profiles'
import { services } from '../db/schema/services'
import { users } from '../db/schema/users'
import { bookingSettings } from '../db/schema/business'
import type { AppointmentActor } from './appointment.authorization'
import { calculateOccupiedEnd } from './appointment.domain'
import type { AppointmentCreateInput, AppointmentListInput } from './appointment.schemas'
import { acquireAppointmentLock } from './appointment.overlap'
import { findAppointmentById, findOverlappingAppointments, insertAppointment, listAppointments } from './appointment.repository.server'

export class AppointmentError extends Error {
  constructor(message: string, readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'FAILED') {
    super(message)
    this.name = 'AppointmentError'
  }
}

export type AppointmentDTO = {
  id: string
  customerUserId: string | null
  guestName: string | null
  guestPhone: string | null
  guestEmail: string | null
  barberUserId: string | null
  serviceId: string
  serviceNameAtBooking: string
  servicePriceCentsAtBooking: number
  serviceDurationMinutesAtBooking: number
  bufferMinutesAtBooking: number
  startsAt: Date
  endsAt: Date
  status: 'new' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
  note: string | null
  createdByUserId: string | null
  cancelledAt: Date | null
  completedAt: Date | null
  slotReleasedAt: Date | null
  overrideOpeningHours: boolean
  overrideBreak: boolean
  overrideWholeDayBlock: boolean
  createdAt: Date
  updatedAt: Date
}

type AppointmentRow = typeof import('../db/schema/appointments').appointments.$inferSelect

function mapAppointment(row: AppointmentRow): AppointmentDTO {
  return {
    id: row.id,
    customerUserId: row.customerUserId,
    guestName: row.guestName,
    guestPhone: row.guestPhone,
    guestEmail: row.guestEmail,
    barberUserId: row.barberUserId,
    serviceId: row.serviceId,
    serviceNameAtBooking: row.serviceNameAtBooking,
    servicePriceCentsAtBooking: row.servicePriceCentsAtBooking,
    serviceDurationMinutesAtBooking: row.serviceDurationMinutesAtBooking,
    bufferMinutesAtBooking: row.bufferMinutesAtBooking,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    note: row.note,
    createdByUserId: row.createdByUserId,
    cancelledAt: row.cancelledAt,
    completedAt: row.completedAt,
    slotReleasedAt: row.slotReleasedAt,
    overrideOpeningHours: row.overrideOpeningHours,
    overrideBreak: row.overrideBreak,
    overrideWholeDayBlock: row.overrideWholeDayBlock,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function resolveSingleBarber(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]): Promise<string> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .where(and(eq(users.role, 'staff'), eq(staffProfiles.active, true)))
    .orderBy(asc(users.id))
    .limit(2)
  if (rows.length !== 1) throw new AppointmentError('De actieve barberconfiguratie is ongeldig.', 'FAILED')
  return rows[0].id
}

function auditMetadata(appointment: AppointmentDTO) {
  return {
    after: {
      id: appointment.id,
      customerUserId: appointment.customerUserId,
      barberUserId: appointment.barberUserId,
      serviceId: appointment.serviceId,
      serviceNameAtBooking: appointment.serviceNameAtBooking,
      servicePriceCentsAtBooking: appointment.servicePriceCentsAtBooking,
      serviceDurationMinutesAtBooking: appointment.serviceDurationMinutesAtBooking,
      bufferMinutesAtBooking: appointment.bufferMinutesAtBooking,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      status: appointment.status,
      overrideOpeningHours: appointment.overrideOpeningHours,
      overrideBreak: appointment.overrideBreak,
      overrideWholeDayBlock: appointment.overrideWholeDayBlock,
    },
  }
}

export async function createAppointment(input: AppointmentCreateInput, actor: AppointmentActor): Promise<AppointmentDTO> {
  try {
    return await db.transaction(async (tx) => {
      const barberUserId = await resolveSingleBarber(tx)
      await acquireAppointmentLock(tx, barberUserId)

      const [service] = await tx.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.active, true), isNull(services.archivedAt))).limit(1)
      if (!service) throw new AppointmentError('Deze dienst is niet beschikbaar.', 'INVALID')

      if (actor.kind === 'staff' && input.customerUserId) {
        const [customer] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.customerUserId), eq(users.role, 'customer'))).limit(1)
        if (!customer) throw new AppointmentError('De gekozen customer bestaat niet.', 'INVALID')
      }

      const [settings] = await tx.select().from(bookingSettings).where(eq(bookingSettings.id, 1)).limit(1)
      if (!settings) throw new AppointmentError('Boekingsinstellingen ontbreken.', 'FAILED')

      const endsAt = calculateOccupiedEnd(input.startsAt, service.durationMinutes, settings.bufferMinutes)
      const [conflict] = await findOverlappingAppointments(tx, { startsAt: input.startsAt, endsAt })
      if (conflict) {
        throw new AppointmentError(
          settings.overlapBehavior === 'allow_with_warning'
            ? 'Dit tijdstip overlapt met een bestaande afspraak en vereist staffbevestiging.'
            : 'Dit tijdstip overlapt met een bestaande afspraak.',
          'CONFLICT',
        )
      }

      const created = await insertAppointment(tx, {
        customerUserId: actor.kind === 'customer' ? actor.userId : actor.kind === 'staff' ? input.customerUserId : null,
        guestName: actor.kind === 'guest' || (actor.kind === 'staff' && input.customerUserId === undefined) ? input.guestName ?? null : null,
        guestPhone: actor.kind === 'guest' || (actor.kind === 'staff' && input.customerUserId === undefined) ? input.guestPhone ?? null : null,
        guestEmail: actor.kind === 'guest' || (actor.kind === 'staff' && input.customerUserId === undefined) ? input.guestEmail ?? null : null,
        barberUserId,
        serviceId: service.id,
        serviceNameAtBooking: service.name,
        servicePriceCentsAtBooking: service.priceCents,
        serviceDurationMinutesAtBooking: service.durationMinutes,
        bufferMinutesAtBooking: settings.bufferMinutes,
        startsAt: input.startsAt,
        endsAt,
        status: 'new',
        note: input.note ?? null,
        createdByUserId: actor.kind === 'guest' ? null : actor.userId,
        overrideOpeningHours: actor.kind === 'staff' ? input.overrideOpeningHours : false,
        overrideBreak: actor.kind === 'staff' ? input.overrideBreak : false,
        overrideWholeDayBlock: actor.kind === 'staff' ? input.overrideWholeDayBlock : false,
      })
      if (!created) throw new AppointmentError('Afspraak kon niet worden aangemaakt.', 'FAILED')

      const appointment = mapAppointment(created)
      await recordAuditEvent({
        action: 'appointment.create',
        actorUserId: actor.kind === 'guest' ? undefined : actor.userId,
        entityType: 'appointment',
        entityId: appointment.id,
        metadata: auditMetadata(appointment),
      }, tx)
      return appointment
    })
  } catch (error) {
    if (error instanceof AppointmentError) throw error
    throw new AppointmentError('Afspraak kon niet worden aangemaakt.', 'FAILED')
  }
}

export async function getAppointment(id: string, customerUserId?: string): Promise<AppointmentDTO> {
  try {
    const appointment = await findAppointmentById(db, id)
    if (!appointment || (customerUserId && appointment.customerUserId !== customerUserId)) {
      throw new AppointmentError('Afspraak niet gevonden.', 'NOT_FOUND')
    }
    return mapAppointment(appointment)
  } catch (error) {
    if (error instanceof AppointmentError) throw error
    throw new AppointmentError('Afspraak kon niet worden geladen.', 'FAILED')
  }
}

export async function listCustomerAppointments(userId: string, input: AppointmentListInput): Promise<AppointmentDTO[]> {
  try {
    const rows = await listAppointments(db, { customerUserId: userId, from: input.from, to: input.to })
    return rows.map(mapAppointment)
  } catch {
    throw new AppointmentError('Afspraken konden niet worden geladen.', 'FAILED')
  }
}

export async function listStaffAppointments(input: AppointmentListInput): Promise<AppointmentDTO[]> {
  try {
    const rows = await listAppointments(db, { from: input.from, to: input.to })
    return rows.map(mapAppointment)
  } catch {
    throw new AppointmentError('Afspraken konden niet worden geladen.', 'FAILED')
  }
}
