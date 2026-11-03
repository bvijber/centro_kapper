import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registerServiceWorker } from './register-sw'
import {
  classifyApplicationServerKey,
  getCurrentEndpoint,
  getPushBrowserSnapshot,
  getPushBrowserState,
  getPushPermission,
  isPushSupported,
  preparePushServiceWorker,
  PUSH_KEY_MISMATCH_MESSAGE,
  requestPermissionAndSubscribe,
  requestPushPermission,
  subscribePreparedPush,
  unsubscribeBrowserSubscription,
  urlBase64ToUint8Array,
} from './push-client'
import type { PreparedPushSubscription } from './push-client'

vi.mock('./register-sw', () => ({
  registerServiceWorker: vi.fn(async () => null),
}))

const PUBLIC_KEY = 'BL7ELU24fJTAlH5Kyl8N6BDCac8u8li_U5PIwG963MOvdYs9s7LSzj8x_7v7RFdLZ9Eap50PiiyF5K0TDAis7t0'

function decodePublicKey(value = PUBLIC_KEY): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  return new Uint8Array(Buffer.from(normalized, 'base64'))
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function publicKeyBuffer(value = PUBLIC_KEY): ArrayBuffer {
  return asArrayBuffer(decodePublicKey(value))
}

function changedPublicKeyBuffer(): ArrayBuffer {
  const bytes = decodePublicKey()
  bytes[0] = (bytes[0] ?? 0) ^ 0xff
  return asArrayBuffer(bytes)
}

function browserSubscription(endpoint: string) {
  const unsubscribe = vi.fn(async () => true)
  return {
    subscription: {
      endpoint,
      toJSON: () => ({
        endpoint,
        keys: { p256dh: 'cDE1', auth: 'YXV0aA' },
      }),
      unsubscribe,
    },
    unsubscribe,
  }
}

type WindowStub = {
  PushManager?: unknown
  Notification?: { permission: string; requestPermission?: () => Promise<string> }
  atob?: (value: string) => string
  navigator?: { serviceWorker?: unknown }
}

let originalWindow: unknown

