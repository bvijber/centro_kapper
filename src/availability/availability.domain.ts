import { calculateOccupiedEnd } from '../appointments/appointment.domain'
import { blocksCapacity, isOverlapping } from '../appointments/appointment.overlap'
import { getAmsterdamDayBounds, getAmsterdamWeekday, parseAmsterdamLocal } from '../timezone'

export type AvailabilityOpeningHour = { weekday: number; isOpen: boolean; openingTime: string | null; closingTime: string | null }
export type AvailabilityInterval = { startsAt: Date; endsAt: Date }
export type AvailabilityAppointment = AvailabilityInterval & { id?: string; status: 'new' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'; slotReleasedAt: Date | null }
export type AvailabilityOverrides = { openingHours: boolean; break: boolean; wholeDayBlock: boolean }

export type AvailabilityInput = {
  date: string
  serviceDurationMinutes: number
  bufferMinutes: number
  openingHours: AvailabilityOpeningHour[]
  breaks: AvailabilityInterval[]
  wholeDayBlocked: boolean
  appointments: AvailabilityAppointment[]
  overrides?: AvailabilityOverrides
}

export type AvailableSlot = { date: string; time: string; startsAt: Date; endsAt: Date }

function formatLocalMinute(value: number): string {
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`
}

export function isSlotAvailable(input: AvailabilityInput, startsAt: Date): boolean {
  const overrides = input.overrides ?? { openingHours: false, break: false, wholeDayBlock: false }
  const opening = input.openingHours.find((entry) => entry.weekday === getAmsterdamWeekday(input.date))
  if ((!opening || !opening.isOpen || !opening.openingTime || !opening.closingTime) && !overrides.openingHours) return false
  if (input.wholeDayBlocked && !overrides.wholeDayBlock) return false

  const dayBounds = getAmsterdamDayBounds(input.date)
  const openingStart = overrides.openingHours ? dayBounds?.start : opening?.openingTime ? parseAmsterdamLocal(input.date, opening.openingTime) : startsAt
  const openingEnd = overrides.openingHours ? dayBounds?.end : opening?.closingTime ? parseAmsterdamLocal(input.date, opening.closingTime) : calculateOccupiedEnd(startsAt, 24 * 60, 0)
  if (!openingStart || !openingEnd) return false

  const endsAt = calculateOccupiedEnd(startsAt, input.serviceDurationMinutes, input.bufferMinutes)
  if (startsAt < openingStart || endsAt > openingEnd) return false
  if (!overrides.break && input.breaks.some((breakPeriod) => isOverlapping(breakPeriod, { startsAt, endsAt }))) return false
  if (input.appointments.some((appointment) => blocksCapacity(appointment) && isOverlapping(appointment, { startsAt, endsAt }))) return false
  return true
}

export function calculateAvailableSlots(input: AvailabilityInput): AvailableSlot[] {
  const bounds = getAmsterdamDayBounds(input.date)
  if (!bounds) return []
  const opening = input.openingHours.find((entry) => entry.weekday === getAmsterdamWeekday(input.date))
  const overrides = input.overrides ?? { openingHours: false, break: false, wholeDayBlock: false }
  if (input.wholeDayBlocked && !overrides.wholeDayBlock) return []
  if ((!opening || !opening.isOpen || !opening.openingTime || !opening.closingTime) && !overrides.openingHours) return []

  const startTime = overrides.openingHours ? '00:00' : opening?.openingTime ?? '00:00'
  const endTime = overrides.openingHours ? '24:00' : opening?.closingTime ?? '24:00'
  const startMinute = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3))
  const endMinute = endTime === '24:00' ? 24 * 60 : Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3))
  const firstSlotMinute = startMinute + ((15 - (startMinute % 15)) % 15)
  const slots: AvailableSlot[] = []

  // Fixed 15-minute booking interval per BUSINESS_RULES.md section 3.
  for (let minute = firstSlotMinute; minute < endMinute; minute += 15) {
    const time = formatLocalMinute(minute)
    const startsAt = parseAmsterdamLocal(input.date, time)
    if (!startsAt || !isSlotAvailable(input, startsAt)) continue
    slots.push({ date: input.date, time, startsAt, endsAt: calculateOccupiedEnd(startsAt, input.serviceDurationMinutes, input.bufferMinutes) })
  }
  return slots
}
