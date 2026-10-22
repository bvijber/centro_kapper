import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getCurrentEndpoint,
  getPushPermission,
  isPushSupported,
  requestPermissionAndSubscribe,
  unsubscribeBrowserSubscription,
  urlBase64ToUint8Array,
} from './push-client'

const PUBLIC_KEY = 'BL7ELU24fJTAlH5Kyl8N6BDCac8u8li_U5PIwG963MOvdYs9s7LSzj8x_7v7RFdLZ9Eap50PiiyF5K0TDAis7t0'

type WindowStub = {
  PushManager?: unknown
  Notification?: { permission: string; requestPermission?: () => Promise<string> }
  atob?: (value: string) => string
  navigator?: { serviceWorker?: unknown }
}

let originalWindow: unknown

function stubBrowser(stub: WindowStub & { navigator: object }): void {
  ;(globalThis as Record<string, unknown>).window = stub
  ;(globalThis as Record<string, unknown>).navigator = stub.navigator
  ;(globalThis as Record<string, unknown>).Notification = stub.Notification
}

beforeEach(() => {
  originalWindow = (globalThis as Record<string, unknown>).window
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
