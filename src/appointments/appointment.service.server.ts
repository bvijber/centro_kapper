import { and, asc, eq, gt, isNull, lt } from 'drizzle-orm'

import { recordAuditEvent } from '../auth/audit.server'
import { AuthError, isAuthError } from '../auth/auth.errors'
import { db } from '../db/client.server'
import { ownerProfiles } from '../db/schema/profiles'
import { services } from '../db/schema/services'
import { users } from '../db/schema/users'
import { bookingSettings, breakPeriods, businessProfile, openingHours, wholeDayBlocks } from '../db/schema/business'
import { appointments } from '../db/schema/appointments'
import type { cancellationRequests } from '../db/schema/cancellation-requests'
import { calculateAvailableSlots, isSlotAvailable, type AvailabilityAppointment, type AvailabilityInput } from '../availability/availability.domain'
import type { AvailabilityInput as AvailabilityRequest } from '../availability/availability.schemas'
import { getAmsterdamDateTimeParts, getAmsterdamDayBounds, parseAmsterdamLocal } from '../timezone'
import type { AppointmentActor } from './appointment.authorization'
import { requireAppointmentMutationAccess, requireOwnerMutationActor, type AppointmentMutationActor } from './appointment.authorization'
import { calculateOccupiedEnd, canTransitionAppointmentStatus, canTransitionCancellationRequestStatus, type CancellationRequestStatus } from './appointment.domain'
import type { AppointmentCreateInput, AppointmentListInput, AppointmentModifyInput, AppointmentStatusUpdateInput, CancellationRequestListInput } from './appointment.schemas'
import { acquireAppointmentLock } from './appointment.overlap'
import { blocksCapacity, isOverlapping } from './appointment.overlap'
import {
  recordAppointmentBookedNotification,
  recordAppointmentCancelledNotification,
} from '../notifications/owner-notification.service.server'
import { shouldNotifyAppointmentCancelled } from '../notifications/owner-notification.events'
import {
  findAppointmentById,
  findCancellationRequestById,
  findCancellationRequestByIdForUpdate,
  findOverlappingAppointments,
  findPendingCancellationRequestByAppointmentId,
  insertAppointment,
  insertCancellationRequest,
  listAppointments,
  listCancellationRequests as listCancellationRequestRows,
  updateAppointment,
  updateCancellationRequest,
  type CancellationRequestListFilter,
} from './appointment.repository.server'

export class AppointmentError extends Error {
  constructor(message: string, readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'FAILED') {
    super(message)
    this.name = 'AppointmentError'
  }
}

