/**
 * Veilige service-worker-registratie voor de PWA-basis (stap 1).
 *
 * - Alleen in productiebuilds (`import.meta.env.PROD`): de ontwikkelworkflow
 *   blijft onaangetast.
 * - Alleen waar de browser service workers ondersteunt; registratie vereist
 *   bovendien een secure context (HTTPS of localhost) en mislukt daarbuiten
 *   gecontroleerd zonder de app te breken.
 * - De registratie wordt één keer per paginasessie uitgevoerd. Meerdere
 *   aanroepen delen dezelfde Promise, zodat de root-component en de
 *   push-client niet onafhankelijk van elkaar opnieuw registreren.
 * - Is de pagina al volledig geladen, dan registreren we direct. Anders
 *   wachten we op `load`; zo gaat de registratie niet verloren wanneer de
 *   `load`-listener pas na het load-event wordt toegevoegd.
 * - Geen update-UX in deze stap: updates wachten vanzelf tot alle tabs
 *   gesloten zijn (zie public/sw.js).
 */

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null

function logRegistrationFailure(error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : 'onbekende fout'
  console.warn(`[pwa] Service worker registration failed: ${detail}`)
}

function registerWhenReady(): Promise<ServiceWorkerRegistration | null> {
  return new Promise((resolve) => {
    const register = () => {
      try {
        void navigator.serviceWorker
          .register('/sw.js', { scope: '/' })
          .then((registration) => resolve(registration))
          .catch((error) => {
            logRegistrationFailure(error)
            resolve(null)
          })
      } catch (error) {
        logRegistrationFailure(error)
        resolve(null)
      }
    }

    if (typeof document !== 'undefined' && document.readyState === 'complete') {
      register()
      return
    }

    window.addEventListener('load', register, { once: true })
  })
}

/**
 * Registreert de service worker en geeft dezelfde Promise terug bij
 * herhaalde aanroepen. Bij een mislukte registratie wordt de cache geleegd,
 * zodat een latere aanroep het opnieuw kan proberen.
 */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return Promise.resolve(null)
  }
  if (!import.meta.env.PROD) return Promise.resolve(null)
  if (registrationPromise) return registrationPromise

  registrationPromise = registerWhenReady().then((registration) => {
    if (!registration) registrationPromise = null
    return registration
  })

  return registrationPromise
}
