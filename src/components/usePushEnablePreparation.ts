import { useCallback, useEffect, useRef, useState } from 'react'

import {
  getPushPermission,
  isPushSupported,
  preparePushServiceWorker,
} from '../pwa/push-client'
import { publicErrorMessage } from './publicError'
import {
  preparePushEnable,
  type PushPreparation,
  type PushPreparationState,
} from './push-opt-in-logic'

type PushConfig = { publicKey: string | null }

/**
 * Laadt de publieke VAPID-configuratie en de Service Worker-registratie vóór
 * de gebruiker om toestemming wordt gevraagd. De configuratiepromise wordt
 * binnen de component hergebruikt, zodat een retry na een mislukte
 * Service Worker-voorbereiding geen tweede configuratieverzoek doet.
 */
export function usePushEnablePreparation(loadConfig: () => Promise<PushConfig>) {
  const loadConfigRef = useRef(loadConfig)
  loadConfigRef.current = loadConfig
  const configPromiseRef = useRef<Promise<PushConfig> | null>(null)
  const runIdRef = useRef(0)
  const [status, setStatus] = useState<PushPreparationState>('loading')
  const [preparation, setPreparation] = useState<PushPreparation<ServiceWorkerRegistration> | null>(null)
  const [error, setError] = useState('')

  const getConfigPromise = useCallback(() => {
    if (configPromiseRef.current) return configPromiseRef.current
    const promise = loadConfigRef.current().catch((caught) => {
      if (configPromiseRef.current === promise) configPromiseRef.current = null
      throw caught
    })
    configPromiseRef.current = promise
    return promise
  }, [])

  const start = useCallback(() => {
    const runId = ++runIdRef.current
    setPreparation(null)
    setError('')
    setStatus('loading')

    if (!isPushSupported() || getPushPermission() === 'denied') {
      setStatus('unavailable')
      return
    }

    void preparePushEnable({
      loadConfig: getConfigPromise,
      prepareRegistration: preparePushServiceWorker,
    }).then((result) => {
      if (runId !== runIdRef.current) return

      if (result.status === 'ready') {
        setPreparation(result)
        setStatus('ready')
        return
      }

      if (result.status === 'missing-config') {
        configPromiseRef.current = null
      }
      setStatus('error')
      setError(result.status === 'missing-config'
        ? 'Push is nog niet beschikbaar. Probeer het later opnieuw.'
        : publicErrorMessage(result.error, 'Push kon niet worden voorbereid. Probeer het opnieuw.'))
    }).catch((caught) => {
      if (runId !== runIdRef.current) return
      setStatus('error')
      setError(publicErrorMessage(caught, 'Push kon niet worden voorbereid. Probeer het opnieuw.'))
    })
  }, [getConfigPromise])

  useEffect(() => {
    start()
    return () => {
      runIdRef.current += 1
    }
  }, [start])

  return {
    status,
    preparation,
    error,
    retry: start,
  }
}
