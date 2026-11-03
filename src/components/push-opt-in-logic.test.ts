import { describe, expect, it, vi } from 'vitest'

import {
  applyPushStatusError,
  beginPushUiAction,
  deactivateCustomerPushRegistration,
  deactivateOwnerPushRegistration,
  enableCustomerPush,
  enableOwnerPush,
  enablePreparedPush,
  failPushUiAction,
  getPushOptInView,
  preparePushEnable,
  resolvePushStatus,
  visiblePushUiError,
  type PushPreparation,
  type PushServerObservation,
} from './push-opt-in-logic'
import { PUSH_KEY_MISMATCH_MESSAGE, PushKeyMismatchError } from '../pwa/push-client'
import type { BrowserPushSubscription, PushBrowserSnapshot, PushPermissionState } from '../pwa/push-client'

const ENDPOINT = 'https://push.example.test/device-1'
const REGISTRATION = {} as ServiceWorkerRegistration
const PREPARED: PushPreparation<ServiceWorkerRegistration> = {
  status: 'ready',
  publicKey: 'public-key',
  registration: REGISTRATION,
}
const SUBSCRIPTION: BrowserPushSubscription = {
  endpoint: ENDPOINT,
  p256dh: 'p256dh-key',
  auth: 'auth-key',
  unsubscribe: async () => true,
}

describe('push opt-in feedback', () => {
  it('toont een fout bij status inactive', () => {
    const view = getPushOptInView('inactive', 'Meldingen konden niet worden aangezet.', '')
    expect(view.error).toBe('Meldingen konden niet worden aangezet.')
  })

  it('toont een fout bij status active', () => {
    const view = getPushOptInView('active', 'Meldingen konden niet worden uitgezet.', '')
    expect(view.error).toBe('Meldingen konden niet worden uitgezet.')
  })

  it('toont een fallbackfout bij status unknown', () => {
    expect(getPushOptInView('unknown', '', '').error).toBe('Pushstatus kon niet worden vastgesteld. Probeer het opnieuw.')
  })

  it('verbergt succesfeedback zolang er een fout zichtbaar is', () => {
    expect(getPushOptInView('inactive', 'Mislukt.', 'Gelukt.').feedback).toBe('')
  })
})

describe('customer push disable', () => {
  it('deactiveert eerst de server en daarna de browser', async () => {
    const unregisterServer = vi.fn(async () => ({}))
    const unsubscribeBrowser = vi.fn(async () => true)
    const events: string[] = []
    unregisterServer.mockImplementation(async () => {
      events.push('server')
      return {}
    })
    unsubscribeBrowser.mockImplementation(async () => {
      events.push('browser')
      return true
    })

    const outcome = await deactivateCustomerPushRegistration({
      entryId: 'entry-1',
      capability: 'capability-1',
      resolveEndpoint: async () => ENDPOINT,
      unregisterServer,
      unsubscribeBrowser,
    })

    expect(outcome).toEqual({ status: 'disabled' })
    expect(unregisterServer).toHaveBeenCalledWith({
      queueEntryId: 'entry-1',
      endpoint: ENDPOINT,
      capability: 'capability-1',
    })
    expect(events).toEqual(['server', 'browser'])
  })

  it('laat de browser-subscription staan wanneer de server deactivering faalt', async () => {
    const unregisterServer = vi.fn(async () => {
      throw new Error('server failure')
    })
    const unsubscribeBrowser = vi.fn(async () => true)

    const outcome = await deactivateCustomerPushRegistration({
      entryId: 'entry-1',
      resolveEndpoint: async () => ENDPOINT,
      unregisterServer,
      unsubscribeBrowser,
    })

    expect(outcome.status).toBe('server-failed')
    expect(unsubscribeBrowser).not.toHaveBeenCalled()
  })

  it('meldt geen succes wanneer de browser-subscription niet kan worden verwijderd', async () => {
    const outcome = await deactivateCustomerPushRegistration({
      entryId: 'entry-1',
      resolveEndpoint: async () => ENDPOINT,
      unregisterServer: vi.fn(async () => ({})),
      unsubscribeBrowser: vi.fn(async () => false),
    })

    expect(outcome).toEqual({ status: 'browser-cleanup-failed' })
  })
})

