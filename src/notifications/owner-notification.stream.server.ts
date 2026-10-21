/**
 * Server-Sent Events-stroom voor interne eigenaar-notificaties.
 *
 * Architectuurkeuze: de stroom leest de toestand rechtstreeks uit de
 * database. Er wordt **geen in-memory eventbus** gebruikt, omdat de applicatie
 * op Vercel serverless draait: een gebeurtenis die op een andere instantie
 * wordt vastgelegd, zou bij een in-memory bus verloren gaan. De database is
 * en blijft de bron van waarheid; de stroom is alleen een signaal.
 *
 * De stroom bezorgt uitsluitend een minimale update (de identiteit van de
 * nieuwste melding). De meldingen zelf worden door de client opgehaald via de
 * bestaande beveiligde Server Functions, zodat er geen notificatiegegevens
 * buiten de autorisatielaag terechtkomen.
 */

import { SESSION_COOKIE, getSessionUserFromToken } from '../auth/session.server'
import {
  OWNER_NOTIFICATION_STREAM_EVENT_HEARTBEAT,
  OWNER_NOTIFICATION_STREAM_EVENT_NOTIFICATION,
  OWNER_NOTIFICATION_STREAM_EVENT_READY,
  OWNER_NOTIFICATION_STREAM_RETRY_MS,
} from './owner-notification.stream'
import {
  getOwnerNotificationWatchState,
} from './owner-notification.service.server'
import type { OwnerNotificationWatchState } from './owner-notification.repository.server'

/** Hoe vaak de stroom de database controleert op een nieuwe melding. */
export const OWNER_NOTIFICATION_WATCH_INTERVAL_MS = 2_000

/** Hoe vaak een heartbeat wordt gestuurd om de verbinding open te houden. */
export const OWNER_NOTIFICATION_HEARTBEAT_INTERVAL_MS = 15_000

export const OWNER_NOTIFICATION_STREAM_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
}

export type OwnerNotificationStreamOptions = {
  /** Levert de toestand waarmee de stroom veranderingen detecteert. */
  watchState?: () => Promise<OwnerNotificationWatchState>
  watchIntervalMs?: number
  heartbeatIntervalMs?: number
  setIntervalFn?: (fn: () => void, ms: number) => unknown
  clearIntervalFn?: (id: unknown) => void
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    const key = part.slice(0, separator).trim()
    if (key !== name) continue
    const value = part.slice(separator + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }
  return null
}

/**
 * Bouwt de SSE-stroom voor één eigenaar.
 *
 * De stroom controleert met een korte interval de database op een nieuwe
 * melding. Bij een wijziging wordt een minimale update gestuurd. De timers
 * worden opgeruimd zodra de verbinding wordt verbroken, zodat een verbroken
 * verbinding geen resources vast blijft houden.
 */
export function createOwnerNotificationStream(
  ownerUserId: string,
  options: OwnerNotificationStreamOptions = {},
): ReadableStream<Uint8Array> {
  const watchState = options.watchState ?? (() => getOwnerNotificationWatchState(ownerUserId))
  const watchIntervalMs = options.watchIntervalMs ?? OWNER_NOTIFICATION_WATCH_INTERVAL_MS
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? OWNER_NOTIFICATION_HEARTBEAT_INTERVAL_MS
  const setIntervalFn = options.setIntervalFn ?? ((fn: () => void, ms: number) => setInterval(fn, ms))
  const clearIntervalFn = options.clearIntervalFn ?? ((id: unknown) => clearInterval(id as ReturnType<typeof setInterval>))

  const encoder = new TextEncoder()
  let watchTimer: unknown = null
  let heartbeatTimer: unknown = null
  let closed = false
  let latestId: string | null = null
  let unread = -1

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (chunk: string): void => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          closed = true
        }
      }
      const send = (event: string, data: unknown): void => {
        enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }

      enqueue(`retry: ${OWNER_NOTIFICATION_STREAM_RETRY_MS}\n\n`)
      send(OWNER_NOTIFICATION_STREAM_EVENT_READY, { ok: true })

      const tick = async (): Promise<void> => {
        if (closed) return
        let state: OwnerNotificationWatchState
        try {
          state = await watchState()
        } catch {
          // Een fout in de controle mag de verbinding niet verbreken; de
          // volgende controle probeert het opnieuw.
          return
        }
        if (closed) return
        if (state.latestId !== latestId || state.unread !== unread) {
          latestId = state.latestId
          unread = state.unread
          send(OWNER_NOTIFICATION_STREAM_EVENT_NOTIFICATION, { id: state.latestId })
        }
      }

      await tick()
      watchTimer = setIntervalFn(() => {
        void tick()
      }, watchIntervalMs)
      heartbeatTimer = setIntervalFn(() => {
        send(OWNER_NOTIFICATION_STREAM_EVENT_HEARTBEAT, { t: Date.now() })
      }, heartbeatIntervalMs)
    },
    cancel() {
      closed = true
      if (watchTimer !== null) {
        clearIntervalFn(watchTimer)
        watchTimer = null
      }
      if (heartbeatTimer !== null) {
        clearIntervalFn(heartbeatTimer)
        heartbeatTimer = null
      }
    },
  })
}

/**
 * Authentificeert de eigenaar en opent de stroom.
 *
 * De identiteit wordt uitsluitend afgeleid uit het sessiecookie van de
 * aanvraag; een door de client opgegeven gebruikers-ID wordt nooit gebruikt.
 */
export async function handleOwnerNotificationStream(request: Request): Promise<Response> {
  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE)
  const user = await getSessionUserFromToken(token)
  if (!user || user.role !== 'owner') {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  const stream = createOwnerNotificationStream(user.id)
  request.signal.addEventListener('abort', () => {
    void stream.cancel().catch(() => undefined)
  })
  return new Response(stream, { headers: OWNER_NOTIFICATION_STREAM_HEADERS })
}
