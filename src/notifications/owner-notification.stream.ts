/**
 * Client-veilige constanten en hulpfuncties voor de SSE-stroom van
 * eigenaar-notificaties.
 *
 * Dit module bevat geen serverimports: het wordt zowel door de client (de bel)
 * als door de server (de streamroute) gebruikt.
 */

import type { OwnerNotificationDTO } from './owner-notification.service.server'

export const OWNER_NOTIFICATION_STREAM_PATH = '/api/owner-notifications/stream'

export const OWNER_NOTIFICATION_STREAM_EVENT_READY = 'ready'
export const OWNER_NOTIFICATION_STREAM_EVENT_NOTIFICATION = 'notification'
export const OWNER_NOTIFICATION_STREAM_EVENT_HEARTBEAT = 'heartbeat'

/** De server suggereert deze herverbindingsvertraging aan de browser. */
export const OWNER_NOTIFICATION_STREAM_RETRY_MS = 3_000

/** Terugval: hoelang de client wacht voordat een nieuwe verbinding wordt opgezet. */
export const OWNER_NOTIFICATION_STREAM_RETRY_BASE_MS = 2_000
export const OWNER_NOTIFICATION_STREAM_RETRY_MAX_MS = 30_000

/** De client accepteert geen stilte langer dan dit; daarna wordt herverbonden. */
export const OWNER_NOTIFICATION_STREAM_WATCHDOG_MS = 45_000

export type OwnerNotificationStreamEvent = {
  /** Minimale update: alleen de identiteit van de nieuwste melding. */
  id: string | null
}

/**
 * Exponentiële terugval voor het opzetten van een nieuwe verbinding.
 */
export function nextStreamRetryDelayMs(attempt: number): number {
  if (attempt <= 0) return OWNER_NOTIFICATION_STREAM_RETRY_BASE_MS
  const delay = OWNER_NOTIFICATION_STREAM_RETRY_BASE_MS * 2 ** attempt
  return Math.min(OWNER_NOTIFICATION_STREAM_RETRY_MAX_MS, delay)
}

/**
 * Bouwt de UI-lijst op uit de serverlijst.
 *
 * De server is de bron van waarheid. De lijst wordt op id ontdubbeld, zodat
 * een dubbele update (bijvoorbeeld na een reconnect of wanneer een
 * signaalgebeurtenis en een terugvalpoll tegelijk binnenkomen) nooit dubbele
 * items oplevert.
 */
export function mergeOwnerNotifications(
  incoming: readonly OwnerNotificationDTO[],
): OwnerNotificationDTO[] {
  const merged = new Map<string, OwnerNotificationDTO>()
  for (const item of incoming) merged.set(item.id, item)
  return [...merged.values()]
}

/**
 * Geeft aan of de verbinding als dood moet worden beschouwd omdat er te lang
 * geen enkel signaal (melding of heartbeat) is ontvangen.
 */
export function isStreamStale(lastSignalAt: number, now: number = Date.now()): boolean {
  return now - lastSignalAt > OWNER_NOTIFICATION_STREAM_WATCHDOG_MS
}
