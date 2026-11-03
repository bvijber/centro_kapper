import { BellOff, BellRing } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { publicErrorMessage } from './publicError'
import { Button } from './Button'
import { Card } from './Card'
import {
  applyPushStatusError,
  beginPushUiAction,
  deactivateCustomerPushRegistration,
  enableCustomerPush,
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
  getPushBrowserSnapshot,
  getCurrentEndpoint,
  getPushPermission,
  isPushSupported,
  PUSH_KEY_MISMATCH_MESSAGE,
  PushKeyMismatchError,
  requestPushPermission,
  subscribePreparedPush,
  unsubscribeBrowserSubscription,
} from '../pwa/push-client'
import {
  getPushConfigFn,
  getPushSubscriptionStatusFn,
  registerPushSubscriptionFn,
  unregisterPushSubscriptionFn,
} from '../push/push.functions'

export function PushOptIn({ entryId, capability }: { entryId: string; capability?: string }) {
  const [status, setStatus] = useState<PushOptInStatus>('preparing')
  const [errorState, setErrorState] = useState<PushUiErrorState>(beginPushUiAction)
  const [feedback, setFeedback] = useState('')
  const statusRef = useRef<PushOptInStatus>('preparing')
  const {
    status: preparationStatus,
    preparation,
    error: preparationError,
    retry: retryPreparation,
  } = usePushEnablePreparation(getPushConfigFn)

  const updateStatus = useCallback((next: PushOptInStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const applyResolution = useCallback((
    resolution: ReturnType<typeof resolvePushStatus>,
    mode: 'initial' | 'refresh' | 'after-action',
  ) => {
    // Bij een achtergrondcontrole mag een onbekende uitslag de laatst bekende
    // status niet vervangen door `unknown`. Markeer hooguit als verouderd.
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
      scope: 'customer',
      supported,
      permission,
      preparation: preparationStatus,
      browser: { status: 'no-subscription', endpoint: null },
      server: { status: 'not-registered' },
    }), mode)

    if (!supported || permission !== 'granted') {
      shortCircuit()
      return
    }

    const publicKey = preparation?.status === 'ready' ? preparation.publicKey : null
    const [browserSettled, serverSettled] = await Promise.allSettled([
      getPushBrowserSnapshot(publicKey),
      getPushSubscriptionStatusFn({ data: { queueEntryId: entryId, ...(capability ? { capability } : {}) } }),
    ])

    const browser = browserSettled.status === 'fulfilled'
      ? browserSettled.value
      : { status: 'unknown', endpoint: null, error: browserSettled.reason } as const
    const server: PushServerObservation = serverSettled.status === 'fulfilled'
      ? (serverSettled.value.subscribed ? { status: 'registered' } : { status: 'not-registered' })
      : { status: 'unknown', error: serverSettled.reason }

    applyResolution(resolvePushStatus({
      scope: 'customer',
      supported,
      permission,
      preparation: preparationStatus,
      browser,
      server,
    }), mode)
  }, [entryId, capability, preparation, preparationStatus, applyResolution])

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

    const outcome = await enableCustomerPush(preparation, {
      entryId,
      ...(capability ? { capability } : {}),
      requestPermission: requestPushPermission,
      subscribe: subscribePreparedPush,
      register: async (data) => {
        await registerPushSubscriptionFn({ data })
      },
      refreshStatus: async () => {
        const status = await getPushSubscriptionStatusFn({
          data: {
            queueEntryId: entryId,
            ...(capability ? { capability } : {}),
          },
        })
        return status.subscribed
      },
    })

    if (outcome.status === 'enabled') {
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
        setFeedback('Pushmeldingen zijn aangezet voor je wachtrij.')
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
      const outcome = await deactivateCustomerPushRegistration({
        entryId,
        ...(capability ? { capability } : {}),
        resolveEndpoint: getCurrentEndpoint,
        unregisterServer: async (data) => {
          await unregisterPushSubscriptionFn({ data })
        },
        unsubscribeBrowser: unsubscribeBrowserSubscription,
      })

      if (outcome.status === 'disabled') {
        updateStatus('inactive')
        setFeedback('Pushmeldingen staan uit op dit apparaat.')
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
      refresh('after-action')
    } catch (caught) {
      updateStatus('unknown')
      setErrorState((current) => failPushUiAction(current, publicErrorMessage(caught, 'Meldingen konden niet worden uitgezet.')))
      refresh('after-action')
    }
  }

  const view = getPushOptInView(status, visiblePushUiError(errorState), feedback)

  const enableExplanation =
    view.state === 'registered-not-local'
      ? 'Push staat geregistreerd voor je wachtrij, maar niet op dit apparaat. Zet meldingen op dit apparaat aan.'
      : view.state === 'local-unregistered'
        ? 'Dit apparaat heeft push, maar de registratie voor deze wachtrij ontbreekt. Zet meldingen opnieuw aan.'
        : 'Ontvang een melding zodra je aan de beurt bent.'

  return <Card className="queue-push-optin">
    <p className="eyebrow">PUSHMELDINGEN</p>
    {view.state === 'preparing' && <p className="lead">Pushstatus controleren...</p>}
    {view.state === 'unsupported' && <p className="queue-explanation">Dit apparaat of deze browser ondersteunt geen pushmeldingen. Je plek in de wachtrij blijft zichtbaar op deze pagina.</p>}
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
      <p className="queue-explanation">Pushmeldingen zijn geregistreerd voor je wachtrij. Dit apparaat heeft een pushabonnement.</p>
      <button type="button" className="leave-queue" onClick={() => void disable()}><BellOff size={15} aria-hidden="true" /> Meldingen uitzetten</button>
    </>}
    {view.error && <p className="form-error" role="alert">{view.error}</p>}
    {view.feedback && <p className="success-message" role="status">{view.feedback}</p>}
  </Card>
}
