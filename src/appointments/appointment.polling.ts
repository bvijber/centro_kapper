import { listAppointmentsFn, listCancellationRequestsFn } from './appointment.functions'
import type { AppointmentDTO, CancellationRequestListItemDTO } from './appointment.service.server'

/**
 * Snapshots voor de automatische verversing van afspraken.
 *
 * De klantpagina (`MyBookings`) en de kapperspagina (`OwnerAppointments`)
 * gebruiken dezelfde Server Functions; de server bepaalt per rol welke
 * afspraken en annuleringsverzoeken zichtbaar zijn. De dienstenlijst is een
 * statische referentie en wordt daarom niet gepolld.
 */

/**
 * Interval van de automatische verversing van afspraken. Afspraken
 * veranderen minder vaak dan de wachtrij, maar een statuswijziging moet
 * zichtbaar zijn zonder dat de gebruiker hoeft te vernieuwen.
 */
export const APPOINTMENTS_POLL_INTERVAL_MS = 25_000

export type AppointmentsSnapshot = {
  appointments: AppointmentDTO[]
  requests: CancellationRequestListItemDTO[]
}

/**
 * Haalt de zichtbare afspraken en annuleringsverzoeken op via de bestaande
 * Server Functions. Alleen-lezen datapad voor de initiële load, de
 * handmatige refresh en de stille achtergrondverversing.
 */
export async function fetchAppointmentsSnapshot(): Promise<AppointmentsSnapshot> {
  const [appointments, requests] = await Promise.all([
    listAppointmentsFn({ data: {} }),
    listCancellationRequestsFn({ data: {} }),
  ])
  return { appointments, requests }
}
