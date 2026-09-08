import type { AppointmentStatus } from './appointment.domain'

const statusLabel: Record<AppointmentStatus, string> = {
  new: 'Nieuw',
  confirmed: 'Bevestigd',
  in_progress: 'In behandeling',
  completed: 'Afgerond',
  cancelled: 'Geannuleerd',
  no_show: 'Niet verschenen',
}

const statusClass: Record<AppointmentStatus, string> = {
  new: 'new',
  confirmed: 'confirmed',
  in_progress: 'new',
  completed: 'done',
  cancelled: 'cancelled',
  no_show: 'noshow',
}

export function appointmentStatusLabel(status: AppointmentStatus): string {
  return statusLabel[status]
}

export function appointmentStatusClass(status: AppointmentStatus): string {
  return statusClass[status]
}

export function formatPriceCents(cents: number): string {
  return `€ ${(cents / 100).toFixed(2).replace('.', ',')}`
}