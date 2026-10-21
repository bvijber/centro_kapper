import { describe, expect, it, vi } from 'vitest'

const sessionMocks = vi.hoisted(() => ({
  getSessionUserFromToken: vi.fn(),
}))

vi.mock('../auth/session.server', () => ({
  SESSION_COOKIE: 'ck_session',
  getSessionUserFromToken: sessionMocks.getSessionUserFromToken,
}))
vi.mock('../db/client.server', () => ({ db: {} }))
vi.mock('./owner-notification.service.server', () => ({
  getOwnerNotificationWatchState: vi.fn(),
}))

import {
  OWNER_NOTIFICATION_HEARTBEAT_INTERVAL_MS,
  OWNER_NOTIFICATION_STREAM_HEADERS,
  OWNER_NOTIFICATION_WATCH_INTERVAL_MS,
  createOwnerNotificationStream,
  handleOwnerNotificationStream,
} from './owner-notification.stream.server'

const owner = { id: '11111111-1111-1111-1111-111111111111', email: 'owner@example.test', role: 'owner' as const, name: 'Owner', phone: '0612345678' }
const customer = { id: '22222222-2222-2222-2222-222222222222', email: 'customer@example.test', role: 'customer' as const, name: 'Customer', phone: '0612345678' }

async function readChunks(reader: ReadableStreamDefaultReader<Uint8Array>, count: number): Promise<string> {
  const decoder = new TextDecoder()
  let text = ''
  for (let index = 0; index < count; index += 1) {
    const { value, done } = await reader.read()
    if (done) break
    text += decoder.decode(value)
  }
  return text
}

describe('owner notification SSE stream', () => {
  it('sends a minimal update as soon as a notification becomes available', async () => {
    const watchState = vi.fn(async () => ({ latestId: 'notification-1', unread: 1 }))
    const stream = createOwnerNotificationStream(owner.id, {
      watchState,
      watchIntervalMs: 10,
      heartbeatIntervalMs: 10_000,
    })
    const reader = stream.getReader()

    const text = await readChunks(reader, 3)

    expect(text).toContain('retry: 3000')
    expect(text).toContain('event: ready')
    expect(text).toContain('event: notification')
    // Alleen de identiteit van de melding; geen titel, tekst of persoonsgegevens.
    expect(text).toContain('data: {"id":"notification-1"}')
    expect(text).not.toContain('Centro Kapper')
    expect(text).not.toContain('Jan Jansen')
    await reader.cancel()
  })

  it('stops watching and releases its timers when the connection is closed', async () => {
    let watchCalls = 0
    const clearIntervalFn = vi.fn()
    const stream = createOwnerNotificationStream(owner.id, {
      watchState: async () => {
        watchCalls += 1
        return { latestId: null, unread: 0 }
      },
      watchIntervalMs: 5,
      heartbeatIntervalMs: 5,
      clearIntervalFn,
    })
    const reader = stream.getReader()
    await readChunks(reader, 1)
    const callsWhileOpen = watchCalls

    await reader.cancel()
    await new Promise((resolve) => setTimeout(resolve, 40))

    expect(watchCalls).toBe(callsWhileOpen)
    expect(clearIntervalFn).toHaveBeenCalled()
  })

  it('reports the current state again on a new connection so missed updates are recovered', async () => {
    const watchState = vi.fn(async () => ({ latestId: 'notification-9', unread: 2 }))
    const stream = createOwnerNotificationStream(owner.id, { watchState, watchIntervalMs: 10 })
    const reader = stream.getReader()

    const text = await readChunks(reader, 3)

    expect(text).toContain('data: {"id":"notification-9"}')
    await reader.cancel()
  })

  it('keeps the connection alive when the watch query fails', async () => {
    const watchState = vi.fn(async () => {
      throw new Error('database niet bereikbaar')
    })
    const stream = createOwnerNotificationStream(owner.id, { watchState, watchIntervalMs: 10 })
    const reader = stream.getReader()

    const text = await readChunks(reader, 2)

    expect(text).toContain('event: ready')
    expect(text).not.toContain('event: notification')
    await reader.cancel()
  })

  it('rejects an unauthenticated request', async () => {
    sessionMocks.getSessionUserFromToken.mockReset()
    sessionMocks.getSessionUserFromToken.mockResolvedValue(null)

    const response = await handleOwnerNotificationStream(new Request('https://kapper.test/api/owner-notifications/stream'))

    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toContain('text/plain')
  })

  it('rejects a request without a session cookie', async () => {
    sessionMocks.getSessionUserFromToken.mockReset()
    sessionMocks.getSessionUserFromToken.mockResolvedValue(null)

    const response = await handleOwnerNotificationStream(
      new Request('https://kapper.test/api/owner-notifications/stream'),
    )

    expect(response.status).toBe(401)
    expect(sessionMocks.getSessionUserFromToken).toHaveBeenCalledWith(null)
  })

  it('rejects a customer session', async () => {
    sessionMocks.getSessionUserFromToken.mockReset()
    sessionMocks.getSessionUserFromToken.mockResolvedValue(customer)

    const response = await handleOwnerNotificationStream(
      new Request('https://kapper.test/api/owner-notifications/stream', {
        headers: { cookie: 'ck_session=abc' },
      }),
    )

    expect(response.status).toBe(401)
  })

  it('opens the stream for the authenticated owner', async () => {
    sessionMocks.getSessionUserFromToken.mockReset()
    sessionMocks.getSessionUserFromToken.mockResolvedValue(owner)

    const response = await handleOwnerNotificationStream(
      new Request('https://kapper.test/api/owner-notifications/stream', {
        headers: { cookie: 'ck_session=abc' },
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(OWNER_NOTIFICATION_STREAM_HEADERS['content-type'])
    expect(response.headers.get('cache-control')).toContain('no-cache')
    await response.body?.cancel()
  })

  it('uses sensible default intervals', () => {
    expect(OWNER_NOTIFICATION_WATCH_INTERVAL_MS).toBeGreaterThan(0)
    expect(OWNER_NOTIFICATION_HEARTBEAT_INTERVAL_MS).toBeGreaterThan(OWNER_NOTIFICATION_WATCH_INTERVAL_MS)
  })
})
