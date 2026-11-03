import {
  PUSH_KEY_MISMATCH_MESSAGE,
  type BrowserPushSubscription,
  type PreparedPushSubscription,
  type PushBrowserSnapshot,
  type PushPermissionState,
} from '../pwa/push-client'

export type PushPreparationState = 'loading' | 'ready' | 'error' | 'unavailable'

export type PushScope = 'customer' | 'owner'

export type PushServerObservation =
  | { status: 'registered' }
  | { status: 'not-registered' }
  | { status: 'unknown'; error?: unknown }
  | { status: 'not-available' }

export type PushResolvedStatus =
  | 'unsupported'
  | 'denied'
  | 'permission-needed'
  | 'preparing'
  | 'inactive'
  | 'registered-not-local'
  | 'local-unregistered'
  | 'key-conflict'
  | 'active'
  | 'unknown'

export type PushOptInStatus = PushResolvedStatus | 'working'

export type PushStatusResolution = {
  status: PushResolvedStatus
  error: string
}

export type PushOptInView = {
  state: PushOptInStatus
  error: string
  feedback: string
  canEnable: boolean
  canDisable: boolean
  canRetry: boolean
}

export type PushUiErrorState = {
  /** Fout van de laatste expliciete enable/disable-actie. */
  actionError: string
  /** Fout/waarschuwing uit de actuele statuscontrole. */
  statusError: string
}

export function emptyPushUiErrorState(): PushUiErrorState {
  return { actionError: '', statusError: '' }
}

/** Start een nieuwe expliciete actie en vervangt eerdere foutmeldingen. */
export function beginPushUiAction(): PushUiErrorState {
  return emptyPushUiErrorState()
}

/** Bewaart de fout van een mislukte of gedeeltelijk mislukte actie. */
export function failPushUiAction(
  state: PushUiErrorState,
  message: string,
): PushUiErrorState {
  return { ...state, actionError: message }
}

/**
 * Werkt alleen de statusfout bij. Een eerdere actiefout blijft daardoor
 * zichtbaar na een succesvolle after-action-refresh.
 */
export function applyPushStatusError(
  state: PushUiErrorState,
  message: string,
): PushUiErrorState {
  return { ...state, statusError: message }
}

/** De actiefout heeft voorrang op de statusfout. */
export function visiblePushUiError(state: PushUiErrorState): string {
  return state.actionError.trim() || state.statusError.trim()
}

/**
 * Bepaalt welke feedback en acties zichtbaar zijn. Een fout is altijd leidend
 * en wordt onafhankelijk van de status getoond; succesfeedback verdwijnt
 * zolang er een fout staat.
 */
export function getPushOptInView(
  state: PushOptInStatus,
  error: string,
  feedback: string,
): PushOptInView {
  const errorMessage = error.trim()
  const hasError = Boolean(errorMessage || state === 'unknown')
  return {
    state,
    error: errorMessage || (state === 'unknown' ? 'Pushstatus kon niet worden vastgesteld. Probeer het opnieuw.' : ''),
    feedback: hasError ? '' : feedback,
    canEnable: state === 'permission-needed' || state === 'inactive' || state === 'registered-not-local' || state === 'local-unregistered',
    canDisable: state === 'active',
    canRetry: state === 'unknown',
  }
}

/**
 * Combineert lokale browserstatus, serverregistratie en permission tot één
 * eenduidige status. Deze functie voert zelf geen browser-, server- of
 * cleanupacties uit; beide inputs worden door de aanroeper verzameld.
 */
export function resolvePushStatus(input: {
  scope: PushScope
  supported: boolean
  permission: PushPermissionState
  preparation: PushPreparationState
  browser: PushBrowserSnapshot
  server: PushServerObservation
}): PushStatusResolution {
  if (!input.supported || input.permission === 'unsupported') {
    return { status: 'unsupported', error: '' }
  }
  if (input.permission === 'denied') {
    return { status: 'denied', error: '' }
  }
  if (input.permission === 'default') {
    return { status: 'permission-needed', error: '' }
  }

  if (input.preparation === 'loading' || input.browser.status === 'registration-pending') {
    return { status: 'preparing', error: '' }
  }

  if (input.browser.status === 'subscribed' && input.browser.keyState === 'mismatch') {
    return { status: 'key-conflict', error: PUSH_KEY_MISMATCH_MESSAGE }
  }

  if (input.browser.status === 'unknown' || input.server.status === 'unknown') {
    return { status: 'unknown', error: '' }
  }

  if (input.browser.status === 'subscribed' && input.browser.expired) {
    return { status: 'unknown', error: '' }
  }

  const registered = input.server.status === 'registered'

  if (input.browser.status === 'subscribed' && input.browser.keyState === 'unknown') {
    return { status: 'unknown', error: '' }
  }

  if (input.browser.status === 'subscribed' && input.browser.keyState === 'match' && registered) {
    return { status: 'active', error: '' }
  }

  if (input.browser.status === 'subscribed' && !registered) {
    return { status: 'local-unregistered', error: '' }
  }

  if (input.browser.status !== 'subscribed' && registered) {
    return input.scope === 'customer'
      ? { status: 'registered-not-local', error: '' }
      : { status: 'inactive', error: '' }
  }

  return { status: 'inactive', error: '' }
}