export type AppointmentDTO = {
  id: string
  customerUserId: string | null
  customerName: string | null
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
type CancellationRequestRow = typeof cancellationRequests.$inferSelect

export type CancellationRequestDTO = {
  id: string
  appointmentId: string
  requestedByUserId: string | null
  reason: string
  status: CancellationRequestStatus
  reviewedByUserId: string | null
  reviewedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type CancellationRequestListItemDTO = {
  request: CancellationRequestDTO
  appointment: {
    id: string
    customerUserId: string | null
    guestName: string | null
    guestPhone: string | null
    serviceNameAtBooking: string
    startsAt: Date
    endsAt: Date
    status: AppointmentDTO['status']
  } | null
}

export type ModifyAppointmentResult =
  | { kind: 'updated'; appointment: AppointmentDTO }
  | { kind: 'overlap_warning'; message: string }

function mapAppointmentError(error: unknown, fallback: string): never {
  if (error instanceof AppointmentError) throw error
  if (isAuthError(error)) throw error
  throw new AppointmentError(fallback, 'FAILED')
}

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

function mapAppointment(row: AppointmentRow & { customerName?: string | null }): AppointmentDTO {
  return {
    id: row.id,
    customerUserId: row.customerUserId,
    customerName: row.customerName ?? null,
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
    .innerJoin(ownerProfiles, eq(ownerProfiles.userId, users.id))
    .where(and(eq(users.role, 'owner'), eq(ownerProfiles.active, true)))
    .orderBy(asc(users.id))
    .limit(2)
  if (rows.length !== 1) throw new AppointmentError('De actieve ownerconfiguratie is ongeldig.', 'FAILED')
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
  const existing = await executor.select({ id: appointments.id, startsAt: appointments.startsAt, endsAt: appointments.endsAt, status: appointments.status, slotReleasedAt: appointments.slotReleasedAt }).from(appointments).where(and(lt(appointments.startsAt, bounds.end), gt(appointments.endsAt, bounds.start)))
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

function assertBookingInterval(startsAt: Date) {
  if (startsAt.getMinutes() % 15 !== 0) {
    throw new AppointmentError('Starttijden moeten op een 15-minuteninterval vallen.', 'INVALID')
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
      assertBookingInterval(localBooking.startsAt)
      const barberUserId = await resolveSingleBarber(tx)
      await acquireAppointmentLock(tx, barberUserId)

      const [service] = await tx.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.active, true), isNull(services.archivedAt))).limit(1)
      if (!service) throw new AppointmentError('Deze dienst is niet beschikbaar.', 'INVALID')

      if (actor.kind === 'owner' && input.customerUserId) {
        const [customer] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.customerUserId), eq(users.role, 'customer'))).limit(1)
        if (!customer) throw new AppointmentError('De gekozen customer bestaat niet.', 'INVALID')
      }

      const [settings] = await tx.select().from(bookingSettings).where(eq(bookingSettings.id, 1)).limit(1)
      if (!settings) throw new AppointmentError('Boekingsinstellingen ontbreken.', 'FAILED')

      const availabilityInput = await loadAvailabilityInput(tx, { serviceId: input.serviceId, date: localBooking.date }, {
        openingHours: actor.kind === 'owner' && input.overrideOpeningHours,
        break: actor.kind === 'owner' && input.overrideBreak,
        wholeDayBlock: actor.kind === 'owner' && input.overrideWholeDayBlock,
      })
      if (localBooking.startsAt < new Date() || !isSlotAvailable(availabilityInput, localBooking.startsAt)) {
        throw new AppointmentError('Dit tijdstip is niet meer beschikbaar.', 'CONFLICT')
      }
      const endsAt = calculateOccupiedEnd(localBooking.startsAt, service.durationMinutes, settings.bufferMinutes)
      const [conflict] = await findOverlappingAppointments(tx, { startsAt: localBooking.startsAt, endsAt })
      if (conflict) {
        if (actor.kind !== 'owner' || settings.overlapBehavior === 'block' || !input.confirmOverlap) {
          throw new AppointmentError(
            settings.overlapBehavior === 'allow_with_warning'
              ? 'Dit tijdstip overlapt met een bestaande afspraak en vereist bevestiging van de eigenaar.'
              : 'Dit tijdstip overlapt met een bestaande afspraak.',
            'CONFLICT',
          )
        }
      }

      const created = await insertAppointment(tx, {
        customerUserId: actor.kind === 'customer' ? actor.userId : actor.kind === 'owner' ? input.customerUserId : null,
        guestName: actor.kind === 'guest' || (actor.kind === 'owner' && input.customerUserId === undefined) ? input.guestName ?? null : null,
        guestPhone: actor.kind === 'guest' || (actor.kind === 'owner' && input.customerUserId === undefined) ? input.guestPhone ?? null : null,
        guestEmail: actor.kind === 'guest' || (actor.kind === 'owner' && input.customerUserId === undefined) ? input.guestEmail ?? null : null,
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
        overrideOpeningHours: actor.kind === 'owner' ? input.overrideOpeningHours : false,
        overrideBreak: actor.kind === 'owner' ? input.overrideBreak : false,
        overrideWholeDayBlock: actor.kind === 'owner' ? input.overrideWholeDayBlock : false,
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
      // De melding voor de eigenaar wordt binnen dezelfde transactie
      // vastgelegd als de afspraak, ook wanneer de eigenaar de afspraak zelf
      // aanmaakt. Zo kan een geslaagde boeking nooit stilzwijgend een melding
      // verliezen.
      await recordAppointmentBookedNotification(tx, {
        id: appointment.id,
        customerUserId: appointment.customerUserId,
        guestName: appointment.guestName,
      })
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

export async function listOwnerAppointments(input: AppointmentListInput): Promise<AppointmentDTO[]> {
  try {
    const rows = await listAppointments(db, { from: input.from, to: input.to })
    return rows.map(mapAppointment)
  } catch {
    throw new AppointmentError('Afspraken konden niet worden geladen.', 'FAILED')
  }
}

function mapCancellationRequest(row: CancellationRequestRow): CancellationRequestDTO {
  return {
    id: row.id,
    appointmentId: row.appointmentId,
    requestedByUserId: row.requestedByUserId,
    reason: row.reason,
    status: row.status,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

type CancellationRequestWithAppointment = Awaited<ReturnType<typeof listCancellationRequestRows>>

function mapCancellationRequestListItem(row: CancellationRequestWithAppointment[number]): CancellationRequestListItemDTO {
  return {
    request: mapCancellationRequest(row.request),
    appointment: row.appointment
      ? {
          id: row.appointment.id,
          customerUserId: row.appointment.customerUserId,
          guestName: row.appointment.guestName,
          guestPhone: row.appointment.guestPhone,
          serviceNameAtBooking: row.appointment.serviceNameAtBooking,
          startsAt: row.appointment.startsAt,
          endsAt: row.appointment.endsAt,
          status: row.appointment.status,
        }
      : null,
  }
}

async function loadBookingSettings(executor: AppointmentExecutor) {
  const [settings] = await executor.select().from(bookingSettings).where(eq(bookingSettings.id, 1)).limit(1)
  if (!settings) throw new AppointmentError('Boekingsinstellingen ontbreken.', 'FAILED')
  return settings
}

async function withAppointmentLock<T>(executor: AppointmentExecutor, work: () => Promise<T>): Promise<T> {
  const barberUserId = await resolveSingleBarber(executor)
  await acquireAppointmentLock(executor, barberUserId)
  return work()
}

export async function updateAppointmentStatus(id: string, targetStatus: AppointmentStatusUpdateInput['status'], actor: AppointmentMutationActor): Promise<AppointmentDTO> {
  try {
    return await db.transaction(async (tx) => {
      return withAppointmentLock(tx, async () => {
        requireOwnerMutationActor(actor)
        const appointment = await findAppointmentById(tx, id)
        if (!appointment) throw new AppointmentError('Afspraak niet gevonden.', 'NOT_FOUND')
        if (!canTransitionAppointmentStatus(appointment.status, targetStatus)) {
          throw new AppointmentError('Deze statusovergang is niet toegestaan.', 'INVALID')
        }
        const now = new Date()
        const values: Parameters<typeof updateAppointment>[2] = { status: targetStatus }
        if (targetStatus === 'no_show') {
          // Een no_show geeft het tijdslot altijd automatisch vrij, in dezelfde
          // transactie als de statusovergang (BUSINESS_RULES.md §17).
          values.slotReleasedAt = now
        }
        if (targetStatus === 'completed') values.completedAt = now
        const updated = await updateAppointment(tx, id, values)
        if (!updated) throw new AppointmentError('Afspraak kon niet worden bijgewerkt.', 'FAILED')
        const dto = mapAppointment(updated)
        await recordAuditEvent({
          action: targetStatus === 'no_show' ? 'appointment.no_show' : 'appointment.status_change',
          actorUserId: actor.userId,
          entityType: 'appointment',
          entityId: dto.id,
          metadata: {
            before: { status: appointment.status },
            after: { status: dto.status, slotReleasedAt: dto.slotReleasedAt?.toISOString() ?? null, completedAt: dto.completedAt?.toISOString() ?? null },
          },
        }, tx)
        return dto
      })
    })
  } catch (error) {
    return mapAppointmentError(error, 'Afspraakstatus kon niet worden bijgewerkt.')
  }
}

export async function cancelAppointment(id: string, actor: AppointmentMutationActor): Promise<AppointmentDTO> {
  try {
    return await db.transaction(async (tx) => {
      return withAppointmentLock(tx, async () => {
        const appointment = await findAppointmentById(tx, id)
        if (!appointment) throw new AppointmentError('Afspraak niet gevonden.', 'NOT_FOUND')
        requireAppointmentMutationAccess(actor, appointment.customerUserId)
        if (!canTransitionAppointmentStatus(appointment.status, 'cancelled')) {
          throw new AppointmentError('Deze afspraak kan niet worden geannuleerd.', 'INVALID')
        }
        if (actor.kind === 'customer') {
          const settings = await loadBookingSettings(tx)
          const remainingMs = appointment.startsAt.getTime() - Date.now()
          if (remainingMs < settings.cancellationDeadlineMinutes * 60_000) {
            throw new AppointmentError('Binnen 24 uur voor de afspraak kun je niet direct annuleren. Dien een annuleringsverzoek in.', 'CONFLICT')
          }
        }
        const cancelledAt = new Date()
        const updated = await updateAppointment(tx, id, { status: 'cancelled', cancelledAt })
        if (!updated) throw new AppointmentError('Afspraak kon niet worden geannuleerd.', 'FAILED')
        const dto = mapAppointment(updated)
        await recordAuditEvent({
          action: 'appointment.cancel',
          actorUserId: actor.userId,
          entityType: 'appointment',
          entityId: dto.id,
          metadata: { after: { status: dto.status, cancelledAt: dto.cancelledAt?.toISOString() ?? null } },
        }, tx)
        // Alleen een daadwerkelijke overgang naar `cancelled` meldt dit aan de
        // eigenaar. De gebeurtenissleutel is stabiel, zodat een herhaalde
        // verwerking geen tweede melding oplevert.
        if (shouldNotifyAppointmentCancelled(appointment.status, dto.status)) {
          await recordAppointmentCancelledNotification(tx, {
            id: dto.id,
            customerUserId: dto.customerUserId,
            guestName: dto.guestName,
          })
        }
        return dto
      })
    })
  } catch (error) {
    return mapAppointmentError(error, 'Afspraak kon niet worden geannuleerd.')
  }
}

export async function modifyAppointment(id: string, input: AppointmentModifyInput, actor: AppointmentMutationActor): Promise<ModifyAppointmentResult> {
  try {
    return await db.transaction(async (tx) => {
      return withAppointmentLock(tx, async () => {
        const appointment = await findAppointmentById(tx, id)
        if (!appointment) throw new AppointmentError('Afspraak niet gevonden.', 'NOT_FOUND')
        requireAppointmentMutationAccess(actor, appointment.customerUserId)
        if (appointment.status !== 'new' && appointment.status !== 'confirmed') {
          throw new AppointmentError('Deze afspraak kan niet meer worden gewijzigd.', 'INVALID')
        }
        if (actor.kind === 'customer') {
          if (input.overrideOpeningHours || input.overrideBreak || input.overrideWholeDayBlock) {
            throw new AuthError('Alleen de eigenaar mag beschikbaarheid overrulen.', 'FORBIDDEN')
          }
        }

        const settings = await loadBookingSettings(tx)

        const serviceId = input.serviceId ?? appointment.serviceId
        const [service] = await tx
          .select()
          .from(services)
          .where(and(eq(services.id, serviceId), eq(services.active, true), isNull(services.archivedAt)))
          .limit(1)
        if (!service) throw new AppointmentError('Deze dienst is niet beschikbaar.', 'INVALID')

        const localBooking = input.localDate && input.localTime
          ? resolveLocalBooking({ serviceId, localDate: input.localDate, localTime: input.localTime, overrideOpeningHours: false, overrideBreak: false, overrideWholeDayBlock: false })
          : resolveLocalBooking({ serviceId, startsAt: appointment.startsAt, overrideOpeningHours: false, overrideBreak: false, overrideWholeDayBlock: false })
        const newStartsAt = localBooking.startsAt
        assertBookingInterval(newStartsAt)
        const newEndsAt = calculateOccupiedEnd(newStartsAt, service.durationMinutes, settings.bufferMinutes)

        let customerUserId = appointment.customerUserId
        let guestName = appointment.guestName
        let guestPhone = appointment.guestPhone
        let guestEmail = appointment.guestEmail
        if (input.customerUserId !== undefined) {
          requireOwnerMutationActor(actor)
          const [customer] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.customerUserId), eq(users.role, 'customer'))).limit(1)
          if (!customer) throw new AppointmentError('De gekozen customer bestaat niet.', 'INVALID')
          customerUserId = customer.id
          guestName = null
          guestPhone = null
          guestEmail = null
        }

        const scheduleChanged = newStartsAt.getTime() !== appointment.startsAt.getTime() || serviceId !== appointment.serviceId
        const customerChanged = input.customerUserId !== undefined
        if (!scheduleChanged && !customerChanged) {
          throw new AppointmentError('Er is geen wijziging opgegeven.', 'INVALID')
        }

        if (scheduleChanged) {
          if (newStartsAt.getTime() < Date.now()) {
            throw new AppointmentError('Het gekozen tijdstip ligt in het verleden.', 'CONFLICT')
          }
          const overrides = actor.kind === 'owner'
            ? { openingHours: input.overrideOpeningHours, break: input.overrideBreak, wholeDayBlock: input.overrideWholeDayBlock }
            : undefined
          const availabilityInput = await loadAvailabilityInput(tx, { serviceId, date: localBooking.date }, overrides)
          const otherAppointments = availabilityInput.appointments.filter((entry) => entry.id !== appointment.id)
          const boundaryInput = { ...availabilityInput, appointments: [] }
          if (!isSlotAvailable(boundaryInput, newStartsAt)) {
            throw new AppointmentError('Dit tijdstip is niet beschikbaar.', 'CONFLICT')
          }
          const requested = { startsAt: newStartsAt, endsAt: newEndsAt }
          const overlapping = otherAppointments.some((entry) => blocksCapacity(entry) && isOverlapping(entry, requested))
          if (overlapping) {
            if (actor.kind === 'customer' || settings.overlapBehavior === 'block') {
              throw new AppointmentError('Dit tijdstip overlapt met een bestaande afspraak.', 'CONFLICT')
            }
            if (!input.confirmOverlap) {
              return { kind: 'overlap_warning', message: 'Dit tijdstip overlapt met een bestaande afspraak. Bevestig dat je de wijziging toch wilt doorvoeren.' }
            }
          }
        }

        const values: Parameters<typeof updateAppointment>[2] = {}
        if (scheduleChanged) {
          values.serviceId = service.id
          values.serviceNameAtBooking = service.name
          values.servicePriceCentsAtBooking = service.priceCents
          values.serviceDurationMinutesAtBooking = service.durationMinutes
          values.bufferMinutesAtBooking = settings.bufferMinutes
          values.startsAt = newStartsAt
          values.endsAt = newEndsAt
          if (actor.kind === 'owner') {
            values.overrideOpeningHours = input.overrideOpeningHours
            values.overrideBreak = input.overrideBreak
            values.overrideWholeDayBlock = input.overrideWholeDayBlock
          }
        }
        if (customerChanged) {
          values.customerUserId = customerUserId
          values.guestName = guestName
          values.guestPhone = guestPhone
          values.guestEmail = guestEmail
        }

        const updated = await updateAppointment(tx, id, values)
        if (!updated) throw new AppointmentError('Afspraak kon niet worden gewijzigd.', 'FAILED')
        const dto = mapAppointment(updated)
        await recordAuditEvent({
          action: 'appointment.modify',
          actorUserId: actor.userId,
          entityType: 'appointment',
          entityId: dto.id,
          metadata: {
            before: {
              serviceId: appointment.serviceId,
              startsAt: appointment.startsAt.toISOString(),
              endsAt: appointment.endsAt.toISOString(),
              status: appointment.status,
            },
            after: {
              serviceId: dto.serviceId,
              startsAt: dto.startsAt.toISOString(),
              endsAt: dto.endsAt.toISOString(),
              status: dto.status,
            },
          },
        }, tx)
        return { kind: 'updated', appointment: dto }
      })
    })
  } catch (error) {
    return mapAppointmentError(error, 'Afspraak kon niet worden gewijzigd.')
  }
}

export async function requestCancellation(appointmentId: string, reason: string, actor: AppointmentMutationActor): Promise<CancellationRequestDTO> {
  try {
    return await db.transaction(async (tx) => {
      return withAppointmentLock(tx, async () => {
        if (actor.kind !== 'customer') {
          throw new AuthError('Alleen een ingelogde customer kan een annuleringsverzoek indienen.', 'FORBIDDEN')
        }
        const appointment = await findAppointmentById(tx, appointmentId)
        if (!appointment) throw new AppointmentError('Afspraak niet gevonden.', 'NOT_FOUND')
        requireAppointmentMutationAccess(actor, appointment.customerUserId)
        if (appointment.status !== 'new' && appointment.status !== 'confirmed') {
          throw new AppointmentError('Deze afspraak kan niet meer worden geannuleerd.', 'INVALID')
        }
        const existing = await findPendingCancellationRequestByAppointmentId(tx, appointmentId)
        if (existing) throw new AppointmentError('Er is al een annuleringsverzoek in behandeling.', 'CONFLICT')
        const created = await insertCancellationRequest(tx, { appointmentId, requestedByUserId: actor.userId, reason })
        if (!created) throw new AppointmentError('Annuleringsverzoek kon niet worden aangemaakt.', 'FAILED')
        const dto = mapCancellationRequest(created)
        await recordAuditEvent({
          action: 'appointment.cancellation_request',
          actorUserId: actor.userId,
          entityType: 'cancellation_request',
          entityId: dto.id,
          metadata: { appointmentId: dto.appointmentId, status: dto.status },
        }, tx)
        return dto
      })
    })
  } catch (error) {
    return mapAppointmentError(error, 'Annuleringsverzoek kon niet worden aangemaakt.')
  }
}

export async function withdrawCancellationRequest(id: string, actor: AppointmentMutationActor): Promise<CancellationRequestDTO> {
  try {
    return await db.transaction(async (tx) => {
      return withAppointmentLock(tx, async () => {
        const request = await findCancellationRequestById(tx, id)
        if (!request) throw new AppointmentError('Annuleringsverzoek niet gevonden.', 'NOT_FOUND')
        if (actor.kind !== 'customer' || request.requestedByUserId !== actor.userId) {
          throw new AuthError('Geen toegang.', 'FORBIDDEN')
        }
        const locked = await findCancellationRequestByIdForUpdate(tx, id)
        if (!locked) throw new AppointmentError('Annuleringsverzoek niet gevonden.', 'NOT_FOUND')
        if (!canTransitionCancellationRequestStatus(locked.status, 'withdrawn')) {
          throw new AppointmentError('Dit verzoek kan niet meer worden ingetrokken.', 'CONFLICT')
        }
        const updated = await updateCancellationRequest(tx, id, { status: 'withdrawn' })
        if (!updated) throw new AppointmentError('Annuleringsverzoek kon niet worden bijgewerkt.', 'FAILED')
        const dto = mapCancellationRequest(updated)
        await recordAuditEvent({
          action: 'appointment.cancellation_request.withdraw',
          actorUserId: actor.userId,
          entityType: 'cancellation_request',
          entityId: dto.id,
          metadata: { appointmentId: dto.appointmentId, status: dto.status },
        }, tx)
        return dto
      })
    })
  } catch (error) {
    return mapAppointmentError(error, 'Annuleringsverzoek kon niet worden ingetrokken.')
  }
}

export type CancellationRequestReviewResult = {
  request: CancellationRequestDTO
  appointment: AppointmentDTO
}

export async function approveCancellationRequest(id: string, actor: AppointmentMutationActor): Promise<CancellationRequestReviewResult> {
  try {
    return await db.transaction(async (tx) => {
      return withAppointmentLock(tx, async () => {
        requireOwnerMutationActor(actor)
        const request = await findCancellationRequestById(tx, id)
        if (!request) throw new AppointmentError('Annuleringsverzoek niet gevonden.', 'NOT_FOUND')
        const locked = await findCancellationRequestByIdForUpdate(tx, id)
        if (!locked) throw new AppointmentError('Annuleringsverzoek niet gevonden.', 'NOT_FOUND')
        if (!canTransitionCancellationRequestStatus(locked.status, 'approved')) {
          throw new AppointmentError('Dit verzoek kan niet meer worden goedgekeurd.', 'CONFLICT')
        }
        const appointment = await findAppointmentById(tx, locked.appointmentId)
        if (!appointment) throw new AppointmentError('Afspraak niet gevonden.', 'NOT_FOUND')
        if (appointment.status !== 'new' && appointment.status !== 'confirmed') {
          throw new AppointmentError('De afspraak kan niet meer worden geannuleerd.', 'CONFLICT')
        }
        const now = new Date()
        const updatedRequest = await updateCancellationRequest(tx, id, { status: 'approved', reviewedByUserId: actor.userId, reviewedAt: now })
        const updatedAppointment = await updateAppointment(tx, appointment.id, { status: 'cancelled', cancelledAt: now })
        if (!updatedRequest || !updatedAppointment) throw new AppointmentError('Annuleringsverzoek kon niet worden verwerkt.', 'FAILED')
        const requestDto = mapCancellationRequest(updatedRequest)
        const appointmentDto = mapAppointment(updatedAppointment)
        await recordAuditEvent({
          action: 'appointment.cancellation_request.approve',
          actorUserId: actor.userId,
          entityType: 'cancellation_request',
          entityId: requestDto.id,
          metadata: {
            appointmentId: requestDto.appointmentId,
            statusBefore: appointment.status,
            statusAfter: appointmentDto.status,
          },
        }, tx)
        // Het goedkeuren van een verzoek veroorzaakt een echte overgang naar
        // `cancelled` en meldt dat aan de eigenaar. Een verzoek zelf levert
        // geen melding op.
        if (shouldNotifyAppointmentCancelled(appointment.status, appointmentDto.status)) {
          await recordAppointmentCancelledNotification(tx, {
            id: appointmentDto.id,
            customerUserId: appointmentDto.customerUserId,
            guestName: appointmentDto.guestName,
          })
        }
        return { request: requestDto, appointment: appointmentDto }
      })
    })
  } catch (error) {
    return mapAppointmentError(error, 'Annuleringsverzoek kon niet worden goedgekeurd.')
  }
}

export async function rejectCancellationRequest(id: string, actor: AppointmentMutationActor): Promise<CancellationRequestDTO> {
  try {
    return await db.transaction(async (tx) => {
      return withAppointmentLock(tx, async () => {
        requireOwnerMutationActor(actor)
        const request = await findCancellationRequestById(tx, id)
        if (!request) throw new AppointmentError('Annuleringsverzoek niet gevonden.', 'NOT_FOUND')
        const locked = await findCancellationRequestByIdForUpdate(tx, id)
        if (!locked) throw new AppointmentError('Annuleringsverzoek niet gevonden.', 'NOT_FOUND')
        if (!canTransitionCancellationRequestStatus(locked.status, 'rejected')) {
          throw new AppointmentError('Dit verzoek kan niet meer worden afgewezen.', 'CONFLICT')
        }
        const now = new Date()
        const updated = await updateCancellationRequest(tx, id, { status: 'rejected', reviewedByUserId: actor.userId, reviewedAt: now })
        if (!updated) throw new AppointmentError('Annuleringsverzoek kon niet worden verwerkt.', 'FAILED')
        const dto = mapCancellationRequest(updated)
        await recordAuditEvent({
          action: 'appointment.cancellation_request.reject',
          actorUserId: actor.userId,
          entityType: 'cancellation_request',
          entityId: dto.id,
          metadata: { appointmentId: dto.appointmentId, status: dto.status },
        }, tx)
        return dto
      })
    })
  } catch (error) {
    return mapAppointmentError(error, 'Annuleringsverzoek kon niet worden afgewezen.')
  }
}

export async function listCancellationRequests(input: CancellationRequestListInput, actor: AppointmentMutationActor): Promise<CancellationRequestListItemDTO[]> {
  try {
    const filter: CancellationRequestListFilter = {}
    if (actor.kind === 'customer') {
      filter.customerUserId = actor.userId
      if (input.appointmentId) filter.appointmentId = input.appointmentId
    } else {
      if (input.appointmentId) {
        filter.appointmentId = input.appointmentId
      } else {
        filter.status = 'pending'
      }
    }
    const rows = await listCancellationRequestRows(db, filter)
    return rows.map(mapCancellationRequestListItem)
  } catch {
    throw new AppointmentError('Annuleringsverzoeken konden niet worden geladen.', 'FAILED')
  }
}