describe('owner push disable', () => {
  it('deactiveert eerst de server en daarna de browser', async () => {
    const getStatus = vi.fn(async () => ({ id: 'subscription-1' }))
    const unregisterServer = vi.fn(async () => ({}))
    const unsubscribeBrowser = vi.fn(async () => true)
    const events: string[] = []
    unregisterServer.mockImplementation(async () => {
      events.push('server')
      return {}
    })
    unsubscribeBrowser.mockImplementation(async () => {
      events.push('browser')
      return true
    })

    const outcome = await deactivateOwnerPushRegistration({
      resolveEndpoint: async () => ENDPOINT,
      getStatus,
      unregisterServer,
      unsubscribeBrowser,
    })

    expect(outcome).toEqual({ status: 'disabled' })
    expect(getStatus).toHaveBeenCalledWith(ENDPOINT)
    expect(unregisterServer).toHaveBeenCalledWith('subscription-1')
    expect(events).toEqual(['server', 'browser'])
  })

  it('laat de browser-subscription staan wanneer de server deactivering faalt', async () => {
    const unregisterServer = vi.fn(async () => {
      throw new Error('server failure')
    })
    const unsubscribeBrowser = vi.fn(async () => true)

    const outcome = await deactivateOwnerPushRegistration({
      resolveEndpoint: async () => ENDPOINT,
      getStatus: async () => ({ id: 'subscription-1' }),
      unregisterServer,
      unsubscribeBrowser,
    })

    expect(outcome.status).toBe('server-failed')
    expect(unsubscribeBrowser).not.toHaveBeenCalled()
  })

  it('meldt geen succes wanneer de browser-subscription niet kan worden verwijderd', async () => {
    const outcome = await deactivateOwnerPushRegistration({
      resolveEndpoint: async () => ENDPOINT,
      getStatus: async () => ({ id: 'subscription-1' }),
      unregisterServer: vi.fn(async () => ({})),
      unsubscribeBrowser: vi.fn(async () => false),
    })

    expect(outcome).toEqual({ status: 'browser-cleanup-failed' })
  })

  it('behandelt een ontbrekend endpoint niet als succes', async () => {
    const getStatus = vi.fn(async () => ({ id: 'subscription-1' }))
    const unregisterServer = vi.fn(async () => ({}))
    const unsubscribeBrowser = vi.fn(async () => true)

    const outcome = await deactivateOwnerPushRegistration({
      resolveEndpoint: async () => '',
      getStatus,
      unregisterServer,
      unsubscribeBrowser,
    })

    expect(outcome).toEqual({ status: 'endpoint-missing' })
    expect(getStatus).not.toHaveBeenCalled()
    expect(unregisterServer).not.toHaveBeenCalled()
    expect(unsubscribeBrowser).not.toHaveBeenCalled()
  })

  it('ruimt de browser op wanneer de serverregistratie al inactief is', async () => {
    const unregisterServer = vi.fn(async () => ({}))
    const unsubscribeBrowser = vi.fn(async () => true)

    const outcome = await deactivateOwnerPushRegistration({
      resolveEndpoint: async () => ENDPOINT,
      getStatus: async () => ({ id: null }),
      unregisterServer,
      unsubscribeBrowser,
    })

    expect(outcome).toEqual({ status: 'disabled' })
    expect(unregisterServer).not.toHaveBeenCalled()
    expect(unsubscribeBrowser).toHaveBeenCalledTimes(1)
  })
})

function enableDependencies(overrides: Partial<{
  requestPermission: () => Promise<NotificationPermission>
  subscribe: () => Promise<BrowserPushSubscription>
  register: () => Promise<unknown>
  refreshStatus: () => Promise<boolean>
}> = {}) {
  return {
    requestPermission: vi.fn(async (): Promise<NotificationPermission> => 'granted'),
    subscribe: vi.fn(async () => SUBSCRIPTION),
    register: vi.fn(async () => ({})),
    refreshStatus: vi.fn(async () => true),
    ...overrides,
  }
}

