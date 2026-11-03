/**
 * Browserhelpers voor Web Push-opt-in (Web Push v1, fase 4).
 *
 * Regels:
 * - toestemming wordt uitsluitend aangevraagd vanuit een expliciete
 *   gebruikersactie (`requestPushPermission`); importeren of opvragen van
 *   status triggert nooit een prompt;
 * - alle functies zijn no-ops of gooien een hanteerbare fout buiten
 *   ondersteunde browsers (SSR-veilig).
 */

import { registerServiceWorker } from './register-sw'

export type PushPermissionState = 'unsupported' | 'denied' | 'granted' | 'default'

export type BrowserPushSubscription = {
  endpoint: string
  p256dh: string
  auth: string
  unsubscribe: () => Promise<boolean>
}

export type PreparedPushSubscription = {
  publicKey: string
  registration: ServiceWorkerRegistration
}

export type ApplicationServerKeyState = 'match' | 'mismatch' | 'unknown'

export const PUSH_KEY_MISMATCH_MESSAGE =
  'Dit apparaat heeft nog een bestaand pushabonnement dat niet bij de huidige configuratie hoort. Schakel push voor deze app uit in de browserinstellingen en probeer het opnieuw.'

export class PushKeyMismatchError extends Error {
  constructor() {
    super(PUSH_KEY_MISMATCH_MESSAGE)
    this.name = 'PushKeyMismatchError'
  }
}

/**
 * Maximale wachttijd voor Service Worker- en subscription-operaties.
 * Ruim boven de normale registratietijd, zodat een ontbrekende worker als
 * fout wordt gemeld in plaats van onbeperkt te blijven wachten. De
 * browsertoestemmingsprompt zelf valt hier bewust buiten: die wacht op de
 * gebruiker en mag niet verlopen.
 */
const SERVICE_WORKER_TIMEOUT_MS = 10_000

const PUSH_UNAVAILABLE_MESSAGE =
  'Push is momenteel niet beschikbaar. Controleer je verbinding en probeer het later opnieuw.'

async function withServiceWorkerTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(PUSH_UNAVAILABLE_MESSAGE)), SERVICE_WORKER_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function getPushPermission(): PushPermissionState {
  if (!isPushSupported()) return 'unsupported'
  const permission = Notification.permission
  if (permission === 'granted' || permission === 'denied' || permission === 'default') return permission
  return 'default'
}

/**
 * Vraagt browsertoestemming alleen aan wanneer dat nodig is. De aanroep naar
 * `Notification.requestPermission()` gebeurt synchroon binnen deze functie,
 * zodat de caller hem direct vanuit een gebruikersactie kan starten zonder
 * eerst een netwerkawait te doen.
 */
export function requestPushPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) {
    return Promise.reject(new Error('Dit apparaat of deze browser ondersteunt geen pushmeldingen.'))
  }
  if (Notification.permission === 'granted') return Promise.resolve('granted')
  if (Notification.permission === 'denied') return Promise.resolve('denied')
  return Notification.requestPermission()
}

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalized)
  return new Uint8Array([...raw].map((character) => character.charCodeAt(0)))
}

/**
 * Classificeert de VAPID-key van een bestaande subscription zonder iets te
 * wijzigen. Een ontbrekende property of een omgeving zonder de property is
 * onbekend; die mag nooit als mismatch of als automatische cleanup worden
 * behandeld.
 */
export function classifyApplicationServerKey(
  subscription: Pick<PushSubscription, 'options'>,
  publicKey: string,
): ApplicationServerKeyState {
  const options = subscription?.options as Partial<PushSubscriptionOptions> | undefined
  if (!options || !('applicationServerKey' in options)) return 'unknown'

  const currentKey = options.applicationServerKey
  if (currentKey === undefined) return 'unknown'
  if (currentKey === null) return 'mismatch'

  let expectedKey: Uint8Array
  try {
    expectedKey = urlBase64ToUint8Array(publicKey)
  } catch {
    return 'unknown'
  }

  const currentBytes = new Uint8Array(currentKey)
  if (currentBytes.length !== expectedKey.length) return 'mismatch'
  return currentBytes.every((byte, index) => byte === expectedKey[index]) ? 'match' : 'mismatch'
}

