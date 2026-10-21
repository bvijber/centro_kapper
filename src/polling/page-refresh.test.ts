import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PageRefresh, createRequestGuard, isRefreshEqual } from './page-refresh'

/**
 * Tests voor de gedeelde achtergrondverversing van paginadata.
 *
 * De controller is framework-onafhankelijk en wordt hier zonder browser
 * getest: de timers en de visibility-hook worden geïnjecteerd.
 */
const INTERVAL_MS = 12_000

type Snapshot = { entries: Array<{ id: string; status: string }> }

function createHarness(options: {
  load: () => Promise<Snapshot>
  visible?: () => boolean
  subscribeVisibility?: (listener: () => void) => () => void
}) {
  const applied: Snapshot[] = []
  const setLoading = vi.fn()
  const setError = vi.fn()
  const visibilityListeners: Array<() => void> = []
  const refresh = new PageRefresh<Snapshot>({
    load: options.load,
    apply: (data) => applied.push(data),
    setLoading,
    setError,
    errorMessage: () => 'De gegevens konden niet worden geladen.',
    intervalMs: INTERVAL_MS,
    deps: {
      isTabVisible: options.visible ?? (() => true),
      subscribeVisibility: options.subscribeVisibility ?? ((listener) => {
        visibilityListeners.push(listener)
        return () => {
          const index = visibilityListeners.indexOf(listener)
          if (index >= 0) visibilityListeners.splice(index, 1)
        }
      }),
    },
  })
  return { refresh, applied, setLoading, setError, visibilityListeners }
}

describe('createRequestGuard', () => {
  it('markeert alleen de meest recente load als actueel', () => {
    const guard = createRequestGuard()
    const first = guard.start()
    const second = guard.start()
    expect(guard.isCurrent(first)).toBe(false)
    expect(guard.isCurrent(second)).toBe(true)
  })
})