describe('push enable preparation', () => {
  it('laadt configuratie en registratie zonder toestemming of subscription te starten', async () => {
    const loadConfig = vi.fn(async () => ({ publicKey: '  public-key  ' }))
    const prepareRegistration = vi.fn(async () => REGISTRATION)

    await expect(preparePushEnable({ loadConfig, prepareRegistration })).resolves.toEqual({
      status: 'ready',
      publicKey: 'public-key',
      registration: REGISTRATION,
    })
    expect(loadConfig).toHaveBeenCalledTimes(1)
    expect(prepareRegistration).toHaveBeenCalledTimes(1)
  })

  it('vraagt geen toestemming wanneer de configuratie ontbreekt', async () => {
    const preparation = await preparePushEnable({
      loadConfig: async () => ({ publicKey: null }),
      prepareRegistration: async () => REGISTRATION,
    })
    const dependencies = enableDependencies()

    const outcome = await enablePreparedPush(preparation, dependencies)

    expect(outcome).toEqual({ status: 'not-ready', reason: 'missing-config' })
    expect(dependencies.requestPermission).not.toHaveBeenCalled()
    expect(dependencies.subscribe).not.toHaveBeenCalled()
    expect(dependencies.register).not.toHaveBeenCalled()
    expect(dependencies.refreshStatus).not.toHaveBeenCalled()
  })

  it('vraagt geen toestemming wanneer de Service Worker-voorbereiding mislukt', async () => {
    const preparation = await preparePushEnable({
      loadConfig: async () => ({ publicKey: 'public-key' }),
      prepareRegistration: async () => {
        throw new Error('service worker failure')
      },
    })
    const dependencies = enableDependencies()

    const outcome = await enablePreparedPush(preparation, dependencies)

    expect(outcome).toEqual({ status: 'not-ready', reason: 'failed' })
    expect(dependencies.requestPermission).not.toHaveBeenCalled()
    expect(dependencies.subscribe).not.toHaveBeenCalled()
  })

  it('kan na een mislukte voorbereiding veilig opnieuw proberen', async () => {
    let attempts = 0
    const prepareRegistration = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('service worker failure')
      return REGISTRATION
    })

    const first = await preparePushEnable({
      loadConfig: async () => ({ publicKey: 'public-key' }),
      prepareRegistration,
    })
    expect(first.status).toBe('failed')

    const second = await preparePushEnable({
      loadConfig: async () => ({ publicKey: 'public-key' }),
      prepareRegistration,
    })
    expect(second).toEqual({
      status: 'ready',
      publicKey: 'public-key',
      registration: REGISTRATION,
    })
    expect(prepareRegistration).toHaveBeenCalledTimes(2)
  })
})

