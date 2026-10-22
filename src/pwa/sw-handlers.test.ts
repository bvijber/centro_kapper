import { beforeEach, describe, expect, it, vi } from 'vitest'

const APP_ORIGIN = 'https://kapper.test'
const FIXED_TITLE = 'Centro Kapper'
const FIXED_BODY = 'Je bent aan de beurt. Open de app voor meer informatie.'

type AnyFn = (...args: any[]) => any

const handlers: Record<string, AnyFn> = {}
const showNotification = vi.fn()
const openWindow = vi.fn()
let windowClients: Array<{ url: string; focus: AnyFn }> = []
let pendingWaitUntil: Promise<unknown> | undefined

function pushEvent(payload: unknown, options: { malformed?: boolean; noData?: boolean } = {}) {
  return {
    data: options.noData
      ? undefined
      : {
          json: () => {
            if (options.malformed) throw new Error('ongeldige payload')
            return payload
          },
        },
    waitUntil: (work: unknown) => {
      pendingWaitUntil = Promise.resolve(work)
    },
  }
}

function clickEvent() {
  return {
    notification: { close: vi.fn() },
    waitUntil: (work: unknown) => {
      pendingWaitUntil = Promise.resolve(work)
    },
  }
}

;(globalThis as any).self = {
  addEventListener: (type: string, fn: AnyFn) => {
    handlers[type] = fn
  },
  registration: { showNotification },
  clients: {
    matchAll: async () => windowClients,
    openWindow,
  },
  location: { origin: APP_ORIGIN },
}

// @ts-ignore - public/sw.js is bewust plain JS buiten de TS-bronstructuur
await import('../../public/sw.js')

beforeEach(() => {
  vi.clearAllMocks()
  windowClients = []
  pendingWaitUntil = undefined
})

describe('service worker push', () => {
  it('toont de vaste tekst met de server-tag', async () => {
    handlers.push(pushEvent({ tag: 'abc-123' }))
    await pendingWaitUntil
    expect(showNotification).toHaveBeenCalledTimes(1)
    expect(showNotification).toHaveBeenCalledWith(
      FIXED_TITLE,
      expect.objectContaining({ body: FIXED_BODY, tag: expect.stringContaining('abc-123') }),
    )
  })

  it('negeert onbetrouwbare payloadvelden voor titel, bericht en bestemming', async () => {
    handlers.push(
      pushEvent({ tag: 'ok-1', title: 'KWAAD', body: 'KWAAD', url: 'https://evil.test/steel' }),
    )
    await pendingWaitUntil
    const [title, options] = showNotification.mock.calls[0] as [string, Record<string, unknown>]
    expect(title).toBe(FIXED_TITLE)
    expect(options.body).toBe(FIXED_BODY)
    expect(JSON.stringify(options)).not.toContain('evil.test')
    expect(JSON.stringify(options)).not.toContain('KWAAD')
  })

  it('valt terug op een vaste tag bij ontbrekende of ongeldige payload', async () => {
    handlers.push(pushEvent(undefined, { noData: true }))
    await pendingWaitUntil
    expect(showNotification).toHaveBeenCalledWith(
      FIXED_TITLE,
      expect.objectContaining({ body: FIXED_BODY, tag: expect.any(String) }),
    )

    vi.clearAllMocks()
    handlers.push(pushEvent({ tag: '../../evil' }))
    await pendingWaitUntil
    const [, options] = showNotification.mock.calls[0] as [string, Record<string, unknown>]
    expect(String(options.tag)).not.toContain('..')

    vi.clearAllMocks()
    handlers.push(pushEvent({ tag: 'x' }, { malformed: true }))
    await pendingWaitUntil
    expect(showNotification).toHaveBeenCalledWith(
      FIXED_TITLE,
      expect.objectContaining({ body: FIXED_BODY }),
    )
  })
})

