import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type LoadHandler = () => void

let loadHandler: LoadHandler | null = null
let register: ReturnType<typeof vi.fn>

function stubBrowser(options: { readyState: DocumentReadyState; registerResult?: unknown }): void {
  loadHandler = null
  register = vi.fn(async () => options.registerResult ?? ({ scope: '/' } as unknown as ServiceWorkerRegistration))
  Object.defineProperty(globalThis, 'window', {
    value: {
      addEventListener: (type: string, handler: LoadHandler) => {
        if (type === 'load') loadHandler = handler
      },
    },
    writable: true,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'document', {
    value: { readyState: options.readyState },
    writable: true,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'navigator', {
    value: { serviceWorker: { register } },
    writable: true,
    configurable: true,
  })
}

async function loadRegisterModule() {
  vi.resetModules()
  return await import('./register-sw')
}

beforeEach(() => {
  vi.stubEnv('PROD', true)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  delete (globalThis as Record<string, unknown>).window
  delete (globalThis as Record<string, unknown>).document
  delete (globalThis as Record<string, unknown>).navigator
  loadHandler = null
})

describe('service worker registration', () => {
  it('registreert direct wanneer de pagina al volledig geladen is', async () => {
    stubBrowser({ readyState: 'complete' })
    const { registerServiceWorker } = await loadRegisterModule()

    await expect(registerServiceWorker()).resolves.toEqual({ scope: '/' })

    expect(register).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' })
    expect(loadHandler).toBeNull()
  })

  it('wacht op load wanneer de pagina nog niet volledig geladen is', async () => {
    stubBrowser({ readyState: 'loading' })
    const { registerServiceWorker } = await loadRegisterModule()

    const promise = registerServiceWorker()
    expect(register).not.toHaveBeenCalled()
    expect(loadHandler).toBeTypeOf('function')

    loadHandler?.()
    await expect(promise).resolves.toEqual({ scope: '/' })
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('voorkomt dubbele registraties bij meerdere aanroepen', async () => {
    stubBrowser({ readyState: 'complete' })
    const { registerServiceWorker } = await loadRegisterModule()

    const first = registerServiceWorker()
    const second = registerServiceWorker()

    expect(second).toBe(first)
    await Promise.all([first, second])
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('logt een registratiefout en staat een latere herpoging toe', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubBrowser({ readyState: 'complete' })
    register.mockRejectedValueOnce(new Error('registratie mislukt'))
    const { registerServiceWorker } = await loadRegisterModule()

    await expect(registerServiceWorker()).resolves.toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('registratie mislukt'))

    await expect(registerServiceWorker()).resolves.toEqual({ scope: '/' })
    expect(register).toHaveBeenCalledTimes(2)
  })

  it('is een veilige no-op buiten ondersteunde browsers', async () => {
    const { registerServiceWorker } = await loadRegisterModule()

    await expect(registerServiceWorker()).resolves.toBeNull()
  })

  it('is een veilige no-op buiten productiebuilds', async () => {
    vi.stubEnv('PROD', false)
    stubBrowser({ readyState: 'complete' })
    const { registerServiceWorker } = await loadRegisterModule()

    await expect(registerServiceWorker()).resolves.toBeNull()
    expect(register).not.toHaveBeenCalled()
  })
})