function stubBrowser(stub: WindowStub & { navigator: object }): void {
  Object.defineProperty(globalThis, 'window', { value: stub, writable: true, configurable: true })
  Object.defineProperty(globalThis, 'navigator', {
    value: stub.navigator,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'Notification', {
    value: stub.Notification,
    writable: true,
    configurable: true,
  })
}

beforeEach(() => {
  originalWindow = (globalThis as Record<string, unknown>).window
  vi.mocked(registerServiceWorker).mockClear()
})

afterEach(() => {
  const globals = globalThis as Record<string, unknown>
  if (originalWindow === undefined) delete globals.window
  else globals.window = originalWindow
  delete globals.navigator
  delete globals.Notification
  vi.restoreAllMocks()
})

describe('push client helpers', () => {
  it('converts url-safe base64 to bytes', () => {
    ;(globalThis as Record<string, unknown>).window = {
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
    }
    try {
      expect(Array.from(urlBase64ToUint8Array('SGVsbG8'))).toEqual([72, 101, 108, 108, 111])
    } finally {
      delete (globalThis as Record<string, unknown>).window
    }
  })

  it('vraagt nooit automatisch toestemming bij importeren of status opvragen', () => {
    const requestPermission = vi.fn(async () => 'granted')
    stubBrowser({
      PushManager: function PushManager() {},
      Notification: { permission: 'default', requestPermission },
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      navigator: {},
    })

    expect(isPushSupported()).toBe(false)
    expect(getPushPermission()).toBe('unsupported')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('weigert zonder te subscriben wanneer toestemming is geweigerd', async () => {
    const subscribe = vi.fn()
    stubBrowser({
      PushManager: function PushManager() {},
      Notification: { permission: 'denied', requestPermission: vi.fn(async () => 'denied') },
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      navigator: { serviceWorker: { ready: Promise.resolve({ pushManager: { subscribe, getSubscription: async () => null } }) } },
    })

    await expect(requestPermissionAndSubscribe(PUBLIC_KEY)).rejects.toThrow()
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('vraagt toestemming synchroon aan vanuit de gebruikersactie', async () => {
    const requestPermission = vi.fn(async () => 'granted')
    stubBrowser({
      PushManager: function PushManager() {},
      Notification: { permission: 'default', requestPermission },
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      navigator: { serviceWorker: {} },
    })

    const permission = requestPushPermission()

    expect(requestPermission).toHaveBeenCalledTimes(1)
    await expect(permission).resolves.toBe('granted')
  })

  it('vraagt geen toestemming opnieuw wanneer die al is gegeven of geweigerd', async () => {
    const requestPermission = vi.fn(async () => 'default')
    const browser = {
      PushManager: function PushManager() {},
      Notification: { permission: 'granted', requestPermission },
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      navigator: { serviceWorker: {} },
    }
    stubBrowser(browser)

    await expect(requestPushPermission()).resolves.toBe('granted')
    expect(requestPermission).not.toHaveBeenCalled()

    stubBrowser({ ...browser, Notification: { permission: 'denied', requestPermission } })
    await expect(requestPushPermission()).resolves.toBe('denied')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('bereidt een actieve Service Worker-registratie voor zonder toestemming te vragen', async () => {
    const registered = { scope: '/' } as unknown as ServiceWorkerRegistration
    const readyRegistration = { scope: '/' } as unknown as ServiceWorkerRegistration
    vi.mocked(registerServiceWorker).mockResolvedValueOnce(registered)
    stubBrowser({
      PushManager: function PushManager() {},
      Notification: { permission: 'default', requestPermission: vi.fn(async () => 'granted') },
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      navigator: {
        serviceWorker: {
          ready: Promise.resolve(readyRegistration),
          getRegistration: vi.fn(async () => undefined),
        },
      },
    })

    await expect(preparePushServiceWorker()).resolves.toBe(readyRegistration)
    expect(registerServiceWorker).toHaveBeenCalledTimes(1)
  })

  it('meldt een mislukte Service Worker-voorbereiding zonder op ready te wachten', async () => {
    vi.mocked(registerServiceWorker).mockResolvedValueOnce(null)
    stubBrowser({
      PushManager: function PushManager() {},
      Notification: { permission: 'default', requestPermission: vi.fn(async () => 'granted') },
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      navigator: {
        serviceWorker: {
          ready: new Promise<never>(() => {}),
          getRegistration: vi.fn(async () => undefined),
        },
      },
    })

    await expect(preparePushServiceWorker()).rejects.toThrow('Push is momenteel niet beschikbaar')
  })

  it('gebruikt de voorbereide registratie en VAPID-key zonder opnieuw op ready te wachten', async () => {
    const subscribe = vi.fn(async () => ({
      toJSON: () => ({ endpoint: 'https://push.example.test/prepared', keys: { p256dh: 'cDE1', auth: 'YXV0aA' } }),
      unsubscribe: async () => true,
    }))
    const prepared = {
      publicKey: PUBLIC_KEY,
      registration: {
        pushManager: { subscribe, getSubscription: vi.fn(async () => null) },
      } as unknown as ServiceWorkerRegistration,
    }
    stubBrowser({
      PushManager: function PushManager() {},
      Notification: { permission: 'granted' },
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      navigator: { serviceWorker: { ready: new Promise<never>(() => {}) } },
    })

    await expect(subscribePreparedPush(prepared)).resolves.toMatchObject({
      endpoint: 'https://push.example.test/prepared',
      p256dh: 'cDE1',
      auth: 'YXV0aA',
    })
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array),
    })
  })

  it('abonneert pas na expliciete toestemming met de publieke sleutel', async () => {
    const requestPermission = vi.fn(async () => 'granted')
    const subscribe = vi.fn(async () => ({
      toJSON: () => ({ endpoint: 'https://push.example.test/e1', keys: { p256dh: 'cDE1', auth: 'YXV0aA' } }),
      unsubscribe: async () => true,
    }))
    stubBrowser({
      PushManager: function PushManager() {},
      Notification: { permission: 'default', requestPermission },
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      navigator: { serviceWorker: { ready: Promise.resolve({ pushManager: { subscribe, getSubscription: async () => null } }) } },
    })

    const result = await requestPermissionAndSubscribe(PUBLIC_KEY)
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) })
    expect(result.endpoint).toBe('https://push.example.test/e1')
    expect(result.p256dh).toBe('cDE1')
  })

  it('leest het huidige endpoint of meldt afwezigheid zonder te gooien', async () => {
    stubBrowser({
      PushManager: function PushManager() {},
      Notification: { permission: 'granted' },
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      navigator: { serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: async () => ({ endpoint: 'https://push.example.test/e9', unsubscribe: async () => true }) } }) } },
    })
    await expect(getCurrentEndpoint()).resolves.toBe('https://push.example.test/e9')
    await expect(unsubscribeBrowserSubscription()).resolves.toBe(true)
  })
})