function isInvalidStateError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'InvalidStateError'
  )
}

function toBrowserSubscription(subscription: PushSubscription): BrowserPushSubscription {
  const json = subscription.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error('De browser gaf een onvolledige subscription terug.')
  }
  return {
    endpoint: json.endpoint,
    p256dh,
    auth,
    unsubscribe: () => subscription.unsubscribe(),
  }
}

/**
 * Zorgt voor een actieve Service Worker-registratie vóórdat de gebruiker op
 * de enableknop tikt. De gedeelde registratiehelper dedupliceert het
 * registratieverzoek; `navigator.serviceWorker.ready` wacht alleen op een al
 * gestarte registratie en veroorzaakt geen extra netwerkverzoek.
 */
export async function preparePushServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!isPushSupported()) {
    throw new Error('Dit apparaat of deze browser ondersteunt geen pushmeldingen.')
  }

  const registered = await registerServiceWorker()
  if (!registered) {
    let existing: ServiceWorkerRegistration | null = null
    try {
      existing = (await navigator.serviceWorker.getRegistration('/')) ?? null
    } catch {
      existing = null
    }
    if (!existing) throw new Error(PUSH_UNAVAILABLE_MESSAGE)
  }

  return withServiceWorkerTimeout(navigator.serviceWorker.ready)
}

async function hasMismatchedApplicationServerKey(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<boolean> {
  try {
    const existing = await withServiceWorkerTimeout(registration.pushManager.getSubscription())
    return existing !== null && classifyApplicationServerKey(existing, publicKey) === 'mismatch'
  } catch {
    // Een mislukte leesactie is nooit een reden om de subscription te
    // verwijderen. Laat de browser-subscribe hieronder de beslissing nemen.
    return false
  }
}

/**
 * Maakt de pushsubscription met de vooraf geladen VAPID-sleutel en
 * Service Worker-registratie. Een bestaande subscription met een aantoonbaar
 * afwijkende key stopt de flow zonder `subscribe()` of `unsubscribe()`.
 * Bij een gelijke of onbekende key blijft `subscribe()` leidend, zodat de
 * browser alle subscription-opties vergelijkt en een bestaande subscription
 * kan hergebruiken.
 */
export async function subscribePreparedPush(
  prepared: PreparedPushSubscription,
): Promise<BrowserPushSubscription> {
  if (!isPushSupported()) throw new Error('Dit apparaat of deze browser ondersteunt geen pushmeldingen.')

  if (await hasMismatchedApplicationServerKey(prepared.registration, prepared.publicKey)) {
    throw new PushKeyMismatchError()
  }

  try {
    const subscription = await withServiceWorkerTimeout(
      prepared.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(prepared.publicKey),
      }),
    )
    return toBrowserSubscription(subscription)
  } catch (error) {
    if (!isInvalidStateError(error)) throw error
    // Een tweede controle kan bijvoorbeeld door een andere tab zijn
    // veroorzaakt. Alleen een aantoonbare mismatch wordt als keyconflict
    // gemeld; alle andere fouten blijven de oorspronkelijke fout.
    if (await hasMismatchedApplicationServerKey(prepared.registration, prepared.publicKey)) {
      throw new PushKeyMismatchError()
    }
    throw error
  }
}

export async function requestPermissionAndSubscribe(publicKey: string): Promise<BrowserPushSubscription> {
  const permission = await requestPushPermission()
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Meldingen zijn geblokkeerd in de browser. Pas dit aan in de browserinstellingen.'
      : 'Zonder toestemming kunnen geen meldingen worden verstuurd.')
  }
  const registration = await withServiceWorkerTimeout(navigator.serviceWorker.ready)
  const subscription = await withServiceWorkerTimeout(
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }),
  )
  return toBrowserSubscription(subscription)
}