describe('service worker notificationclick', () => {
  it('focust een bestaande client op /queue en opent niets nieuws', async () => {
    const focus = vi.fn(async () => undefined)
    windowClients = [{ url: `${APP_ORIGIN}/queue`, focus }]
    const event = clickEvent()

    handlers.notificationclick(event)
    await pendingWaitUntil

    expect(focus).toHaveBeenCalledTimes(1)
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('opent uitsluitend same-origin /queue wanneer geen geschikte client bestaat', async () => {
    const focus = vi.fn(async () => undefined)
    windowClients = [{ url: 'https://evil.test/queue', focus }]
    const event = clickEvent()

    handlers.notificationclick(event)
    await pendingWaitUntil

    expect(focus).not.toHaveBeenCalled()
    expect(openWindow).toHaveBeenCalledTimes(1)
    expect(openWindow).toHaveBeenCalledWith(`${APP_ORIGIN}/queue`)
  })

  it('slaat onleesbare client-URL’s over en opent /queue', async () => {
    const focus = vi.fn(async () => undefined)
    windowClients = [{ url: ':::geen-url:::', focus }]
    const event = clickEvent()

    handlers.notificationclick(event)
    await pendingWaitUntil

    expect(openWindow).toHaveBeenCalledWith(`${APP_ORIGIN}/queue`)
  })
})

describe('service worker zonder caching', () => {
  it('onderschept geen fetches en opent geen caches', () => {
    expect(typeof handlers.fetch).toBe('function')
    const respondWith = vi.fn()
    const waitUntil = vi.fn()
    expect(handlers.fetch({ respondWith, waitUntil })).toBeUndefined()
    expect(respondWith).not.toHaveBeenCalled()
    expect(waitUntil).not.toHaveBeenCalled()
  })

  it('heeft install- en activate-handlers zonder overname', () => {
    expect(typeof handlers.install).toBe('function')
    expect(typeof handlers.activate).toBe('function')
    expect(handlers.install({})).toBeUndefined()
    expect(handlers.activate({})).toBeUndefined()
  })
})

describe('service worker eigenaarpush', () => {
  it('toont de vaste eigenaartekst met de eigenaartag en bestemming /owner', async () => {
    handlers.push(pushEvent({ tag: 'owner-queue_joined-0123456789abcdef', kind: 'queue_joined' }))
    await pendingWaitUntil
    expect(showNotification).toHaveBeenCalledTimes(1)
    const [title, options] = showNotification.mock.calls[0] as [string, Record<string, unknown>]
    expect(title).toBe(FIXED_TITLE)
    expect(options.body).toBe('Iemand is toegevoegd aan de wachtrij.')
    expect(String(options.tag)).toContain('owner-queue_joined-0123456789abcdef')
    expect(options.data).toEqual({ url: '/owner' })
  })

  it('behandelt elke eigenaargebeurtenis met een eigen vaste tekst', async () => {
    for (const [kind, body] of [
      ['queue_left', 'Iemand heeft de wachtrij verlaten.'],
      ['appointment_booked', 'Er is een nieuwe afspraak geboekt.'],
      ['appointment_cancelled', 'Er is een afspraak geannuleerd.'],
    ] as const) {
      vi.clearAllMocks()
      handlers.push(pushEvent({ tag: `owner-${kind}-0123456789abcdef`, kind }))
      await pendingWaitUntil
      const [, options] = showNotification.mock.calls[0] as [string, Record<string, unknown>]
      expect(options.body).toBe(body)
    }
  })

  it('negeert een onbekende kind en blijft dan een klantmelding', async () => {
    handlers.push(pushEvent({ tag: 'owner-onbekend-0123456789abcdef', kind: 'onbekend' }))
    await pendingWaitUntil
    const [, options] = showNotification.mock.calls[0] as [string, Record<string, unknown>]
    expect(options.body).toBe(FIXED_BODY)
    expect(options.data).toEqual({ url: '/queue' })
  })

  it('opent /owner bij een klik op een eigenaarmelding', async () => {
    const focus = vi.fn(async () => undefined)
    windowClients = [{ url: `${APP_ORIGIN}/owner`, focus }]
    const event = {
      notification: { close: vi.fn(), data: { url: '/owner' } },
      waitUntil: (work: unknown) => {
        pendingWaitUntil = Promise.resolve(work)
      },
    }

    handlers.notificationclick(event)
    await pendingWaitUntil

    expect(focus).toHaveBeenCalledTimes(1)
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('opent uitsluitend same-origin /owner wanneer geen geschikte client bestaat', async () => {
    windowClients = [{ url: 'https://evil.test/owner', focus: vi.fn(async () => undefined) }]
    const event = {
      notification: { close: vi.fn(), data: { url: '/owner' } },
      waitUntil: (work: unknown) => {
        pendingWaitUntil = Promise.resolve(work)
      },
    }

    handlers.notificationclick(event)
    await pendingWaitUntil

    expect(openWindow).toHaveBeenCalledTimes(1)
    expect(openWindow).toHaveBeenCalledWith(`${APP_ORIGIN}/owner`)
  })
})
