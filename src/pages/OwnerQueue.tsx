import { useEffect, useState } from 'react'
import { listBookableServicesFn } from '../appointments/appointment.functions'
import { cancelQueueEntryFn, callQueueEntryFn, completeQueueEntryFn, joinQueueFn, listOwnerQueueFn, rejoinQueueEntryFn, skipQueueEntryFn, startQueueServiceFn } from '../queue/queue.functions'
import type { QueueEntryDTO } from '../queue/queue.service.server'
import { formatAmsterdamDateKey, formatAmsterdamTime } from '../timezone'
import { Card } from '../components/Card'
import { OwnerBottomNav } from '../components/OwnerBottomNav'
import { Button } from '../components/Button'

export function OwnerQueue() {
  const [entries, setEntries] = useState<QueueEntryDTO[]>([])
  const [services, setServices] = useState<Array<{ id: string; name: string }>>([])
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = async () => {
    setLoading(true)
    try {
      const date = formatAmsterdamDateKey(new Date())
      const [queue, available] = await Promise.all([listOwnerQueueFn({ data: { queueDate: date } }), listBookableServicesFn({ data: undefined })])
      setEntries(queue)
      setServices(available)
      setServiceId((current) => current || available[0]?.id || '')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load().catch(() => setError('De wachtrij kon niet worden geladen.')) }, [])
  const action = async (work: () => Promise<unknown>, text: string) => { try { await work(); await load(); setMessage(text); setError('') } catch { setError('De actie kon niet worden uitgevoerd.') } }
  const addWalkIn = async () => { if (!guestName.trim() || !guestPhone.trim() || !serviceId) return setError('Naam, telefoon en service zijn verplicht.'); await action(() => joinQueueFn({ data: { serviceId, guestName: guestName.trim(), guestPhone: guestPhone.trim() } }), 'Walk-in toegevoegd.'); setGuestName(''); setGuestPhone('') }
  return <main className="page shell staff-page owner-queue-page">
    <p className="eyebrow">CENTRO KAPPER · EIGENAAR</p>
    <h1 className="staff-title">Wachtrij<br /><em>beheren.</em></h1>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="success-message" role="status">{message}</p>}
    <Card className="owner-queue-form">
      <p className="eyebrow">WALK-IN TOEVOEGEN</p>
      <label>Naam<input value={guestName} onChange={(event) => setGuestName(event.target.value)} /></label>
      <label>Telefoon<input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} /></label>
      <label>Service<select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
      <Button onClick={() => void addWalkIn()} disabled={loading || !serviceId}>Toevoegen</Button>
    </Card>
    {loading ? <Card className="queue-loading"><div className="spinner" /><h2>Wachtrij laden...</h2><p>Een moment, we halen de actuele informatie op.</p></Card> : entries.length === 0 ? <Card className="empty-state owner-queue-empty"><p className="eyebrow">GEEN WACHTRIJ</p><p>Er staan vandaag nog geen klanten in de wachtrij.</p><small>Voeg een walk-in toe om de wachtrij te starten.</small></Card> : <div className="staff-queue-list">
      {entries.map((entry, index) => <Card className="owner-queue-entry" key={entry.id}>
        <div className="owner-queue-entry-header"><strong>{index + 1}. {entry.guestName ?? 'Customer'}</strong><span className="queue-status-label">{entry.status.replace('_', ' ')}</span></div>
        <p>{entry.serviceName} · {formatAmsterdamTime(entry.joinedAt)}</p>
        <div className="appointment-actions">
          {entry.status === 'waiting' && <><button type="button" onClick={() => void action(() => callQueueEntryFn({ data: { id: entry.id } }), 'Klant opgeroepen.')}>Oproepen</button><button type="button" onClick={() => void action(() => cancelQueueEntryFn({ data: { id: entry.id } }), 'Entry geannuleerd.')}>Annuleren</button></>}
          {entry.status === 'called' && <><button type="button" onClick={() => void action(() => startQueueServiceFn({ data: { id: entry.id, status: 'in_service' } }), 'Behandeling gestart.')}>Start</button><button type="button" onClick={() => void action(() => skipQueueEntryFn({ data: { id: entry.id } }), 'Entry overgeslagen.')}>Overslaan</button></>}
          {entry.status === 'in_service' && <><button type="button" onClick={() => void action(() => completeQueueEntryFn({ data: { id: entry.id } }), 'Entry afgerond.')}>Afronden</button><button type="button" onClick={() => void action(() => cancelQueueEntryFn({ data: { id: entry.id } }), 'Entry geannuleerd.')}>Annuleren</button></>}
          {entry.status === 'skipped' && <button type="button" onClick={() => void action(() => rejoinQueueEntryFn({ data: { id: entry.id } }), 'Nieuwe queue-entry aangemaakt.')}>Opnieuw achteraan</button>}
        </div>
      </Card>)}
    </div>}
    <OwnerBottomNav />
  </main>
}