export async function getCurrentEndpoint(): Promise<string> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return ''
  try {
    const registration = await withServiceWorkerTimeout(navigator.serviceWorker.ready)
    const subscription = await registration.pushManager.getSubscription()
    return subscription?.endpoint ?? ''
  } catch {
    return ''
  }
}

/**
 * Snelle, niet-blokkerende browserstatus voor de pushopt-in van de eigenaar.
 *
 * `navigator.serviceWorker.ready` wacht oneindig wanneer er geen actieve
 * registratie bestaat. Voor een statuscontrole kijken we daarom eerst naar
 * een bestaande registratie. Bestaat die niet, dan starten we de gedeelde
 * registratie op de achtergrond en melden we direct `no-registration`.
 */
export type PushBrowserSnapshot =
  | { status: 'unsupported'; endpoint: null }
  | { status: 'no-registration'; endpoint: null }
  | { status: 'registration-pending'; endpoint: null }
  | { status: 'no-subscription'; endpoint: null }
  | {
      status: 'subscribed'
      endpoint: string
      keyState: ApplicationServerKeyState
      expired: boolean
    }
  | { status: 'unknown'; endpoint: null; error: unknown }

function isSubscriptionExpired(subscription: PushSubscription): boolean {
  const expiration = subscription.expirationTime
  return typeof expiration === 'number' && expiration <= Date.now()
}

/**
 * Leest de lokale browserstatus en classificeert de VAPID-key van een
 * bestaande subscription. Fouten en time-outs worden als `unknown` gemeld,
 * nooit als `no-subscription`. Er wordt niets gewijzigd of opgeruimd.
 */
export async function getPushBrowserSnapshot(
  expectedPublicKey: string | null,
): Promise<PushBrowserSnapshot> {
  if (!isPushSupported()) return { status: 'unsupported', endpoint: null }

  let registration: ServiceWorkerRegistration | null = null
  try {
    registration = (await navigator.serviceWorker.getRegistration('/')) ?? null
  } catch (error) {
    return { status: 'unknown', endpoint: null, error }
  }

  if (!registration) {
    // Start (of hergebruik) de gedeelde registratie zonder de pagina te blokkeren.
    void registerServiceWorker()
    return { status: 'no-registration', endpoint: null }
  }

  if (!registration.active) {
    return { status: 'registration-pending', endpoint: null }
  }

  try {
    const subscription = await withServiceWorkerTimeout(registration.pushManager.getSubscription())
    if (!subscription) return { status: 'no-subscription', endpoint: null }
    return {
      status: 'subscribed',
      endpoint: subscription.endpoint,
      keyState: expectedPublicKey
        ? classifyApplicationServerKey(subscription, expectedPublicKey)
        : 'unknown',
      expired: isSubscriptionExpired(subscription),
    }
  } catch (error) {
    return { status: 'unknown', endpoint: null, error }
  }
}

export type PushBrowserState =
  | { status: 'no-registration'; endpoint: null }
  | { status: 'registration-pending'; endpoint: null }
  | { status: 'no-subscription'; endpoint: null }
  | { status: 'subscribed'; endpoint: string }

export async function getPushBrowserState(): Promise<PushBrowserState> {
  if (!isPushSupported()) return { status: 'no-registration', endpoint: null }

  let registration: ServiceWorkerRegistration | null = null
  try {
    registration = (await navigator.serviceWorker.getRegistration('/')) ?? null
  } catch {
    registration = null
  }

  if (!registration) {
    // Start (of hergebruik) de gedeelde registratie zonder de pagina te blokkeren.
    void registerServiceWorker()
    return { status: 'no-registration', endpoint: null }
  }

  if (!registration.active) {
    return { status: 'registration-pending', endpoint: null }
  }

  try {
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription?.endpoint) return { status: 'no-subscription', endpoint: null }
    return { status: 'subscribed', endpoint: subscription.endpoint }
  } catch {
    return { status: 'no-subscription', endpoint: null }
  }
}

export async function unsubscribeBrowserSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false
  try {
    const registration = await withServiceWorkerTimeout(navigator.serviceWorker.ready)
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return false
    return subscription.unsubscribe()
  } catch {
    return false
  }
}
