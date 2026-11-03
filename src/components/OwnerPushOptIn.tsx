import { BellOff, BellRing } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { publicErrorMessage } from './publicError'
import { Button } from './Button'
import {
  applyPushStatusError,
  beginPushUiAction,
  deactivateOwnerPushRegistration,
  enableOwnerPush,
  failPushUiAction,
  getPushOptInView,
  resolvePushStatus,
  visiblePushUiError,
  type PushOptInStatus,
  type PushServerObservation,
  type PushUiErrorState,
} from './push-opt-in-logic'
import { usePushEnablePreparation } from './usePushEnablePreparation'
import { usePushStatusRefresh } from './usePushStatusRefresh'
import {
  getCurrentEndpoint,
  getPushBrowserSnapshot,
  getPushPermission,
  isPushSupported,
  PUSH_KEY_MISMATCH_MESSAGE,
  PushKeyMismatchError,
  requestPushPermission,
  subscribePreparedPush,
  unsubscribeBrowserSubscription,
} from '../pwa/push-client'
import {
  getOwnerPushConfigFn,
  getOwnerPushStatusFn,
  registerOwnerPushSubscriptionFn,
  unregisterOwnerPushSubscriptionFn,
} from '../push/owner-push.functions'

/**
 * Pushopt-in voor de **eigenaar** op één apparaat
 * (BUSINESS_RULES.md §29 "Eigenaarpush").
 *
 * Regels:
 * - toestemming wordt uitsluitend gevraagd vanuit een expliciete
 *   gebruikersactie; het openen van de pagina vraagt nooit om toestemming;
 * - het uitschakelen geldt alleen voor het eigen apparaat; andere apparaten
 *   van de eigenaar blijven ongewijzigd;
 * - zonder push blijft de interne notificatiebel het enige kanaal.
 */
