import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  OWNER_NOTIFICATION_STREAM_EVENT_HEARTBEAT,
  OWNER_NOTIFICATION_STREAM_EVENT_NOTIFICATION,
  OWNER_NOTIFICATION_STREAM_EVENT_READY,
  OWNER_NOTIFICATION_STREAM_PATH,
} from './owner-notification.stream'
import {
  OwnerNotificationStreamClient,
  type OwnerNotificationStreamSource,
} from './owner-notification.stream-connection'

type FakeSource = OwnerNotificationStreamSource & {
  emit: (type: string) => void
  closed: boolean
}

function createFakeSource(): FakeSource {
  const listeners = new Map<string, Array<() => void>>()
  const source: FakeSource = {
    onopen: null,
    onerror: null,
    closed: false,
    addEventListener: (type: string, listener: () => void) => {
      const current = listeners.get(type) ?? []
      current.push(listener)
      listeners.set(type, current)
    },
    close: () => {
      source.closed = true
    },
    emit: (type: string) => {
      for (const listener of listeners.get(type) ?? []) listener()
    },
  }
  return source
}

describe('owner notification stream client', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports a new notification on an active connection', () => {
    const source = createFakeSource()
    const onNotification = vi.fn()
    const client = new OwnerNotificationStreamClient({
      createSource: () => source,
      onNotification,
    })

    client.start()
    source.emit(OWNER_NOTIFICATION_STREAM_EVENT_NOTIFICATION)

    expect(onNotification).toHaveBeenCalledTimes(1)
    client.stop()
  })

  it('reports the connection as established and asks for a refresh', () => {
    const source = createFakeSource()
    const onConnected = vi.fn()
    const client = new OwnerNotificationStreamClient({
      createSource: () => source,
      onConnected,
    })

    client.start()
    source.onopen?.({})

    expect(onConnected).toHaveBeenCalledTimes(1)
    expect(client.isConnected).toBe(true)
    client.stop()
  })

  it('falls back when the connection is lost and reconnects afterwards', () => {
    const sources: FakeSource[] = []
    const onDisconnected = vi.fn()
    const client = new OwnerNotificationStreamClient({
      createSource: () => {
        const source = createFakeSource()
        sources.push(source)
        return source
      },
      onDisconnected,
    })

    client.start()
    expect(sources).toHaveLength(1)

    sources[0]?.onerror?.({})
    expect(onDisconnected).toHaveBeenCalledTimes(1)
    expect(sources[0]?.closed).toBe(true)

    // De terugval wordt herverbonden met een oplopende vertraging.
    vi.advanceTimersByTime(2_000)
    expect(sources).toHaveLength(2)
    expect(sources[1]?.closed).toBe(false)
    client.stop()
  })

  it('does not reconnect after the client is stopped', () => {
    const sources: FakeSource[] = []
    const client = new OwnerNotificationStreamClient({
      createSource: () => {
        const source = createFakeSource()
        sources.push(source)
        return source
      },
    })

    client.start()
    client.stop()
    sources[0]?.onerror?.({})
    vi.advanceTimersByTime(60_000)

    expect(sources).toHaveLength(1)
  })

  it('treats a silent stream as lost and falls back', () => {
    const sources: FakeSource[] = []
    const onDisconnected = vi.fn()
    const client = new OwnerNotificationStreamClient({
      createSource: () => {
        const source = createFakeSource()
        sources.push(source)
        return source
      },
      onDisconnected,
      watchdogIntervalMs: 1_000,
    })

    client.start()
    source_open(sources[0]!)
    expect(onDisconnected).not.toHaveBeenCalled()

    // Er komt geen signaal meer binnen; de watchdog merkt dat op.
    vi.advanceTimersByTime(60_000)
    expect(onDisconnected).toHaveBeenCalled()
    expect(sources[0]?.closed).toBe(true)
    // De client blijft opnieuw verbinden zolang de stream stil is.
    expect(sources.length).toBeGreaterThan(1)
    client.stop()
  })

  it('keeps the connection alive on heartbeats', () => {
    const sources: FakeSource[] = []
    const onDisconnected = vi.fn()
    const client = new OwnerNotificationStreamClient({
      createSource: () => {
        const source = createFakeSource()
        sources.push(source)
        return source
      },
      onDisconnected,
      watchdogIntervalMs: 1_000,
    })

    client.start()
    source_open(sources[0]!)
    vi.advanceTimersByTime(15_000)
    sources[0]?.emit(OWNER_NOTIFICATION_STREAM_EVENT_HEARTBEAT)
    vi.advanceTimersByTime(30_000)

    expect(onDisconnected).not.toHaveBeenCalled()
    client.stop()
  })

  it('uses the shared stream path and the ready event', () => {
    const source = createFakeSource()
    const createSource = vi.fn(() => source)
    const client = new OwnerNotificationStreamClient({ createSource })

    client.start()
    expect(createSource).toHaveBeenCalledWith(OWNER_NOTIFICATION_STREAM_PATH)
    source.emit(OWNER_NOTIFICATION_STREAM_EVENT_READY)
    client.stop()
  })
})

function source_open(source: FakeSource): void {
  source.onopen?.({})
}