export type PushDisableOutcome =
  | { status: 'disabled' }
  | { status: 'server-failed'; error: unknown }
  | { status: 'endpoint-missing' }
  | { status: 'browser-cleanup-failed' }

type DeactivatePushRegistrationInput = {
  resolveEndpoint: () => Promise<string>
  deactivateServer: (endpoint: string) => Promise<void>
  unsubscribeBrowser: () => Promise<boolean>
}

/**
 * Schakelt push fail-closed uit: eerst de serverregistratie, pas daarna de
 * browser-subscription. Bij een serverfout blijft de browser-subscription dus
 * bestaan en wordt er geen succes gemeld. Een mislukte browser-opruiming is
 * eveneens een fout, ook al is de serverregistratie al gedeactiveerd.
 */
export async function deactivatePushRegistration(
  input: DeactivatePushRegistrationInput,
): Promise<PushDisableOutcome> {
  let endpoint: string
  try {
    endpoint = await input.resolveEndpoint()
  } catch {
    return { status: 'endpoint-missing' }
  }
  if (!endpoint) return { status: 'endpoint-missing' }

  try {
    await input.deactivateServer(endpoint)
  } catch (error) {
    return { status: 'server-failed', error }
  }

  try {
    if (!(await input.unsubscribeBrowser())) return { status: 'browser-cleanup-failed' }
  } catch {
    return { status: 'browser-cleanup-failed' }
  }

  return { status: 'disabled' }
}

type DeactivateCustomerPushRegistrationInput = {
  entryId: string
  capability?: string
  resolveEndpoint: () => Promise<string>
  unregisterServer: (input: {
    queueEntryId: string
    endpoint: string
    capability?: string
  }) => Promise<unknown>
  unsubscribeBrowser: () => Promise<boolean>
}

export async function deactivateCustomerPushRegistration(
  input: DeactivateCustomerPushRegistrationInput,
): Promise<PushDisableOutcome> {
  return deactivatePushRegistration({
    resolveEndpoint: input.resolveEndpoint,
    deactivateServer: async (endpoint) => {
      await input.unregisterServer({
        queueEntryId: input.entryId,
        endpoint,
        ...(input.capability ? { capability: input.capability } : {}),
      })
    },
    unsubscribeBrowser: input.unsubscribeBrowser,
  })
}

type DeactivateOwnerPushRegistrationInput = {
  resolveEndpoint: () => Promise<string>
  getStatus: (endpoint: string) => Promise<{ id: string | null }>
  unregisterServer: (id: string) => Promise<unknown>
  unsubscribeBrowser: () => Promise<boolean>
}

export async function deactivateOwnerPushRegistration(
  input: DeactivateOwnerPushRegistrationInput,
): Promise<PushDisableOutcome> {
  return deactivatePushRegistration({
    resolveEndpoint: input.resolveEndpoint,
    deactivateServer: async (endpoint) => {
      const status = await input.getStatus(endpoint)
      if (status.id) await input.unregisterServer(status.id)
    },
    unsubscribeBrowser: input.unsubscribeBrowser,
  })
}

export type PushPreparation<Registration> =
  | { status: 'ready'; publicKey: string; registration: Registration }
  | { status: 'missing-config' }
  | { status: 'failed'; error: unknown }

/**
 * Laadt de publieke configuratie en een actieve Service Worker-registratie
 * vóórdat de gebruiker om toestemming wordt gevraagd. Er wordt geen
 * permissionprompt, subscription of serverregistratie gestart.
 */