describe('permission-first push enable', () => {
  it('vraagt toestemming vóór enige async enablestap', async () => {
    const events: string[] = []
    const dependencies = enableDependencies({
      requestPermission: vi.fn(() => {
        events.push('permission')
        return Promise.resolve('granted' as NotificationPermission)
      }),
      subscribe: vi.fn(async () => {
        events.push('subscribe')
        return SUBSCRIPTION
      }),
      register: vi.fn(async () => {
        events.push('register')
      }),
      refreshStatus: vi.fn(async () => {
        events.push('status')
        return true
      }),
    })

    const pending = enablePreparedPush(PREPARED, dependencies)

    expect(events).toEqual(['permission'])
    expect(dependencies.subscribe).not.toHaveBeenCalled()
    await expect(pending).resolves.toEqual({ status: 'enabled', subscribed: true })
    expect(events).toEqual(['permission', 'subscribe', 'register', 'status'])
    expect(dependencies.subscribe).toHaveBeenCalledWith(PREPARED)
    expect(dependencies.refreshStatus).toHaveBeenCalledWith(SUBSCRIPTION)
  })

  it('maakt geen subscription of serverregistratie bij denied', async () => {
    const dependencies = enableDependencies({
      requestPermission: vi.fn(async () => 'denied' as NotificationPermission),
    })

    await expect(enablePreparedPush(PREPARED, dependencies)).resolves.toEqual({ status: 'denied' })
    expect(dependencies.subscribe).not.toHaveBeenCalled()
    expect(dependencies.register).not.toHaveBeenCalled()
    expect(dependencies.refreshStatus).not.toHaveBeenCalled()
  })

  it('maakt geen subscription of serverregistratie bij default', async () => {
    const dependencies = enableDependencies({
      requestPermission: vi.fn(async () => 'default' as NotificationPermission),
    })

    await expect(enablePreparedPush(PREPARED, dependencies)).resolves.toEqual({ status: 'default' })
    expect(dependencies.subscribe).not.toHaveBeenCalled()
    expect(dependencies.register).not.toHaveBeenCalled()
    expect(dependencies.refreshStatus).not.toHaveBeenCalled()
  })

  it('maakt geen subscription bij een fout in de permission-aanvraag', async () => {
    const dependencies = enableDependencies({
      requestPermission: vi.fn(async () => {
        throw new Error('permission failure')
      }),
    })

    const outcome = await enablePreparedPush(PREPARED, dependencies)

    expect(outcome.status).toBe('failed')
    expect(dependencies.subscribe).not.toHaveBeenCalled()
    expect(dependencies.register).not.toHaveBeenCalled()
    expect(dependencies.refreshStatus).not.toHaveBeenCalled()
  })

  it('controleert de status pas na een succesvolle serverregistratie', async () => {
    const events: string[] = []
    const dependencies = enableDependencies({
      register: vi.fn(async () => {
        events.push('register')
      }),
      refreshStatus: vi.fn(async () => {
        events.push('status')
        return true
      }),
    })

    await expect(enablePreparedPush(PREPARED, dependencies)).resolves.toEqual({
      status: 'enabled',
      subscribed: true,
    })
    expect(events).toEqual(['register', 'status'])
  })

  it('geeft een zichtbare foutbron terug wanneer de serverregistratie mislukt', async () => {
    const error = new Error('server registration failure')
    const dependencies = enableDependencies({
      register: vi.fn(async () => {
        throw error
      }),
    })

    await expect(enablePreparedPush(PREPARED, dependencies)).resolves.toEqual({
      status: 'failed',
      error,
    })
    expect(dependencies.refreshStatus).not.toHaveBeenCalled()
  })
})

describe('customer and owner enable registration', () => {
  it('gebruikt per flow de eigen registratiegegevens en serverfunctie', async () => {
    const customerRegister = vi.fn(async () => ({}))
    const ownerRegister = vi.fn(async () => ({}))

    await enableCustomerPush(PREPARED, {
      entryId: 'entry-1',
      capability: 'capability-1',
      requestPermission: async () => 'granted',
      subscribe: async () => SUBSCRIPTION,
      register: customerRegister,
      refreshStatus: async () => true,
    })
    await enableOwnerPush(PREPARED, {
      requestPermission: async () => 'granted',
      subscribe: async () => SUBSCRIPTION,
      register: ownerRegister,
      refreshStatus: async () => true,
    })

    expect(customerRegister).toHaveBeenCalledWith({
      queueEntryId: 'entry-1',
      endpoint: ENDPOINT,
      p256dh: 'p256dh-key',
      auth: 'auth-key',
      capability: 'capability-1',
    })
    expect(ownerRegister).toHaveBeenCalledWith({
      endpoint: ENDPOINT,
      p256dh: 'p256dh-key',
      auth: 'auth-key',
    })
    expect(customerRegister).toHaveBeenCalledTimes(1)
    expect(ownerRegister).toHaveBeenCalledTimes(1)
  })
})

