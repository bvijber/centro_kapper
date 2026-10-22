import { BellOff, BellRing } from 'lucide-react'
import { useEffect, useState } from 'react'

import { publicErrorMessage } from './publicError'
import { Button } from './Button'
import { Card } from './Card'
import {
  getCurrentEndpoint,
  getPushPermission,
  isPushSupported,
  requestPermissionAndSubscribe,
  unsubscribeBrowserSubscription,
} from '../pwa/push-client'
import {
  getPushConfigFn,
  getPushSubscriptionStatusFn,
  registerPushSubscriptionFn,
  unregisterPushSubscriptionFn,
} from '../push/push.functions'

type PushOptInState = 'loading' | 'unsupported' | 'denied' | 'off' | 'on' | 'working' | 'error'

export function PushOptIn({ entryId, capability }: { entryId: string; capability?: string }) {
  const [state, setState] = useState<PushOptInState>('loading')
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
    void getPushSubscriptionStatusFn({ data: { queueEntryId: entryId, ...(capability ? { capability } : {}) } })
      .then((result) => {
        if (active) setState(result.subscribed ? 'on' : 'off')
      })
      .catch((caught) => {
        if (active) {
          setState('error')
          setError(publicErrorMessage(caught, 'Pushstatus kon niet worden geladen.'))
        }
      })
    return () => {
      active = false
    }
  }, [entryId, capability])

  const enable = async () => {
    setError('')
    setFeedback('')
    setState('working')
    try {
      const config = await getPushConfigFn()
      if (!config.publicKey) {
        setState('error')
        setError('Push is nog niet beschikbaar. Probeer het later opnieuw.')
        return
      }
      const subscription = await requestPermissionAndSubscribe(config.publicKey)
      await registerPushSubscriptionFn({
        data: {
          queueEntryId: entryId,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          ...(capability ? { capability } : {}),
        },
      })
      setState('on')
      setFeedback('Pushmeldingen staan aan op dit apparaat.')
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
      const subscription = await unregisterPushSubscriptionFn({
        data: {
          queueEntryId: entryId,
          endpoint: await getCurrentEndpoint(),
          ...(capability ? { capability } : {}),
        },
      }).catch(() => null)
      await unsubscribeBrowserSubscription()
      setState('off')
      setFeedback('Pushmeldingen staan uit op dit apparaat.')
    } catch (caught) {
      setState('on')
      setError(publicErrorMessage(caught, 'Meldingen konden niet worden uitgezet.'))
    }
  }

  return <Card className="queue-push-optin">
    <p className="eyebrow">PUSHMELDINGEN</p>
    {state === 'loading' && <p className="lead">Pushstatus laden...</p>}
    {state === 'unsupported' && <p className="queue-explanation">Dit apparaat of deze browser ondersteunt geen pushmeldingen. Je plek in de wachtrij blijft zichtbaar op deze pagina.</p>}
    {state === 'denied' && <p className="queue-explanation">Meldingen zijn geblokkeerd in de browser. Pas dit aan in de browserinstellingen als je meldingen wilt ontvangen.</p>}
    {state === 'off' && <>
      <p className="queue-explanation">Ontvang een melding zodra je aan de beurt bent.</p>
      <Button onClick={() => void enable()}><BellRing size={17} aria-hidden="true" /> Meldingen aanzetten</Button>
    </>}
    {state === 'working' && <p className="lead">Bezig...</p>}
    {state === 'on' && <>
      <p className="queue-explanation">Pushmeldingen staan aan op dit apparaat.</p>
      <button type="button" className="leave-queue" onClick={() => void disable()}><BellOff size={15} aria-hidden="true" /> Meldingen uitzetten</button>
    </>}
    {state === 'error' && <p className="form-error" role="alert">{error || 'Er ging iets mis.'}</p>}
    {feedback && state !== 'error' && <p className="success-message" role="status">{feedback}</p>}
  </Card>
}