describe('application server key classification', () => {
  function stubKeyBrowser(): void {
    stubBrowser({
      PushManager: function PushManager() {},
      Notification: { permission: 'granted' },
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      navigator: {},
    })
  }

  beforeEach(() => {
    stubKeyBrowser()
  })

  it('classificeert exact gelijke keybytes als match', () => {
    const subscription = {
      options: { applicationServerKey: publicKeyBuffer() },
    } as unknown as Pick<PushSubscription, 'options'>

    expect(classifyApplicationServerKey(subscription, PUBLIC_KEY)).toBe('match')
  })

  it('classificeert afwijkende keybytes als mismatch', () => {
    const subscription = {
      options: { applicationServerKey: changedPublicKeyBuffer() },
    } as unknown as Pick<PushSubscription, 'options'>

    expect(classifyApplicationServerKey(subscription, PUBLIC_KEY)).toBe('mismatch')
  })

  it('classificeert een null-key als mismatch wanneer een publieke key wordt verwacht', () => {
    const subscription = {
      options: { applicationServerKey: null },
    } as unknown as Pick<PushSubscription, 'options'>

    expect(classifyApplicationServerKey(subscription, PUBLIC_KEY)).toBe('mismatch')
  })

  it('classificeert een ontbrekende applicationServerKey-property als unknown', () => {
    const subscription = {
      options: {},
    } as unknown as Pick<PushSubscription, 'options'>

    expect(classifyApplicationServerKey(subscription, PUBLIC_KEY)).toBe('unknown')
  })
})