describe('push key conflicts', () => {
  it('stopt de klantflow zichtbaar zonder serverregistratie of statuscontrole', async () => {
    const register = vi.fn(async () => ({}))
    const refreshStatus = vi.fn(async () => true)

    const outcome = await enableCustomerPush(PREPARED, {
      entryId: 'entry-1',
      requestPermission: async () => 'granted',
      subscribe: async () => {
        throw new PushKeyMismatchError()
      },
      register,
      refreshStatus,
    })

    expect(outcome.status).toBe('failed')
    if (outcome.status !== 'failed') throw new Error('expected failed outcome')
    expect(outcome.error).toBeInstanceOf(PushKeyMismatchError)
    expect((outcome.error as Error).message).toBe(PUSH_KEY_MISMATCH_MESSAGE)
    expect(getPushOptInView('key-conflict', (outcome.error as Error).message, '').error).toBe(PUSH_KEY_MISMATCH_MESSAGE)
    expect(register).not.toHaveBeenCalled()
    expect(refreshStatus).not.toHaveBeenCalled()
  })

  it('stopt de eigenaarflow zichtbaar zonder serverregistratie of statuscontrole', async () => {
    const register = vi.fn(async () => ({}))
    const refreshStatus = vi.fn(async () => true)

    const outcome = await enableOwnerPush(PREPARED, {
      requestPermission: async () => 'granted',
      subscribe: async () => {
        throw new PushKeyMismatchError()
      },
      register,
      refreshStatus,
    })

    expect(outcome.status).toBe('failed')
    if (outcome.status !== 'failed') throw new Error('expected failed outcome')
    expect(outcome.error).toBeInstanceOf(PushKeyMismatchError)
    expect((outcome.error as Error).message).toBe(PUSH_KEY_MISMATCH_MESSAGE)
    expect(getPushOptInView('key-conflict', (outcome.error as Error).message, '').error).toBe(PUSH_KEY_MISMATCH_MESSAGE)
    expect(register).not.toHaveBeenCalled()
    expect(refreshStatus).not.toHaveBeenCalled()
  })
})

describe('push status resolver', () => {
  const granted = 'granted' as PushPermissionState
  const noSubscription: PushBrowserSnapshot = { status: 'no-subscription', endpoint: null }

  function subscribedSnapshot(over: Partial<Extract<PushBrowserSnapshot, { status: 'subscribed' }>> = {}): PushBrowserSnapshot {
    return { status: 'subscribed', endpoint: 'https://push.example.test/e1', keyState: 'match', expired: false, ...over }
  }

  const registered: PushServerObservation = { status: 'registered' }
  const notRegistered: PushServerObservation = { status: 'not-registered' }

  it('meldt server actief + lokale subscription ontbreekt als registered-not-local voor klant', () => {
    const resolution = resolvePushStatus({
      scope: 'customer', supported: true, permission: granted, preparation: 'ready',
      browser: noSubscription, server: registered,
    })
    expect(resolution.status).toBe('registered-not-local')
  })

  it('meldt server actief + lokale subscription ontbreekt als inactive voor eigenaar', () => {
    const resolution = resolvePushStatus({
      scope: 'owner', supported: true, permission: granted, preparation: 'ready',
      browser: noSubscription, server: registered,
    })
    expect(resolution.status).toBe('inactive')
  })

  it('meldt lokale subscription + ontbrekende serverregistratie als local-unregistered', () => {
    const resolution = resolvePushStatus({
      scope: 'customer', supported: true, permission: granted, preparation: 'ready',
      browser: subscribedSnapshot(), server: notRegistered,
    })
    expect(resolution.status).toBe('local-unregistered')
  })

  it('meldt beide actief + gelijke key als active', () => {
    const resolution = resolvePushStatus({
      scope: 'customer', supported: true, permission: granted, preparation: 'ready',
      browser: subscribedSnapshot(), server: registered,
    })
    expect(resolution.status).toBe('active')
  })

  it('meldt een afwijkende key als key-conflict', () => {
    const resolution = resolvePushStatus({
      scope: 'customer', supported: true, permission: granted, preparation: 'ready',
      browser: subscribedSnapshot({ keyState: 'mismatch' }), server: registered,
    })
    expect(resolution.status).toBe('key-conflict')
    expect(resolution.error).toBe(PUSH_KEY_MISMATCH_MESSAGE)
  })

  it('geeft denied voorrang over een actieve serverregistratie', () => {
    const resolution = resolvePushStatus({
      scope: 'customer', supported: true, permission: 'denied', preparation: 'ready',
      browser: subscribedSnapshot(), server: registered,
    })
    expect(resolution.status).toBe('denied')
  })

  it('geeft permission-needed bij default toestemming', () => {
    const resolution = resolvePushStatus({
      scope: 'customer', supported: true, permission: 'default', preparation: 'ready',
      browser: subscribedSnapshot(), server: registered,
    })
    expect(resolution.status).toBe('permission-needed')
  })

  it('geeft unsupported terug', () => {
    const resolution = resolvePushStatus({
      scope: 'customer', supported: false, permission: 'unsupported', preparation: 'ready',
      browser: noSubscription, server: notRegistered,
    })
    expect(resolution.status).toBe('unsupported')
  })

  it('geeft unknown bij een onbekende browserobservatie', () => {
    const resolution = resolvePushStatus({
      scope: 'customer', supported: true, permission: granted, preparation: 'ready',
      browser: { status: 'unknown', endpoint: null, error: new Error('read failure') }, server: registered,
    })
    expect(resolution.status).toBe('unknown')
  })

  it('geeft unknown bij een onbekende serverobservatie', () => {
    const resolution = resolvePushStatus({
      scope: 'customer', supported: true, permission: granted, preparation: 'ready',
      browser: subscribedSnapshot(), server: { status: 'unknown', error: new Error('server failure') },
    })
    expect(resolution.status).toBe('unknown')
  })

  it('geeft unknown bij een onbekende key en nooit active', () => {
    const resolution = resolvePushStatus({
      scope: 'customer', supported: true, permission: granted, preparation: 'ready',
      browser: subscribedSnapshot({ keyState: 'unknown' }), server: registered,
    })
    expect(resolution.status).toBe('unknown')
  })

  it('geeft unknown bij een verlopen lokale subscription', () => {
    const resolution = resolvePushStatus({
      scope: 'customer', supported: true, permission: granted, preparation: 'ready',
      browser: subscribedSnapshot({ expired: true }), server: registered,
    })
    expect(resolution.status).toBe('unknown')
  })

  it('geeft preparing terug terwijl de voorbereiding loopt', () => {
    const resolution = resolvePushStatus({
      scope: 'customer', supported: true, permission: granted, preparation: 'loading',
      browser: noSubscription, server: notRegistered,
    })
    expect(resolution.status).toBe('preparing')
  })
})