export function OwnerPushOptIn({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState<PushOptInStatus>('preparing')
  const [errorState, setErrorState] = useState<PushUiErrorState>(beginPushUiAction)
  const [feedback, setFeedback] = useState('')
  const statusRef = useRef<PushOptInStatus>('preparing')
  const {
    status: preparationStatus,
    preparation,
    error: preparationError,
    retry: retryPreparation,
  } = usePushEnablePreparation(getOwnerPushConfigFn)

  const updateStatus = useCallback((next: PushOptInStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const applyResolution = useCallback((
    resolution: ReturnType<typeof resolvePushStatus>,
    mode: 'initial' | 'refresh' | 'after-action',
  ) => {
    if (
      mode === 'refresh' &&
      resolution.status === 'unknown' &&
      statusRef.current !== 'unknown' &&
      statusRef.current !== 'preparing' &&
      statusRef.current !== 'working'
    ) {
      setErrorState((current) => applyPushStatusError(current, 'Pushstatus is mogelijk verouderd. Probeer het opnieuw.'))
      return
    }
    updateStatus(resolution.status)
    setErrorState((current) => applyPushStatusError(current, resolution.error))
  }, [updateStatus])

  const loadStatus = useCallback(async (mode: 'initial' | 'refresh' | 'after-action') => {
    const supported = isPushSupported()
    const permission = getPushPermission()

    const shortCircuit = () => applyResolution(resolvePushStatus({
      scope: 'owner',
      supported,
      permission,
      preparation: preparationStatus,
      browser: { status: 'no-subscription', endpoint: null },
      server: { status: 'not-available' },
    }), mode)

    if (!supported || permission !== 'granted') {
      shortCircuit()
      return
    }

    const publicKey = preparation?.status === 'ready' ? preparation.publicKey : null
    const browser = await getPushBrowserSnapshot(publicKey).catch((caught) => (
      { status: 'unknown', endpoint: null, error: caught } as const
    ))

    let server: PushServerObservation = { status: 'not-available' }
    if (browser.status === 'subscribed' && browser.endpoint) {
      try {
        const result = await getOwnerPushStatusFn({ data: { endpoint: browser.endpoint } })
        server = result.subscribed ? { status: 'registered' } : { status: 'not-registered' }
      } catch (caught) {
        server = { status: 'unknown', error: caught }
      }
    }

    applyResolution(resolvePushStatus({
      scope: 'owner',
      supported,
      permission,
      preparation: preparationStatus,
      browser,
      server,
    }), mode)
  }, [preparation, preparationStatus, applyResolution])

  const refresh = usePushStatusRefresh(loadStatus)

  useEffect(() => {
    void loadStatus('initial')
  }, [loadStatus])

  const enable = async () => {
    setErrorState(beginPushUiAction())
    setFeedback('')
    updateStatus('working')

    if (preparationStatus !== 'ready' || !preparation || preparation.status !== 'ready') {
      updateStatus('inactive')
      setErrorState((current) => failPushUiAction(current, preparationError || 'Push is nog niet klaar. Probeer het opnieuw.'))
      return
    }

    const outcome = await enableOwnerPush(preparation, {
      requestPermission: requestPushPermission,
      subscribe: subscribePreparedPush,
      register: async (data) => {
        await registerOwnerPushSubscriptionFn({ data })
      },
      refreshStatus: async (subscription) => {
        const status = await getOwnerPushStatusFn({ data: { endpoint: subscription.endpoint } })
        return status.subscribed
      },
    })

    if (outcome.status === 'enabled') {
      onChanged?.()
      if (outcome.statusError) {
        updateStatus('active')
        setErrorState((current) => applyPushStatusError(
          current,
          publicErrorMessage(outcome.statusError, 'Push is aangezet, maar de status kon niet opnieuw worden gecontroleerd.'),
        ))
        return
      }
      if (outcome.subscribed) {
        updateStatus('active')
        setFeedback('Pushmeldingen staan aan op dit apparaat.')
        return
      }
      updateStatus('local-unregistered')
      setErrorState((current) => failPushUiAction(current, 'De pushregistratie is opgeslagen, maar de pushstatus is niet actief. Probeer het opnieuw.'))
      return
    }

    if (outcome.status === 'denied') {
      updateStatus('denied')
      return
    }
    if (outcome.status === 'default') {
      updateStatus('permission-needed')
      return
    }
    if (outcome.status === 'not-ready') {
      updateStatus('unknown')
      setErrorState((current) => failPushUiAction(current, preparationError || 'Push is nog niet klaar. Probeer het opnieuw.'))
      return
    }

    if (outcome.error instanceof PushKeyMismatchError) {
      updateStatus('key-conflict')
      setErrorState((current) => failPushUiAction(current, PUSH_KEY_MISMATCH_MESSAGE))
      return
    }
    if (getPushPermission() === 'denied') {
      updateStatus('denied')
      return
    }
    updateStatus('unknown')
    setErrorState((current) => failPushUiAction(current, publicErrorMessage(outcome.error, 'Meldingen konden niet worden aangezet.')))
    refresh('after-action')
  }

  const disable = async () => {
    setErrorState(beginPushUiAction())
    setFeedback('')
    updateStatus('working')
    try {
      const outcome = await deactivateOwnerPushRegistration({
        resolveEndpoint: getCurrentEndpoint,
        getStatus: async (endpoint) => getOwnerPushStatusFn({ data: { endpoint } }),
        unregisterServer: async (id) => {
          await unregisterOwnerPushSubscriptionFn({ data: { id } })
        },
        unsubscribeBrowser: unsubscribeBrowserSubscription,
      })

      if (outcome.status === 'disabled') {
        updateStatus('inactive')
        setFeedback('Pushmeldingen staan uit op dit apparaat.')
        onChanged?.()
        refresh('after-action')
        return
      }
      if (outcome.status === 'endpoint-missing') {
        updateStatus('unknown')
        setErrorState((current) => failPushUiAction(current, 'Het pushapparaat kon niet worden bepaald. Probeer het opnieuw.'))
        refresh('after-action')
        return
      }
      if (outcome.status === 'server-failed') {
        updateStatus('active')
        setErrorState((current) => failPushUiAction(current, publicErrorMessage(outcome.error, 'Meldingen konden niet worden uitgezet.')))
        refresh('after-action')
        return
      }

      updateStatus('unknown')
      setErrorState((current) => failPushUiAction(current, 'De serverregistratie is uitgeschakeld, maar het apparaat kon niet volledig worden losgekoppeld. Probeer het opnieuw.'))
      onChanged?.()
      refresh('after-action')
    } catch (caught) {
      updateStatus('unknown')
      setErrorState((current) => failPushUiAction(current, publicErrorMessage(caught, 'Meldingen konden niet worden uitgezet.')))
      refresh('after-action')
    }
  }

  const view = getPushOptInView(status, visiblePushUiError(errorState), feedback)

  const enableExplanation =
    view.state === 'local-unregistered'
      ? 'Dit apparaat heeft push, maar de registratie voor de eigenaar ontbreekt. Zet meldingen opnieuw aan.'
      : 'Ontvang een melding op dit apparaat zodra iemand de wachtrij binnenkomt, de wachtrij verlaat of er een afspraak geboekt of geannuleerd wordt.'

  return <>
    {view.state === 'preparing' && <p className="lead">Pushstatus controleren...</p>}
    {view.state === 'unsupported' && <p className="queue-explanation">Dit apparaat of deze browser ondersteunt geen pushmeldingen. Je meldingen blijven zichtbaar in de notificatiebel.</p>}
    {view.state === 'denied' && <p className="queue-explanation">Meldingen zijn geblokkeerd in de browser. Pas dit aan in de browserinstellingen als je meldingen wilt ontvangen.</p>}
    {view.state === 'key-conflict' && <p className="queue-explanation">Je pushabonnement op dit apparaat gebruikt een andere sleutel dan de app verwacht.</p>}
    {view.state === 'unknown' && <p className="queue-explanation">De pushstatus kon niet volledig worden bepaald.</p>}
    {view.canEnable && <>
      <p className="queue-explanation">{enableExplanation}</p>
      {preparationStatus === 'error'
        ? <Button onClick={retryPreparation}>Opnieuw proberen</Button>
        : <Button onClick={() => void enable()} disabled={preparationStatus !== 'ready'}>
          <BellRing size={17} aria-hidden="true" /> {preparationStatus === 'loading' ? 'Voorbereiden...' : 'Meldingen aanzetten'}
        </Button>}
      {preparationStatus === 'error' && <p className="form-error" role="alert">{preparationError}</p>}
    </>}
    {view.canRetry && <Button onClick={() => refresh('initial')}>Opnieuw proberen</Button>}
    {view.state === 'working' && <p className="lead">Bezig...</p>}
    {view.state === 'active' && <>
      <p className="queue-explanation">Pushmeldingen staan aan op dit apparaat.</p>
      <button type="button" className="leave-queue" onClick={() => void disable()}><BellOff size={15} aria-hidden="true" /> Meldingen uitzetten</button>
    </>}
    {view.error && <p className="form-error" role="alert">{view.error}</p>}
    {view.feedback && <p className="success-message" role="status">{view.feedback}</p>}
  </>
}
