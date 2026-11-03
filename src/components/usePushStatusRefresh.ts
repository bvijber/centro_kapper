import { useEffect, useRef } from 'react'

export type PushRefreshMode = 'initial' | 'refresh' | 'after-action'

export type VisibilityEventTarget = {
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
  visibilityState?: string
}

type VisibilityDeps = {
  document?: VisibilityEventTarget
  window?: VisibilityEventTarget
}

function defaultVisibilityDeps(): VisibilityDeps {
  return {
    document: typeof document !== 'undefined' ? document : undefined,
    window: typeof window !== 'undefined' ? window : undefined,
  }
}

/**
 * Koppelt `visibilitychange` en `pageshow` aan een refresh-actie. Alleen een
 * zichtbare pagina start een hercontrole. Puur en zonder React uitvoerbaar te
 * testen.
 */
export function subscribeToPushStatusRefresh(
  refresh: () => void,
  deps: VisibilityDeps = defaultVisibilityDeps(),
): () => void {
  const documentTarget = deps.document
  const windowTarget = deps.window

  const onVisibility = () => {
    if (documentTarget?.visibilityState !== 'visible') return
    refresh()
  }
  const onPageShow = () => {
    refresh()
  }

  documentTarget?.addEventListener('visibilitychange', onVisibility)
  windowTarget?.addEventListener('pageshow', onPageShow)

  return () => {
    documentTarget?.removeEventListener('visibilitychange', onVisibility)
    windowTarget?.removeEventListener('pageshow', onPageShow)
  }
}

/**
 * Voorkomt parallelle dubbele controles. Geeft een stabiele runner terug die
 * per aanroep hooguit één lopende refresh toestaat.
 */
export function createPushStatusRunner(
  refresh: (mode: PushRefreshMode) => Promise<void>,
): (mode: PushRefreshMode) => void {
  let inFlight = false
  let pendingAfterAction = false

  const run = (mode: PushRefreshMode) => {
    if (inFlight) {
      // Een after-action-controle mag niet verloren gaan wanneer er al een
      // achtergrondcontrole loopt. Alle andere modes blijven gededupliceerd.
      if (mode === 'after-action') pendingAfterAction = true
      return
    }

    inFlight = true
    void refresh(mode)
      .catch(() => {})
      .finally(() => {
        inFlight = false
        if (pendingAfterAction) {
          pendingAfterAction = false
          run('after-action')
        }
      })
  }

  return run
}

/**
 * Gedeelde lifecycle-helper voor het opnieuw controleren van de pushstatus.
 *
 * - start geen controle wanneer de pagina verborgen is;
 * - voorkomt parallelle dubbele controles via een in-flight guard;
 * - gebruikt altijd de meest recente `refresh`-callback;
 * - verandert niets aan de Service Worker-updatepolicy.
 */
export function usePushStatusRefresh(
  refresh: (mode: PushRefreshMode) => Promise<void>,
): (mode: PushRefreshMode) => void {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  const runnerRef = useRef<((mode: PushRefreshMode) => void) | null>(null)
  if (runnerRef.current === null) {
    runnerRef.current = createPushStatusRunner((mode) => refreshRef.current(mode))
  }
  const run = runnerRef.current

  useEffect(() => {
    return subscribeToPushStatusRefresh(() => run('refresh'))
  }, [run])

  return run
}
