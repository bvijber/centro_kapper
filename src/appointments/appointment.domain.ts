import type { BlockingAppointment } from './appointment.overlap'

export type AppointmentStatus = BlockingAppointment['status']

const transitions: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  new: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
  no_show: [],
}

export function canTransitionAppointmentStatus(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return transitions[from].includes(to)
}

export function assertAppointmentLifecycle(status: AppointmentStatus, slotReleasedAt: Date | null): void {
  if (slotReleasedAt !== null && status !== 'no_show') {
    throw new Error('Only no-show appointments can release their occupied slot.')
  }
}

export function calculateOccupiedEnd(startsAt: Date, serviceDurationMinutes: number, bufferMinutes: number): Date {
  if (!Number.isInteger(serviceDurationMinutes) || serviceDurationMinutes <= 0) {
    throw new Error('Service duration must be a positive integer.')
  }
  if (!Number.isInteger(bufferMinutes) || bufferMinutes < 0) {
    throw new Error('Buffer must be a non-negative integer.')
  }
  return new Date(startsAt.getTime() + (serviceDurationMinutes + bufferMinutes) * 60_000)
}
