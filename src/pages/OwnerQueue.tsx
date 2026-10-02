import { useEffect, useState } from 'react'
import { listBookableServicesFn } from '../appointments/appointment.functions'
import { cancelQueueEntryFn, callQueueEntryFn, completeQueueEntryFn, joinQueueFn, listStaffQueueFn, rejoinQueueEntryFn, skipQueueEntryFn, startQueueServiceFn } from '../queue/queue.functions'
import type { QueueEntryDTO } from '../queue/queue.service.server'
import { formatAmsterdamDateKey, formatAmsterdamTime } from '../timezone'
import { Card } from '../components/Card'
import { StaffBottomNav } from '../components/StaffBottomNav'
import { Button } from '../components/Button'

export function OwnerQueue() {
  const [entries, setEntries] = useState<QueueEntryDTO[]>([])
  const [services, setServices] = useState<Array<{ id: string; name: string }>>([])
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const load = async () => { const date = formatAmsterdamDateKey(new Date()); const [queue, available] = await Promise.all([listStaffQueueFn({ data: { queueDate: date } }), listBookableServicesFn({ data: undefined })]); setEntries(queue); setServices(available); setServiceId((current) => current || available[0]?.id || '') }
  useEffect(() => { void load().catch(() => setError('De wachtrij kon niet worden geladen.')) }, [])
  const action = async (work: () => Promise<unknown>, text: string) => { try { await work(); await load(); setMessage(text); setError('') } catch { setError('De actie kon niet worden uitgevoerd.') } }
  const addWalkIn = async () => { if (!guestName.trim() || !guestPhone.trim() || !serviceId) return setError('Naam, telefoon en service zijn verplicht.'); await action(() => joinQueueFn({ data: { serviceId, guestName: guestName.trim(), guestPhone: guestPhone.trim() } }), 'Walk-in toegevoegd.'); setGuestName(''); setGuestPhone('') }
  return <main className="page shell staff-page"><p className="eyebrow">CENTRO KAPPER · EIGENAAR</p><h1 className="staff-title">Wachtrij<br /><em>beheren.</em></h1>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="success-message" role="status">{message}</p>}<Card><p className="eyebrow">WALK-IN TOEVOEGEN</p><label>Naam<input value={guestName} onChange={(event) => setGuestName(event.target.value)} /></label><label>Telefoon<input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} /></label><label>Service<select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><Button onClick={() => void addWalkIn()}>Toevoegen</Button></Card><div className="staff-queue-list">{entries.map((entry, index) => <Card key={entry.id}><strong>{index + 1}. {entry.guestName ?? 'Customer'}</strong><p>{entry.serviceName} · {entry.status} · {formatAmsterdamTime(entry.joinedAt)}</p>{entry.status === 'waiting' && <><button onClick={() => void action(() => callQueueEntryFn({ data: { id: entry.id } }), 'Klant opgeroepen.')}>Oproepen</button><button onClick={() => void action(() => cancelQueueEntryFn({ data: { id: entry.id } }), 'Entry geannuleerd.')}>Annuleren</button></>}{entry.status === 'called' && <><button onClick={() => void action(() => startQueueServiceFn({ data: { id: entry.id, status: 'in_service' } }), 'Behandeling gestart.')}>Start</button><button onClick={() => void action(() => skipQueueEntryFn({ data: { id: entry.id } }), 'Entry overgeslagen.')}>Overslaan</button></>}{entry.status === 'in_service' && <><button onClick={() => void action(() => completeQueueEntryFn({ data: { id: entry.id } }), 'Entry afgerond.')}>Afronden</button><button onClick={() => void action(() => cancelQueueEntryFn({ data: { id: entry.id } }), 'Entry geannuleerd.')}>Annuleren</button></>}{entry.status === 'skipped' && <button onClick={() => void action(() => rejoinQueueEntryFn({ data: { id: entry.id } }), 'Nieuwe queue-entry aangemaakt.')}>Opnieuw achteraan</button>}</Card>)}</div><StaffBottomNav /></main>
}
