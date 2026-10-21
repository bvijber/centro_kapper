import { useEffect, useRef } from 'react'

import { PageRefresh, type PageRefreshOptions } from './page-refresh'

/**
 * React-koppeling voor de automatische achtergrondverversing.
 *
 * De controller wordt één keer per pagina aangemaakt en leest zijn opties
 * bij elke aanroep uit een ref, zodat de meest recente callbacks worden
 * gebruikt zonder de ververste te herstarten. De ververste start bij het
 * mounten en stopt bij het unmounten.
 */
export function usePageRefresh<T>(options: PageRefreshOptions<T>): PageRefresh<T> {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const refreshRef = useRef<PageRefresh<T> | null>(null)
  if (!refreshRef.current) {
    refreshRef.current = new PageRefresh<T>({
      load: () => optionsRef.current.load(),
      apply: (data) => optionsRef.current.apply(data),
      setLoading: (loading) => optionsRef.current.setLoading?.(loading),
      setError: (message) => optionsRef.current.setError?.(message),
      errorMessage: (error) => optionsRef.current.errorMessage?.(error),
      fallbackErrorMessage: optionsRef.current.fallbackErrorMessage,
      intervalMs: optionsRef.current.intervalMs,
      shouldContinue: () => optionsRef.current.shouldContinue?.() ?? true,
      deps: optionsRef.current.deps,
    })
  }
  const refresh = refreshRef.current

  useEffect(() => {
    refresh.start()
    return () => {
      refresh.stop()
    }
  }, [refresh])

  return refresh
}
