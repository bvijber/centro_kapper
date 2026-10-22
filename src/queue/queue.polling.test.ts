import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./queue.functions', () => ({
  listCustomerQueueFn: vi.fn(),
  getQueueEntryFn: vi.fn(),
  getQueueEntryPositionFn: vi.fn(),
}))

import { getQueueEntryFn, getQueueEntryPositionFn, listCustomerQueueFn } from './queue.functions'
import type { QueueEntryDTO } from './queue.service.server'
import {
  QUEUE_POLL_BASE_INTERVAL_MS,
  QUEUE_POLL_MAX_INTERVAL_MS,
  QueuePollScheduler,
  createRequestGuard,
  fetchQueueSnapshot,
  hasActiveQueueEntry,
  isQueueSnapshotEqual,
  nextPollDelayMs,
  resolveSelectedEntry,
  toSnapshotView,
  type QueueSnapshot,
} from './queue.polling'

const mockedList = vi.mocked(listCustomerQueueFn)
const mockedGet = vi.mocked(getQueueEntryFn)
const mockedPosition = vi.mocked(getQueueEntryPositionFn)

function makeEntry(overrides: Record<string, unknown> = {}): QueueEntryDTO {
  return {
    id: 'entry-1',
    status: 'waiting',
    serviceName: 'Knippen',
    joinedAt: new Date('2026-01-05T10:00:00.000Z'),
    ...overrides,
  } as unknown as QueueEntryDTO
}

function makeSnapshot(overrides: Partial<QueueSnapshot> = {}): QueueSnapshot {
  const entry = makeEntry() as QueueSnapshot['entries'][number]
  return {
    entries: [entry],
    entry,
    metadata: { position: 1, count: 0, estimatedWaitMinutes: 20 },
    metadataById: { 'entry-1': { position: 1, count: 0, estimatedWaitMinutes: 20 } },
    storedGuestCaps: null,
    ...overrides,
  }
}

describe('nextPollDelayMs', () => {
  it('gebruikt het basisinterval zonder fouten en verdubbelt daarna tot het maximum', () => {
    expect(nextPollDelayMs(0)).toBe(QUEUE_POLL_BASE_INTERVAL_MS)
    expect(nextPollDelayMs(-1)).toBe(QUEUE_POLL_BASE_INTERVAL_MS)
    expect(nextPollDelayMs(1)).toBe(QUEUE_POLL_BASE_INTERVAL_MS * 2)
    expect(nextPollDelayMs(2)).toBe(QUEUE_POLL_BASE_INTERVAL_MS * 4)
    expect(nextPollDelayMs(5)).toBe(QUEUE_POLL_MAX_INTERVAL_MS)
    expect(nextPollDelayMs(100)).toBe(QUEUE_POLL_MAX_INTERVAL_MS)
  })
})

describe('hasActiveQueueEntry', () => {
  it('herkent actieve en inactieve statussen', () => {
    expect(hasActiveQueueEntry(['waiting'])).toBe(true)
    expect(hasActiveQueueEntry(['called'])).toBe(true)
    expect(hasActiveQueueEntry(['in_service'])).toBe(true)
    expect(hasActiveQueueEntry(['completed'])).toBe(false)
    expect(hasActiveQueueEntry(['cancelled'])).toBe(false)
    expect(hasActiveQueueEntry(['skipped'])).toBe(false)
    expect(hasActiveQueueEntry([])).toBe(false)
  })
})

describe('isQueueSnapshotEqual', () => {
  it('negeert objectidentiteit en vergelijkt inhoud', () => {
    const snapshot = makeSnapshot()
    const view = toSnapshotView(snapshot, 'entry-1')
    expect(isQueueSnapshotEqual(null, view)).toBe(false)
    expect(isQueueSnapshotEqual(view, toSnapshotView(makeSnapshot(), 'entry-1'))).toBe(true)
  })

  it('detecteert status-, selectie- en metadatawijzigingen', () => {
    const snapshot = makeSnapshot()
    const view = toSnapshotView(snapshot, 'entry-1')
    const calledEntry = makeEntry({ status: 'called' })
    expect(isQueueSnapshotEqual(view, toSnapshotView(makeSnapshot({ entries: [calledEntry], entry: calledEntry }), 'entry-1'))).toBe(false)
    expect(isQueueSnapshotEqual(view, toSnapshotView(makeSnapshot(), null))).toBe(false)
    expect(
      isQueueSnapshotEqual(
        view,
        toSnapshotView(makeSnapshot({ metadata: { position: 2, count: 1, estimatedWaitMinutes: 40 } }), 'entry-1'),
      ),
    ).toBe(false)
  })
})

describe('resolveSelectedEntry', () => {
  it('behoudt de handmatige selectie zolang die bestaat', () => {
    const entries = [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })] as QueueSnapshot['entries']
    expect(resolveSelectedEntry('b', entries, entries[0])?.id).toBe('b')
    expect(resolveSelectedEntry('weg', entries, entries[0])?.id).toBe('a')
    expect(resolveSelectedEntry(null, entries, entries[0])?.id).toBe('a')
    expect(resolveSelectedEntry(null, [], null)).toBeNull()
  })
})

describe('createRequestGuard', () => {
  it('markeert alleen de meest recente load als actueel', () => {
    const guard = createRequestGuard()
    const first = guard.start()
    const second = guard.start()
    expect(guard.isCurrent(first)).toBe(false)
    expect(guard.isCurrent(second)).toBe(true)
  })
})

