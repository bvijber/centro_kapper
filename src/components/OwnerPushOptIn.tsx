import { BellOff, BellRing } from 'lucide-react'
import { useEffect, useState } from 'react'

import { publicErrorMessage } from './publicError'
import { Button } from './Button'
import {
  getCurrentEndpoint,
  getPushPermission,
  isPushSupported,
  requestPermissionAndSubscribe,
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
type OwnerPushOptInState = 'loading' | 'unsupported' | 'denied' | 'off' | 'on' | 'working' | 'error'

export function OwnerPushOptIn({ onChanged }: { onChanged?: () => void }) {
  const [state, setState] = useState<OwnerPushOptInState>('loading')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    let active = true
    setState('loading')
    setError('')
    setFeedback('')
    if (!isPushSupported()) {
      setState('unsupported')
      return
    }
    if (getPushPermission() === 'denied') {
      setState('denied')
      return
    }
    void (async () => {
      try {
        const endpoint = await getCurrentEndpoint()
        if (!endpoint) {
          if (active) setState('off')
          return
        }
        const status = await getOwnerPushStatusFn({ data: { endpoint } })
        if (active) setState(status.subscribed ? 'on' : 'off')
      } catch (caught) {
        if (active) {
          setState('error')
          setError(publicErrorMessage(caught, 'De pushstatus kon niet worden geladen.'))
        }
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const enable = async () => {
    setError('')
    setFeedback('')
    setState('working')
    try {
      const config = await getOwnerPushConfigFn()
      if (!config.publicKey) {
        setState('error')
        setError('Push is nog niet beschikbaar. Probeer het later opnieuw.')
        return
      }
      const subscription = await requestPermissionAndSubscribe(config.publicKey)
      await registerOwnerPushSubscriptionFn({
        data: {
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      })
      setState('on')
      setFeedback('Pushmeldingen staan aan op dit apparaat.')
      onChanged?.()
    } catch (caught) {
      if (getPushPermission() === 'denied') {
        setState('denied')
        return
      }
      setState('off')
      setError(publicErrorMessage(caught, 'Meldingen konden niet worden aangezet.'))
    }
  }

  const disable = async () => {
    setError('')
    setFeedback('')
    setState('working')
    try {
      const endpoint = await getCurrentEndpoint()
      if (endpoint) {
        const status = await getOwnerPushStatusFn({ data: { endpoint } })
        if (status.id) {
          await unregisterOwnerPushSubscriptionFn({ data: { id: status.id } })
        }
      }
      await unsubscribeBrowserSubscription()
      setState('off')
      setFeedback('Pushmeldingen staan uit op dit apparaat.')
      onChanged?.()
    } catch (caught) {
      setState('on')
      setError(publicErrorMessage(caught, 'Meldingen konden niet worden uitgezet.'))
    }
  }

  if (state === 'loading') return <p className="lead">Pushstatus laden...</p>
  if (state === 'unsupported') {
    return <p className="queue-explanation">Dit apparaat of deze browser ondersteunt geen pushmeldingen. Je meldingen blijven zichtbaar in de notificatiebel.</p>
  }
  if (state === 'denied') {
    return <p className="queue-explanation">Meldingen zijn geblokkeerd in de browser. Pas dit aan in de browserinstellingen als je meldingen wilt ontvangen.</p>
  }
  if (state === 'working') return <p className="lead">Bezig...</p>

  return <>
    {state === 'off' && <>
      <p className="queue-explanation">Ontvang een melding op dit apparaat zodra iemand de wachtrij binnenkomt, de wachtrij verlaat of er een afspraak geboekt of geannuleerd wordt.</p>
      <Button onClick={() => void enable()}><BellRing size={17} aria-hidden="true" /> Meldingen aanzetten</Button>
    </>}
    {state === 'on' && <>
      <p className="queue-explanation">Pushmeldingen staan aan op dit apparaat.</p>
      <button type="button" className="leave-queue" onClick={() => void disable()}><BellOff size={15} aria-hidden="true" /> Meldingen uitzetten</button>
    </>}
    {state === 'error' && <p className="form-error" role="alert">{error || 'Er ging iets mis.'}</p>}
    {feedback && state !== 'error' && <p className="success-message" role="status">{feedback}</p>}
  </>
}
