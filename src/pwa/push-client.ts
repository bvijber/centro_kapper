/**
 * Browserhelpers voor Web Push-opt-in (Web Push v1, fase 4).
 *
 * Regels:
 * - toestemming wordt uitsluitend aangevraagd vanuit een expliciete
 *   gebruikersactie (`requestPermissionAndSubscribe`); importeren of
 *   opvragen van status triggert nooit een prompt;
 * - alle functies zijn no-ops of gooien een hanteerbare fout buiten
 *   ondersteunde browsers (SSR-veilig).
 */

export type PushPermissionState = 'unsupported' | 'denied' | 'granted' | 'default'

export type BrowserPushSubscription = {
  endpoint: string
  p256dh: string
  auth: string
  unsubscribe: () => Promise<boolean>
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

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalized)
  return new Uint8Array([...raw].map((character) => character.charCodeAt(0)))
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

export async function requestPermissionAndSubscribe(publicKey: string): Promise<BrowserPushSubscription> {
  if (!isPushSupported()) throw new Error('Dit apparaat of deze browser ondersteunt geen pushmeldingen.')
  if (Notification.permission === 'denied') {
    throw new Error('Meldingen zijn geblokkeerd in de browser. Pas dit aan in de browserinstellingen.')
  }
  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      throw new Error(permission === 'denied'
        ? 'Meldingen zijn geblokkeerd in de browser. Pas dit aan in de browserinstellingen.'
        : 'Zonder toestemming kunnen geen meldingen worden verstuurd.')
    }
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