export async function preparePushEnable<Registration>(input: {
  loadConfig: () => Promise<{ publicKey: string | null }>
  prepareRegistration: () => Promise<Registration>
}): Promise<PushPreparation<Registration>> {
  const [config, registration] = await Promise.allSettled([
    input.loadConfig(),
    input.prepareRegistration(),
  ])

  if (config.status === 'rejected') {
    return { status: 'failed', error: config.reason }
  }
  const publicKey = config.value.publicKey?.trim()
  if (!publicKey) return { status: 'missing-config' }
  if (registration.status === 'rejected') {
    return { status: 'failed', error: registration.reason }
  }

  return { status: 'ready', publicKey, registration: registration.value }
}

export type PushEnableOutcome =
  | { status: 'enabled'; subscribed: boolean; statusError?: unknown }
  | { status: 'denied' }
  | { status: 'default' }
  | { status: 'not-ready'; reason: 'missing-config' | 'failed' }
  | { status: 'failed'; error: unknown }

type EnablePreparedPushInput<Registration, Subscription> = {
  requestPermission: () => Promise<NotificationPermission>
  subscribe: (preparation: PushPreparation<Registration> & { status: 'ready' }) => Promise<Subscription>
  register: (subscription: Subscription) => Promise<unknown>
  refreshStatus: (subscription: Subscription) => Promise<boolean>
}

/**
 * Permission-first enableflow. De eerste uitvoerbare stap is altijd
 * `requestPermission()`; subscribe(), serverregistratie en statuscontrole
 * volgen pas daarna. Zonder `granted` worden die stappen nooit uitgevoerd.
 */
export async function enablePreparedPush<Registration, Subscription>(
  preparation: PushPreparation<Registration>,
  input: EnablePreparedPushInput<Registration, Subscription>,
): Promise<PushEnableOutcome> {
  if (preparation.status !== 'ready') {
    return { status: 'not-ready', reason: preparation.status }
  }

  let permissionResult: Promise<NotificationPermission>
  try {
    permissionResult = input.requestPermission()
  } catch (error) {
    return { status: 'failed', error }
  }

  let permission: NotificationPermission
  try {
    permission = await permissionResult
  } catch (error) {
    return { status: 'failed', error }
  }
  if (permission !== 'granted') {
    return { status: permission === 'denied' ? 'denied' : 'default' }
  }

  try {
    const subscription = await input.subscribe(preparation)
    await input.register(subscription)
    try {
      const subscribed = await input.refreshStatus(subscription)
      return { status: 'enabled', subscribed }
    } catch (error) {
      return { status: 'enabled', subscribed: true, statusError: error }
    }
  } catch (error) {
    return { status: 'failed', error }
  }
}

type CustomerPushRegisterData = {
  queueEntryId: string
  endpoint: string
  p256dh: string
  auth: string
  capability?: string
}

type CustomerPushEnableInput = {
  entryId: string
  capability?: string
  requestPermission: () => Promise<NotificationPermission>
  subscribe: (preparation: PreparedPushSubscription) => Promise<BrowserPushSubscription>
  register: (data: CustomerPushRegisterData) => Promise<unknown>
  refreshStatus: (subscription: BrowserPushSubscription) => Promise<boolean>
}

export async function enableCustomerPush(
  preparation: PushPreparation<ServiceWorkerRegistration>,
  input: CustomerPushEnableInput,
): Promise<PushEnableOutcome> {
  return enablePreparedPush(preparation, {
    requestPermission: input.requestPermission,
    subscribe: input.subscribe,
    register: (subscription) => input.register({
      queueEntryId: input.entryId,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      ...(input.capability ? { capability: input.capability } : {}),
    }),
    refreshStatus: input.refreshStatus,
  })
}

type OwnerPushRegisterData = {
  endpoint: string
  p256dh: string
  auth: string
}

type OwnerPushEnableInput = {
  requestPermission: () => Promise<NotificationPermission>
  subscribe: (preparation: PreparedPushSubscription) => Promise<BrowserPushSubscription>
  register: (data: OwnerPushRegisterData) => Promise<unknown>
  refreshStatus: (subscription: BrowserPushSubscription) => Promise<boolean>
}

export async function enableOwnerPush(
  preparation: PushPreparation<ServiceWorkerRegistration>,
  input: OwnerPushEnableInput,
): Promise<PushEnableOutcome> {
  return enablePreparedPush(preparation, {
    requestPermission: input.requestPermission,
    subscribe: input.subscribe,
    register: (subscription) => input.register({
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    }),
    refreshStatus: input.refreshStatus,
  })
}
