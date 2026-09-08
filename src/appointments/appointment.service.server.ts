import { and, asc, eq, gt, isNull, lt } from 'drizzle-orm'

import { recordAuditEvent } from '../auth/audit.server'
import { db } from '../db/client.server'
import { staffProfiles } from '../db/schema/profiles'
import { services } from '../db/schema/services'
import { users } from '../db/schema/users'
import { bookingSettings, breakPeriods, businessProfile, openingHours, wholeDayBlocks } from '../db/schema/business'
import { appointments } from '../db/schema/appointments'
import { calculateAvailableSlots, isSlotAvailable, type AvailabilityAppointment, type AvailabilityInput } from '../availability/availability.domain'
import type { AvailabilityInput as AvailabilityRequest } from '../availability/availability.schemas'
import { getAmsterdamDateTimeParts, getAmsterdamDayBounds, parseAmsterdamLocal } from '../timezone'
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

export type AvailabilityDTO = {
  date: string
  slots: Array<{ date: string; time: string; startsAt: string; endsAt: string }>
}

export type BookableServiceDTO = { id: string; name: string; description: string; durationMinutes: number; priceCents: number }

type AppointmentRow = typeof import('../db/schema/appointments').appointments.$inferSelect

export async function listBookableServices(): Promise<BookableServiceDTO[]> {
  try {
    return await db.select({ id: services.id, name: services.name, description: services.description, durationMinutes: services.durationMinutes, priceCents: services.priceCents })
      .from(services)
      .where(and(eq(services.active, true), isNull(services.archivedAt)))
      .orderBy(asc(services.name), asc(services.id))
  } catch {
    throw new AppointmentError('Diensten konden niet worden geladen.', 'FAILED')
  }
}

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

type AppointmentExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function loadAvailabilityInput(executor: AppointmentExecutor, request: AvailabilityRequest, overrides?: AvailabilityInput['overrides']): Promise<AvailabilityInput> {
  const bounds = getAmsterdamDayBounds(request.date)
  if (!bounds) throw new AppointmentError('De gekozen datum is ongeldig.', 'INVALID')
  const [profile] = await executor.select({ timezone: businessProfile.timezone }).from(businessProfile).where(eq(businessProfile.id, 1)).limit(1)
  if (!profile || profile.timezone !== 'Europe/Amsterdam') throw new AppointmentError('De bedrijfsconfiguratie is ongeldig.', 'FAILED')
  const [service] = await executor.select({ durationMinutes: services.durationMinutes }).from(services).where(and(eq(services.id, request.serviceId), eq(services.active, true), isNull(services.archivedAt))).limit(1)
  if (!service) throw new AppointmentError('Deze dienst is niet beschikbaar.', 'INVALID')
  const [settings] = await executor.select({ bufferMinutes: bookingSettings.bufferMinutes }).from(bookingSettings).where(eq(bookingSettings.id, 1)).limit(1)
  if (!settings) throw new AppointmentError('Boekingsinstellingen ontbreken.', 'FAILED')
  const hourRows = await executor.select({ weekday: openingHours.weekday, isOpen: openingHours.isOpen, openingTime: openingHours.openingTime, closingTime: openingHours.closingTime }).from(openingHours)
  const hours = hourRows.map((hour) => ({ ...hour, openingTime: hour.openingTime?.slice(0, 5) ?? null, closingTime: hour.closingTime?.slice(0, 5) ?? null }))
  const breaks = await executor.select({ startsAt: breakPeriods.startsAt, endsAt: breakPeriods.endsAt }).from(breakPeriods).where(and(eq(breakPeriods.active, true), lt(breakPeriods.startsAt, bounds.end), gt(breakPeriods.endsAt, bounds.start)))
  const [block] = await executor.select({ id: wholeDayBlocks.id }).from(wholeDayBlocks).where(and(eq(wholeDayBlocks.blockDate, request.date), eq(wholeDayBlocks.active, true))).limit(1)
  const existing = await executor.select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt, status: appointments.status, slotReleasedAt: appointments.slotReleasedAt }).from(appointments).where(and(lt(appointments.startsAt, bounds.end), gt(appointments.endsAt, bounds.start)))
  return {
    date: request.date,
    serviceDurationMinutes: service.durationMinutes,
    bufferMinutes: settings.bufferMinutes,
    openingHours: hours,
    breaks,
    wholeDayBlocked: Boolean(block),
    appointments: existing as AvailabilityAppointment[],
    overrides,
  }
}

export async function getAvailability(request: AvailabilityRequest): Promise<AvailabilityDTO> {
  try {
    return await db.transaction(async (tx) => {
      const input = await loadAvailabilityInput(tx, request)
      const now = new Date()
      return {
        date: request.date,
        slots: calculateAvailableSlots(input)
          .filter((slot) => slot.startsAt >= now)
          .map((slot) => ({ date: slot.date, time: slot.time, startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() })),
      }
    })
  } catch (error) {
    if (error instanceof AppointmentError) throw error
    throw new AppointmentError('Beschikbaarheid kon niet worden geladen.', 'FAILED')
  }
}

function resolveLocalBooking(input: AppointmentCreateInput): { date: string; time: string; startsAt: Date } {
  if (input.localDate && input.localTime) {
    const startsAt = parseAmsterdamLocal(input.localDate, input.localTime)
    if (!startsAt) throw new AppointmentError('Dit lokale tijdstip bestaat niet in Europe/Amsterdam.', 'INVALID')
    return { date: input.localDate, time: input.localTime, startsAt }
  }
  if (!input.startsAt) throw new AppointmentError('Een datum en tijd zijn verplicht.', 'INVALID')
  const parts = getAmsterdamDateTimeParts(input.startsAt)
  return {
    date: `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`,
    time: `${parts.hour.toString().padStart(2, '0')}:${parts.minute.toString().padStart(2, '0')}`,
    startsAt: input.startsAt,
  }
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
      const localBooking = resolveLocalBooking(input)
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

      const availabilityInput = await loadAvailabilityInput(tx, { serviceId: input.serviceId, date: localBooking.date }, {
        openingHours: actor.kind === 'staff' && input.overrideOpeningHours,
        break: actor.kind === 'staff' && input.overrideBreak,
        wholeDayBlock: actor.kind === 'staff' && input.overrideWholeDayBlock,
      })
      if (localBooking.startsAt < new Date() || !isSlotAvailable(availabilityInput, localBooking.startsAt)) {
        throw new AppointmentError('Dit tijdstip is niet meer beschikbaar.', 'CONFLICT')
      }
      const endsAt = calculateOccupiedEnd(localBooking.startsAt, service.durationMinutes, settings.bufferMinutes)
      const [conflict] = await findOverlappingAppointments(tx, { startsAt: localBooking.startsAt, endsAt })
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
        startsAt: localBooking.startsAt,
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