describe('push action error preservation', () => {
  function failedActionThenRefresh(actionMessage: string, statusMessage = '') {
    let state = beginPushUiAction()
    state = failPushUiAction(state, actionMessage)
    state = applyPushStatusError(state, statusMessage)
    return state
  }

  it('behoudt een mislukte klant-enable na een succesvolle after-action-refresh', () => {
    const state = failedActionThenRefresh('Klant inschakelen mislukt.')
    expect(visiblePushUiError(state)).toBe('Klant inschakelen mislukt.')
  })

  it('behoudt een mislukte eigenaar-enable na een succesvolle after-action-refresh', () => {
    const state = failedActionThenRefresh('Eigenaar inschakelen mislukt.')
    expect(visiblePushUiError(state)).toBe('Eigenaar inschakelen mislukt.')
  })

  it('behoudt een mislukte klant-disable na een succesvolle after-action-refresh', () => {
    const state = failedActionThenRefresh('Klant uitschakelen mislukt.')
    expect(visiblePushUiError(state)).toBe('Klant uitschakelen mislukt.')
  })

  it('behoudt een gedeeltelijk mislukte eigenaar-disable na een succesvolle after-action-refresh', () => {
    const state = failedActionThenRefresh('Apparaat kon niet volledig worden losgekoppeld.')
    expect(visiblePushUiError(state)).toBe('Apparaat kon niet volledig worden losgekoppeld.')
  })

  it('laat een volgende expliciete actie de eerdere fout vervangen', () => {
    let state = failedActionThenRefresh('Eerdere fout.')
    state = beginPushUiAction()
    state = applyPushStatusError(state, '')
    expect(visiblePushUiError(state)).toBe('')
  })

  it('laat een statusfout zien wanneer er geen actiefout is', () => {
    const state = applyPushStatusError(beginPushUiAction(), 'Status kon niet worden geladen.')
    expect(visiblePushUiError(state)).toBe('Status kon niet worden geladen.')
  })
})
