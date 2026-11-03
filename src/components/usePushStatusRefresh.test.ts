import { describe, expect, it, vi } from 'vitest'

import {
  createPushStatusRunner,
  subscribeToPushStatusRefresh,
  type VisibilityEventTarget,
} from './usePushStatusRefresh'

function eventTarget(): VisibilityEventTarget & { listeners: Record<string, Array<() => void>> } {
  const listeners: Record<string, Array<() => void>> = {}
  return {
    visibilityState: 'visible',
    listeners,
    addEventListener(type, listener) {
      ;(listeners[type] ??= []).push(listener)
    },
    removeEventListener(type, listener) {
      listeners[type] = (listeners[type] ?? []).filter((entry) => entry !== listener)
    },
  }
}

function emit(target: VisibilityEventTarget & { listeners: Record<string, Array<() => void>> }, type: string) {
  for (const listener of target.listeners[type] ?? []) listener()
}

describe('push status refresh lifecycle', () => {
  it('hercontroleert bij een zichtbare pagina via visibilitychange', () => {
    const refresh = vi.fn()
    const document = eventTarget()
    subscribeToPushStatusRefresh(refresh, { document, window: eventTarget() })

    emit(document, 'visibilitychange')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('hercontroleert niet bij een verborgen pagina', () => {
    const refresh = vi.fn()
    const document = eventTarget()
    document.visibilityState = 'hidden'
    subscribeToPushStatusRefresh(refresh, { document, window: eventTarget() })

    emit(document, 'visibilitychange')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('hercontroleert bij pageshow', () => {
    const refresh = vi.fn()
    const windowTarget = eventTarget()
    subscribeToPushStatusRefresh(refresh, { document: eventTarget(), window: windowTarget })

    emit(windowTarget, 'pageshow')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('verwijdert listeners bij dispose', () => {
    const refresh = vi.fn()
    const document = eventTarget()
    const windowTarget = eventTarget()
    const dispose = subscribeToPushStatusRefresh(refresh, { document, window: windowTarget })
    dispose()

    emit(document, 'visibilitychange')
    emit(windowTarget, 'pageshow')
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('push status runner', () => {
  it('laat geen parallelle controles toe bij dubbele events', async () => {
    let resolve: () => void = () => {}
    const refresh = vi.fn(() => new Promise<void>((res) => { resolve = res }))
    const run = createPushStatusRunner(refresh)

    run('refresh')
    run('refresh')
    expect(refresh).toHaveBeenCalledTimes(1)

    resolve()
    await new Promise((done) => setTimeout(done, 0))
    run('refresh')
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('zet de guard terug wanneer een refresh mislukt', async () => {
    const refresh = vi.fn()
      .mockRejectedValueOnce(new Error('failure'))
      .mockResolvedValueOnce(undefined)
    const run = createPushStatusRunner(refresh)

    run('refresh')
    await new Promise((done) => setTimeout(done, 0))
    run('refresh')

    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('haalt een after-action-refresh in na een lopende controle', async () => {
    let resolveFirst: () => void = () => {}
    const calls: string[] = []
    const refresh = vi.fn((mode: string) => {
      calls.push(mode)
      if (calls.length === 1) return new Promise<void>((resolve) => { resolveFirst = resolve })
      return Promise.resolve()
    })
    const run = createPushStatusRunner(refresh)

    run('refresh')
    run('after-action')
    expect(calls).toEqual(['refresh'])

    resolveFirst()
    await new Promise((done) => setTimeout(done, 0))
    expect(calls).toEqual(['refresh', 'after-action'])
  })

  it('voert meerdere wachtende after-action-aanvragen maar één keer uit', async () => {
    let resolveFirst: () => void = () => {}
    const calls: string[] = []
    const refresh = vi.fn((mode: string) => {
      calls.push(mode)
      if (calls.length === 1) return new Promise<void>((resolve) => { resolveFirst = resolve })
      return Promise.resolve()
    })
    const run = createPushStatusRunner(refresh)

    run('refresh')
    run('after-action')
    run('after-action')

    resolveFirst()
    await new Promise((done) => setTimeout(done, 0))
    expect(calls).toEqual(['refresh', 'after-action'])
  })
})
