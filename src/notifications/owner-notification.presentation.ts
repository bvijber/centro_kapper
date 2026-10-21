/**
 * Weergavetekst en navigatiedoel van interne eigenaar-notificaties.
 *
 * De tekst wordt server-side vastgelegd op het moment van de gebeurtenis, zodat
 * de bell later dezelfde tekst toont. De klantnaam mag in deze interne, voor
 * uitsluitend de eigenaar zichtbare melding voorkomen (BUSINESS_RULES.md §29).
 */

import { formatAmsterdamDate, formatAmsterdamTime } from '../timezone'
import type { OwnerNotificationEvent } from './owner-notification.events'

export type OwnerNotificationTarget = '/owner/queue' | '/owner/appointments'

export function ownerNotificationTarget(event: OwnerNotificationEvent): OwnerNotificationTarget {
  return event === 'queue_joined' || event === 'queue_left'
    ? '/owner/queue'
    : '/owner/appointments'
}

function displayName(name: string | null | undefined): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function queueJoinedNotificationText(name: string | null | undefined): {
  title: string
  body: string
} {
  const customer = displayName(name)
  return {
    title: 'Nieuwe wachtrij-inschrijving',
    body: customer
      ? `${customer} is toegevoegd aan de wachtrij.`
      : 'Er is een nieuwe klant toegevoegd aan de wachtrij.',
  }
}

export function queueLeftNotificationText(name: string | null | undefined): {
  title: string
  body: string
} {
  const customer = displayName(name)
  return {
    title: 'Klant heeft de wachtrij verlaten',
    body: customer
      ? `${customer} heeft de wachtrij verlaten.`
      : 'Een klant heeft de wachtrij verlaten.',
  }
}

export function appointmentBookedNotificationText(name: string | null | undefined): {
  title: string
  body: string
} {
  const customer = displayName(name)
  return {
    title: 'Nieuwe afspraak',
    body: customer
      ? `${customer} heeft een afspraak geboekt.`
      : 'Er is een nieuwe afspraak geboekt.',
  }
}

export function appointmentCancelledNotificationText(name: string | null | undefined): {
  title: string
  body: string
} {
  const customer = displayName(name)
  return {
    title: 'Afspraak geannuleerd',
    body: customer
      ? `De afspraak van ${customer} is geannuleerd.`
      : 'Een afspraak is geannuleerd.',
  }
}

/** Relatieve tijdsaanduiding van een melding in de bell. */
export function formatNotificationTimestamp(
  value: Date | string,
  now: Date = new Date(),
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const difference = now.getTime() - date.getTime()
  if (difference < 60_000) return 'zojuist'
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)} min geleden`
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)} uur geleden`
  return `${formatAmsterdamDate(date)} ${formatAmsterdamTime(date)}`
}