describe('QueuePollScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  function createScheduler(load: () => Promise<void>, overrides: Record<string, unknown> = {}) {
    const delays: number[] = []
    const scheduler = new QueuePollScheduler({
      load,
      shouldContinue: () => true,
      setTimeoutFn: ((fn: () => void, ms: number) => {
        delays.push(ms)
        return setTimeout(fn, ms)
      }) as (fn: () => void, ms: number) => unknown,
      clearTimeoutFn: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>),
      isTabVisible: () => true,
      subscribeVisibility: () => () => {},
      ...overrides,
    })
    return { scheduler, delays }
  }

  it('haalt automatisch opnieuw op na het basisinterval', async () => {
    const load = vi.fn(async () => {})
    const { scheduler } = createScheduler(load)
    scheduler.start()
    expect(load).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_BASE_INTERVAL_MS)
    expect(load).toHaveBeenCalledTimes(1)
    scheduler.stop()
  })

  it('laat nooit twee pollingverzoeken tegelijk lopen', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let concurrent = 0
    let maxConcurrent = 0
    const load = vi.fn(async () => {
      concurrent += 1
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await gate
      concurrent -= 1
    })
    const { scheduler } = createScheduler(load)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_BASE_INTERVAL_MS)
    scheduler.refreshNow()
    scheduler.refreshNow()
    await vi.advanceTimersByTimeAsync(0)
    release()
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_BASE_INTERVAL_MS * 2)
    expect(maxConcurrent).toBe(1)
    scheduler.stop()
  })

  it('past back-off toe na fouten en reset na succes', async () => {
    let fail = true
    const load = vi.fn(async () => {
      if (fail) throw new Error('netwerkfout')
    })
    const { scheduler, delays } = createScheduler(load)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_BASE_INTERVAL_MS)
    expect(scheduler.consecutiveFailures).toBe(1)
    expect(delays.at(-1)).toBe(QUEUE_POLL_BASE_INTERVAL_MS * 2)
    fail = false
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_BASE_INTERVAL_MS * 2)
    expect(scheduler.consecutiveFailures).toBe(0)
    expect(delays.at(-1)).toBe(QUEUE_POLL_BASE_INTERVAL_MS)
    scheduler.stop()
  })

  it('pauzeert bij een verborgen tabblad en hervat bij zichtbaarheid', async () => {
    let visible = false
    const subscription: { listener: (() => void) | null } = { listener: null }
    const load = vi.fn(async () => {})
    const { scheduler } = createScheduler(load, {
      isTabVisible: () => visible,
      subscribeVisibility: (next: () => void) => {
        subscription.listener = next
        return () => {
          subscription.listener = null
        }
      },
    })
    scheduler.start()
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_BASE_INTERVAL_MS * 3)
    expect(load).not.toHaveBeenCalled()
    visible = true
    subscription.listener?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(1)
    scheduler.stop()
  })

  it('ruimt op bij ontkoppelen en start geen dubbele timers', async () => {
    const load = vi.fn(async () => {})
    const { scheduler } = createScheduler(load)
    scheduler.start()
    scheduler.start()
    scheduler.stop()
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_BASE_INTERVAL_MS * 5)
    expect(load).not.toHaveBeenCalled()
    expect(scheduler.isRunning).toBe(false)
  })

  it('stopt wanneer het item niet meer actief is', async () => {
    let active = true
    const load = vi.fn(async () => {})
    const { scheduler } = createScheduler(load, { shouldContinue: () => active })
    scheduler.start()
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_BASE_INTERVAL_MS)
    expect(load).toHaveBeenCalledTimes(1)
    active = false
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_MAX_INTERVAL_MS)
    expect(load).toHaveBeenCalledTimes(1)
    expect(scheduler.isRunning).toBe(false)
  })

  it('negeert een oud antwoord niet: sequentiële loads plannen normaal', async () => {
    const seen: string[] = []
    const load = vi.fn(async () => {
      seen.push('load')
    })
    const { scheduler } = createScheduler(load)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_BASE_INTERVAL_MS * 2)
    expect(seen.length).toBeGreaterThanOrEqual(1)
    scheduler.stop()
  })
})

describe('fetchQueueSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedList.mockResolvedValue([{ id: 'entry-1' }] as unknown as Awaited<ReturnType<typeof listCustomerQueueFn>>)
    mockedGet.mockResolvedValue(makeEntry())
    mockedPosition.mockResolvedValue({ position: 1, count: 0, estimatedWaitMinutes: 20 })
  })

  it('ondersteunt ingelogde klanten via de bestaande Server Functions', async () => {
    const snapshot = await fetchQueueSnapshot({ id: 'customer-1', role: 'customer' }, null)
    expect(mockedList).toHaveBeenCalledTimes(1)
    expect(snapshot.entries).toHaveLength(1)
    expect(snapshot.entry?.id).toBe('entry-1')
    expect(snapshot.metadataById['entry-1']).toEqual({ position: 1, count: 0, estimatedWaitMinutes: 20 })
  })

  it('ondersteunt gasten met capability via de bestaande toegangscontrole', async () => {
    ;(globalThis as Record<string, unknown>).window = {}
    try {
      const snapshot = await fetchQueueSnapshot(null, [{ id: 'entry-1', capability: 'cap-1' }])
      expect(mockedGet).toHaveBeenCalledWith({ data: { id: 'entry-1', capability: 'cap-1' } })
      expect(snapshot.entry?.id).toBe('entry-1')
    } finally {
      delete (globalThis as Record<string, unknown>).window
    }
  })

  it('geeft een lege snapshot voor andere rollen', async () => {
    const snapshot = await fetchQueueSnapshot({ id: 'owner-1', role: 'owner' }, null)
    expect(snapshot.entries).toHaveLength(0)
    expect(snapshot.entry).toBeNull()
    expect(mockedList).not.toHaveBeenCalled()
    expect(mockedGet).not.toHaveBeenCalled()
  })
})
