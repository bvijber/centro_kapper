/**
 * Veilige service-worker-registratie voor de PWA-basis (stap 1).
 *
 * - Alleen in productiebuilds (`import.meta.env.PROD`): de ontwikkelworkflow
 *   blijft onaangetast.
 * - Alleen waar de browser service workers ondersteunt; registratie vereist
 *   bovendien een secure context (HTTPS of localhost) en mislukt daarbuiten
 *   gecontroleerd zonder de app te breken.
 * - Geen update-UX in deze stap: updates wachten vanzelf tot alle tabs
 *   gesloten zijn (zie public/sw.js).
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Registratie is niet-kritisch: de app blijft volledig bruikbaar als website.
    })
  })
}