describe('isRefreshEqual', () => {
  it('vergelijkt inhoud en niet objectidentiteit', () => {
    expect(isRefreshEqual({ a: 1 }, { a: 1 })).toBe(true)
    expect(isRefreshEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(isRefreshEqual(null, { a: 1 })).toBe(false)
  })
})

describe('PageRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('haalt automatisch opnieuw op zonder handmatige actie', async () => {
    const load = vi.fn(async () => ({ entries: [{ id: 'a', status: 'waiting' }] }))
    const { refresh, applied } = createHarness({ load })
    refresh.start()

    expect(load).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(INTERVAL_MS)

    expect(load).toHaveBeenCalledTimes(1)
    expect(applied).toEqual([{ entries: [{ id: 'a', status: 'waiting' }] }])
    refresh.stop()
  })

  it('past alleen toe wanneer de geladen inhoud veranderd is', async () => {
    const load = vi.fn(async () => ({ entries: [{ id: 'a', status: 'waiting' }] }))
    const { refresh, applied } = createHarness({ load })
    refresh.start()

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    await vi.advanceTimersByTimeAsync(INTERVAL_MS)

    expect(load).toHaveBeenCalledTimes(2)
    expect(applied).toHaveLength(1)
    refresh.stop()
  })

  it('past nieuwe serverdata toe zodra die beschikbaar is', async () => {
    let status = 'waiting'
    const load = vi.fn(async () => ({ entries: [{ id: 'a', status }] }))
    const { refresh, applied } = createHarness({ load })
    refresh.start()

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    status = 'called'
    await vi.advanceTimersByTimeAsync(INTERVAL_MS)

    expect(applied).toHaveLength(2)
    expect(applied[1]?.entries[0]?.status).toBe('called')
    refresh.stop()
  })

  it('raakt de laad- en foutstatus niet bij een achtergrondverversing', async () => {
    const load = vi.fn(async () => ({ entries: [] }))
    const { refresh, setLoading, setError } = createHarness({ load })
    refresh.start()

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)

    expect(setLoading).not.toHaveBeenCalled()
    expect(setError).not.toHaveBeenCalled()
    refresh.stop()
  })

  it('zet de laadstatus aan en uit bij een interactieve lading', async () => {
    const load = vi.fn(async () => ({ entries: [] }))
    const { refresh, setLoading, setError } = createHarness({ load })

    await refresh.loadInteractive()

    expect(setLoading).toHaveBeenCalledWith(true)
    expect(setLoading).toHaveBeenCalledWith(false)
    expect(setError).not.toHaveBeenCalled()
  })

  it('toont een publieke foutmelding bij een interactieve lading', async () => {
    const load = vi.fn(async () => {
      throw new Error('databasefout')
    })
    const { refresh, setError } = createHarness({ load })

    await expect(refresh.loadInteractive()).resolves.toBeUndefined()
    expect(setError).toHaveBeenCalledWith('De gegevens konden niet worden geladen.')
  })

  it('laat een oudere response geen nieuwere state overschrijven', async () => {
    const resolvers: Array<(value: Snapshot) => void> = []
    const load = vi.fn(() => new Promise<Snapshot>((resolve) => { resolvers.push(resolve) }))
    const { refresh, applied } = createHarness({ load })

    const first = refresh.loadData()
    const second = refresh.loadData()
    resolvers[1]?.({ entries: [{ id: 'nieuw', status: 'called' }] })
    resolvers[0]?.({ entries: [{ id: 'oud', status: 'waiting' }] })
    await Promise.all([first, second])

    expect(applied).toEqual([{ entries: [{ id: 'nieuw', status: 'called' }] }])
  })

  it('laat nooit twee ververste tegelijk lopen', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let concurrent = 0
    let maxConcurrent = 0
    const load = vi.fn(async () => {
      concurrent += 1
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await gate
      concurrent -= 1
      return { entries: [] }
    })
    const { refresh } = createHarness({ load })
    refresh.start()

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    refresh.refreshNow()
    refresh.refreshNow()
    await vi.advanceTimersByTimeAsync(0)
    release()
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2)

    expect(maxConcurrent).toBe(1)
    refresh.stop()
  })

  it('ververst direct bij terugkeer naar een zichtbaar tabblad', async () => {
    let visible = false
    const load = vi.fn(async () => ({ entries: [] }))
    const { refresh, visibilityListeners } = createHarness({ load, visible: () => visible })
    refresh.start()

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3)
    expect(load).not.toHaveBeenCalled()

    visible = true
    visibilityListeners[0]?.()
    await vi.advanceTimersByTimeAsync(0)

    expect(load).toHaveBeenCalledTimes(1)
    refresh.stop()
  })

  it('stopt met verversen zodra de pagina niet meer relevant is', async () => {
    let active = true
    const load = vi.fn(async () => ({ entries: [] }))
    const refresh = new PageRefresh<Snapshot>({
      load,
      apply: () => {},
      intervalMs: INTERVAL_MS,
      shouldContinue: () => active,
    })
    refresh.start()

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    expect(load).toHaveBeenCalledTimes(1)

    active = false
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3)
    expect(load).toHaveBeenCalledTimes(1)
    expect(refresh.isRunning).toBe(false)
  })

  it('stopt met verversen bij het unmounten van de pagina', async () => {
    const load = vi.fn(async () => ({ entries: [] }))
    const { refresh } = createHarness({ load })
    refresh.start()

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    expect(load).toHaveBeenCalledTimes(1)

    refresh.stop()
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 5)

    expect(load).toHaveBeenCalledTimes(1)
    expect(refresh.isRunning).toBe(false)
  })

  it('laat de inhoud onveranderd bij een mislukte achtergrondverversing', async () => {
    let fail = true
    const load = vi.fn(async () => {
      if (fail) throw new Error('netwerkfout')
      return { entries: [{ id: 'a', status: 'waiting' }] }
    })
    const { refresh, applied, setError } = createHarness({ load })
    refresh.start()

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    expect(applied).toHaveLength(0)
    expect(setError).not.toHaveBeenCalled()

    fail = false
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 4)
    expect(applied).toHaveLength(1)
    refresh.stop()
  })
})