describe('prepared push subscription reuse', () => {
  const ENDPOINT = 'https://push.example.test/existing'

  function stubPushBrowser(): void {
    stubBrowser({
      PushManager: function PushManager() {},
      Notification: { permission: 'granted' },
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      navigator: { serviceWorker: {} },
    })
  }

  function preparedWith(pushManager: object): PreparedPushSubscription {
    return {
      publicKey: PUBLIC_KEY,
      registration: { pushManager } as unknown as ServiceWorkerRegistration,
    }
  }

  it('roept subscribe aan en behoudt het endpoint bij een bestaande subscription met dezelfde key', async () => {
    stubPushBrowser()
    const unsubscribe = vi.fn(async () => true)
    const existing = {
      endpoint: ENDPOINT,
      options: { applicationServerKey: publicKeyBuffer() },
      unsubscribe,
    } as unknown as PushSubscription
    const subscribe = vi.fn(async () => browserSubscription(ENDPOINT).subscription)
    const getSubscription = vi.fn(async () => existing)

    await expect(subscribePreparedPush(preparedWith({ subscribe, getSubscription }))).resolves.toMatchObject({
      endpoint: ENDPOINT,
    })
    expect(getSubscription).toHaveBeenCalledTimes(1)
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('stopt zonder subscribe of unsubscribe bij een afwijkende key', async () => {
    stubPushBrowser()
    const unsubscribe = vi.fn(async () => true)
    const existing = {
      endpoint: ENDPOINT,
      options: { applicationServerKey: changedPublicKeyBuffer() },
      unsubscribe,
    } as unknown as PushSubscription
    const subscribe = vi.fn()
    const getSubscription = vi.fn(async () => existing)

    await expect(subscribePreparedPush(preparedWith({ subscribe, getSubscription })))
      .rejects.toThrow(PUSH_KEY_MISMATCH_MESSAGE)
    expect(subscribe).not.toHaveBeenCalled()
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('vertaalt InvalidStateError naar een keyconflict wanneer de tweede controle een mismatch ziet', async () => {
    stubPushBrowser()
    const unsubscribe = vi.fn(async () => true)
    const existing = {
      endpoint: ENDPOINT,
      options: { applicationServerKey: changedPublicKeyBuffer() },
      unsubscribe,
    } as unknown as PushSubscription
    const invalidState = Object.assign(new Error('invalid state'), { name: 'InvalidStateError' })
    const subscribe = vi.fn(async () => {
      throw invalidState
    })
    const getSubscription = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing)

    await expect(subscribePreparedPush(preparedWith({ subscribe, getSubscription })))
      .rejects.toThrow(PUSH_KEY_MISMATCH_MESSAGE)
    expect(getSubscription).toHaveBeenCalledTimes(2)
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('geeft de oorspronkelijke subscribe-fout door wanneer de tweede getSubscription mislukt', async () => {
    stubPushBrowser()
    const originalError = Object.assign(new Error('subscribe failure'), { name: 'InvalidStateError' })
    const subscribe = vi.fn(async () => {
      throw originalError
    })
    const getSubscription = vi.fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('read failure'))

    await expect(subscribePreparedPush(preparedWith({ subscribe, getSubscription })))
      .rejects.toBe(originalError)
    expect(getSubscription).toHaveBeenCalledTimes(2)
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it('gaat verder met subscribe zonder cleanup wanneer getSubscription mislukt', async () => {
    stubPushBrowser()
    const subscribe = vi.fn(async () => browserSubscription(ENDPOINT).subscription)
    const getSubscription = vi.fn(async () => {
      throw new Error('read failure')
    })

    await expect(subscribePreparedPush(preparedWith({ subscribe, getSubscription }))).resolves.toMatchObject({
      endpoint: ENDPOINT,
    })
    expect(getSubscription).toHaveBeenCalledTimes(1)
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it('maakt een normale nieuwe subscription wanneer er niets bestaat', async () => {
    stubPushBrowser()
    const subscribe = vi.fn(async () => browserSubscription(ENDPOINT).subscription)
    const getSubscription = vi.fn(async () => null)

    await expect(subscribePreparedPush(preparedWith({ subscribe, getSubscription }))).resolves.toMatchObject({
      endpoint: ENDPOINT,
    })
    expect(getSubscription).toHaveBeenCalledTimes(1)
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it('beëindigt een hangende getSubscription en gaat daarna verder met subscribe', async () => {
    vi.useFakeTimers()
    try {
      stubPushBrowser()
      const subscribe = vi.fn(async () => browserSubscription(ENDPOINT).subscription)
      const getSubscription = vi.fn(() => new Promise<PushSubscription | null>(() => {}))

      const assertion = expect(subscribePreparedPush(preparedWith({ subscribe, getSubscription })))
        .resolves.toMatchObject({ endpoint: ENDPOINT })
      await vi.advanceTimersByTimeAsync(10_000)
      await assertion
      expect(subscribe).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('beëindigt een hangende subscribe met de bestaande time-outfout', async () => {
    vi.useFakeTimers()
    try {
      stubPushBrowser()
      const subscribe = vi.fn(() => new Promise<PushSubscription>(() => {}))
      const getSubscription = vi.fn(async () => null)

      const assertion = expect(subscribePreparedPush(preparedWith({ subscribe, getSubscription })))
        .rejects.toThrow('Push is momenteel niet beschikbaar')
      await vi.advanceTimersByTimeAsync(10_000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('push browser state', () => {
  function activeRegistration(subscription: { endpoint: string } | null) {
    return {
      active: {},
      pushManager: {
        getSubscription: vi.fn(async () => subscription),
      },
    }
  }

  function stubStateBrowser(serviceWorker: object): void {
    stubBrowser({
      PushManager: function PushManager() {},
      Notification: { permission: 'granted' },
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      navigator: { serviceWorker },
    })
  }

  it('wacht niet op ready wanneer er geen registratie bestaat', async () => {
    stubStateBrowser({
      getRegistration: vi.fn(async () => undefined),
      ready: new Promise<never>(() => {}),
    })

    await expect(getPushBrowserState()).resolves.toEqual({
      status: 'no-registration',
      endpoint: null,
    })
    expect(registerServiceWorker).toHaveBeenCalledTimes(1)
  })

  it('herkent een registratie die nog niet actief is zonder te wachten', async () => {
    stubStateBrowser({
      getRegistration: vi.fn(async () => ({ active: null })),
      ready: new Promise<never>(() => {}),
    })

    await expect(getPushBrowserState()).resolves.toEqual({
      status: 'registration-pending',
      endpoint: null,
    })
    expect(registerServiceWorker).not.toHaveBeenCalled()
  })

  it('behandelt een actieve registratie zonder subscription als niet gekoppeld', async () => {
    stubStateBrowser({
      getRegistration: vi.fn(async () => activeRegistration(null)),
    })

    await expect(getPushBrowserState()).resolves.toEqual({
      status: 'no-subscription',
      endpoint: null,
    })
    expect(registerServiceWorker).not.toHaveBeenCalled()
  })

  it('herkent een actieve registratie met subscription', async () => {
    stubStateBrowser({
      getRegistration: vi.fn(async () =>
        activeRegistration({ endpoint: 'https://push.example.test/e2' }),
      ),
    })

    await expect(getPushBrowserState()).resolves.toEqual({
      status: 'subscribed',
      endpoint: 'https://push.example.test/e2',
    })
    expect(registerServiceWorker).not.toHaveBeenCalled()
  })
})

describe('push browser snapshot', () => {
  function stubSnapshotBrowser(serviceWorker: object): void {
    stubBrowser({
      PushManager: function PushManager() {},
      Notification: { permission: 'granted' },
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      navigator: { serviceWorker },
    })
  }

  function registrationWith(subscription: PushSubscription | null): object {
    return {
      active: {},
      pushManager: { getSubscription: vi.fn(async () => subscription) },
    }
  }

  function snapshotSubscription(options: object, over: Partial<PushSubscription> = {}): PushSubscription {
    return {
      endpoint: 'https://push.example.test/snapshot',
      options,
      expirationTime: null,
      ...over,
    } as unknown as PushSubscription
  }

  it('classificeert een lokale subscription met gelijke key als match', async () => {
    const sub = snapshotSubscription({ applicationServerKey: publicKeyBuffer() })
    stubSnapshotBrowser({ getRegistration: vi.fn(async () => registrationWith(sub)) })

    await expect(getPushBrowserSnapshot(PUBLIC_KEY)).resolves.toEqual({
      status: 'subscribed',
      endpoint: 'https://push.example.test/snapshot',
      keyState: 'match',
      expired: false,
    })
  })

  it('classificeert een lokale subscription met afwijkende key als mismatch', async () => {
    const sub = snapshotSubscription({ applicationServerKey: changedPublicKeyBuffer() })
    stubSnapshotBrowser({ getRegistration: vi.fn(async () => registrationWith(sub)) })

    await expect(getPushBrowserSnapshot(PUBLIC_KEY)).resolves.toMatchObject({
      status: 'subscribed',
      keyState: 'mismatch',
    })
  })

  it('classificeert een ontbrekende key als unknown', async () => {
    const sub = snapshotSubscription({})
    stubSnapshotBrowser({ getRegistration: vi.fn(async () => registrationWith(sub)) })

    await expect(getPushBrowserSnapshot(PUBLIC_KEY)).resolves.toMatchObject({
      status: 'subscribed',
      keyState: 'unknown',
    })
  })

  it('meldt een ontbrekende subscription als no-subscription', async () => {
    stubSnapshotBrowser({ getRegistration: vi.fn(async () => registrationWith(null)) })

    await expect(getPushBrowserSnapshot(PUBLIC_KEY)).resolves.toEqual({
      status: 'no-subscription',
      endpoint: null,
    })
  })

  it('meldt een mislukte getSubscription als unknown en nooit als no-subscription', async () => {
    const registration = {
      active: {},
      pushManager: { getSubscription: vi.fn(async () => { throw new Error('read failure') }) },
    }
    stubSnapshotBrowser({ getRegistration: vi.fn(async () => registration) })

    await expect(getPushBrowserSnapshot(PUBLIC_KEY)).resolves.toMatchObject({
      status: 'unknown',
      endpoint: null,
    })
  })

  it('meldt een ontbrekende registratie als no-registration en start de registratie', async () => {
    stubSnapshotBrowser({ getRegistration: vi.fn(async () => undefined) })

    await expect(getPushBrowserSnapshot(PUBLIC_KEY)).resolves.toEqual({
      status: 'no-registration',
      endpoint: null,
    })
    expect(registerServiceWorker).toHaveBeenCalledTimes(1)
  })

  it('meldt een registratie die nog niet actief is als registration-pending', async () => {
    stubSnapshotBrowser({ getRegistration: vi.fn(async () => ({ active: null })) })

    await expect(getPushBrowserSnapshot(PUBLIC_KEY)).resolves.toEqual({
      status: 'registration-pending',
      endpoint: null,
    })
  })

  it('markeert een verlopen subscription als expired', async () => {
    const sub = snapshotSubscription(
      { applicationServerKey: publicKeyBuffer() },
      { expirationTime: Date.now() - 1000 },
    )
    stubSnapshotBrowser({ getRegistration: vi.fn(async () => registrationWith(sub)) })

    await expect(getPushBrowserSnapshot(PUBLIC_KEY)).resolves.toMatchObject({
      status: 'subscribed',
      expired: true,
    })
  })

  it('voert bij een keyconflict nooit automatisch unsubscribe uit', async () => {
    const unsubscribe = vi.fn(async () => true)
    const sub = snapshotSubscription({ applicationServerKey: changedPublicKeyBuffer() }, { unsubscribe })
    stubSnapshotBrowser({ getRegistration: vi.fn(async () => registrationWith(sub)) })

    await getPushBrowserSnapshot(PUBLIC_KEY)
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('beëindigt een hangende getSubscription met unknown', async () => {
    vi.useFakeTimers()
    try {
      const registration = {
        active: {},
        pushManager: { getSubscription: vi.fn(() => new Promise<PushSubscription | null>(() => {})) },
      }
      stubSnapshotBrowser({ getRegistration: vi.fn(async () => registration) })

      const assertion = expect(getPushBrowserSnapshot(PUBLIC_KEY)).resolves.toMatchObject({
        status: 'unknown',
        endpoint: null,
      })
      await vi.advanceTimersByTimeAsync(10_000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('meldt unsupported wanneer de browser geen push ondersteunt', async () => {
    stubBrowser({
      PushManager: function PushManager() {},
      Notification: { permission: 'granted' },
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      navigator: {},
    })

    await expect(getPushBrowserSnapshot(PUBLIC_KEY)).resolves.toEqual({
      status: 'unsupported',
      endpoint: null,
    })
  })
})

describe('push client time-outs', () => {
  const hangingReady = () => new Promise<never>(() => {})

  function stubHangingBrowser() {
    stubBrowser({
      PushManager: function PushManager() {},
      Notification: { permission: 'granted', requestPermission: vi.fn(async () => 'granted') },
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      navigator: { serviceWorker: { ready: hangingReady() } },
    })
  }

  it('beëindigt inschakelen met een foutmelding wanneer de worker nooit actief wordt', async () => {
    vi.useFakeTimers()
    try {
      stubHangingBrowser()
      const assertion = expect(requestPermissionAndSubscribe(PUBLIC_KEY)).rejects.toThrow(
        'Push is momenteel niet beschikbaar',
      )
      await vi.advanceTimersByTimeAsync(10_000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('beëindigt uitschakelen zonder te blijven hangen', async () => {
    vi.useFakeTimers()
    try {
      stubHangingBrowser()
      const assertion = expect(unsubscribeBrowserSubscription()).resolves.toBe(false)
      await vi.advanceTimersByTimeAsync(10_000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('geeft een lege endpoint terug bij een hangende worker', async () => {
    vi.useFakeTimers()
    try {
      stubHangingBrowser()
      const assertion = expect(getCurrentEndpoint()).resolves.toBe('')
      await vi.advanceTimersByTimeAsync(10_000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})
