import { AlertCircle, CheckCircle2, Clock3, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getCurrentUserFn } from '../auth/auth.functions'
import { getQueueEntryFn, getQueueEntryPositionFn, joinQueueFn, leaveQueueFn, listCustomerQueueFn } from '../queue/queue.functions'
import { listBookableServicesFn } from '../appointments/appointment.functions'
import type { QueueEntryDTO, QueueEntryMetadata } from '../queue/queue.service.server'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { CustomerHeader } from '../components/CustomerHeader'
import { BottomNav } from '../components/BottomNav'
import { formatAmsterdamDateKey, formatAmsterdamTime } from '../timezone'

const GUEST_QUEUE_ENTRY_KEY = 'centro-kapper:queue-entry-id'
const ACTIVE_STATUSES = new Set(['waiting', 'called', 'in_service'])

type Service = { id: string; name: string; description: string; durationMinutes: number; priceCents: number }
type User = { id: string; role: 'customer' | 'staff' } | null

function errorMessage(caught: unknown): string {
  return String(caught).replace(/^Error:\s*/, '')
}

function isActive(entry: QueueEntryDTO | null): boolean {
  return entry !== null && ACTIVE_STATUSES.has(entry.status)
}

export function Queue() {
  const [user, setUser] = useState<User>(null)
  const [services, setServices] = useState<Service[]>([])
  const [entry, setEntry] = useState<QueueEntryDTO | null>(null)
  const [metadata, setMetadata] = useState<QueueEntryMetadata | null>(null)
  const [serviceId, setServiceId] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingServices, setLoadingServices] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadEntry = async (currentUser: User) => {
    setLoading(true)
    setError('')
    try {
      let restored: QueueEntryDTO | null = null
      if (currentUser?.role === 'customer') {
        const entries = await listCustomerQueueFn({ data: { queueDate: formatAmsterdamDateKey(new Date()) } })
        const candidate = entries.find((item) => isActive(item)) ?? entries.find((item) => item.status === 'completed')
        restored = candidate ? await getQueueEntryFn({ data: { id: candidate.id } }) : null
      } else if (!currentUser && typeof window !== 'undefined') {
        const id = window.localStorage.getItem(GUEST_QUEUE_ENTRY_KEY)
        if (id) restored = await getQueueEntryFn({ data: { id } })
      }
      setEntry(restored)
      if (restored && isActive(restored)) {
        setMetadata(await getQueueEntryPositionFn({ data: { id: restored.id } }))
      } else {
        setMetadata(null)
      }
    } catch (caught) {
      if (!currentUser && typeof window !== 'undefined') window.localStorage.removeItem(GUEST_QUEUE_ENTRY_KEY)
      setEntry(null)
      setMetadata(null)
      setError(errorMessage(caught) || 'Queue-informatie kon niet worden geladen.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void Promise.all([
      getCurrentUserFn().then((currentUser) => {
        const resolved = currentUser ? { id: currentUser.id, role: currentUser.role } as User : null
        setUser(resolved)
        return loadEntry(resolved)
      }).catch(() => loadEntry(null)),
      listBookableServicesFn({ data: undefined }).then((result) => {
        setServices(result)
        setServiceId(result[0]?.id ?? '')
      }).catch(() => setError('Diensten konden niet worden geladen.')).finally(() => setLoadingServices(false)),
    ])
  }, [])

  const reload = async () => loadEntry(user)

  const handleJoin = async () => {
    setError('')
    setSuccess('')
    setSubmitting(true)
    try {
      const created = await joinQueueFn({ data: {
        serviceId,
        ...(user ? {} : { guestName: guestName.trim(), guestPhone: guestPhone.trim() }),
        ...(note.trim() ? { note: note.trim() } : {}),
      } })
      if (!user && typeof window !== 'undefined') window.localStorage.setItem(GUEST_QUEUE_ENTRY_KEY, created.id)
      setEntry(created)
      setMetadata(await getQueueEntryPositionFn({ data: { id: created.id } }))
      setSuccess('Je staat op de wachtrij.')
    } catch (caught) {
      setError(errorMessage(caught) || 'Je kon niet aan de wachtrij worden toegevoegd.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLeave = async () => {
    if (!entry) return
    setError('')
    setSuccess('')
    setLeaving(true)
    try {
      await leaveQueueFn({ data: { id: entry.id } })
      if (!user && typeof window !== 'undefined') window.localStorage.removeItem(GUEST_QUEUE_ENTRY_KEY)
      await reload()
      setSuccess('Je bent uit de wachtrij verwijderd.')
    } catch (caught) {
      setError(errorMessage(caught) || 'De wachtrij kon niet worden verlaten.')
    } finally {
      setLeaving(false)
    }
  }

  const active = isActive(entry)
  return <main className="page shell queue-page">
    <CustomerHeader />
    <div className="hero-copy"><p className="eyebrow">CENTRO KAPPER</p><h1>De<br /><em>wachtrij.</em></h1><p className="lead">Vandaag zonder afspraak langskomen? Sluit aan en houd je plek in de gaten.</p></div>
    {error && <p className="form-error" role="alert"><AlertCircle size={15} /> {error}</p>}
    {success && <p className="success-message" role="status">{success}</p>}
    {loading || loadingServices ? <Card className="queue-loading"><div className="spinner" /><h2>Wachtrij laden...</h2><p>Een moment, we halen de actuele informatie op.</p></Card> : active && entry && metadata ? <ActiveQueue entry={entry} metadata={metadata} leaving={leaving} onLeave={() => setLeaving(true)} onConfirmLeave={() => void handleLeave()} onCancelLeave={() => setLeaving(false)} /> : entry?.status === 'completed' ? <CompletedQueue /> : <NotJoined services={services} serviceId={serviceId} setServiceId={setServiceId} guest={user === null} guestName={guestName} setGuestName={setGuestName} guestPhone={guestPhone} setGuestPhone={setGuestPhone} note={note} setNote={setNote} submitting={submitting} onJoin={() => void handleJoin()} />}
    {user && <BottomNav />}
  </main>
}

function NotJoined({ services, serviceId, setServiceId, guest, guestName, setGuestName, guestPhone, setGuestPhone, note, setNote, submitting, onJoin }: { services: Service[]; serviceId: string; setServiceId: (value: string) => void; guest: boolean; guestName: string; setGuestName: (value: string) => void; guestPhone: string; setGuestPhone: (value: string) => void; note: string; setNote: (value: string) => void; submitting: boolean; onJoin: () => void }) {
  return <>
    <Card className="queue-summary"><UsersRound /><div><span>Actieve wachtrij</span><strong>Sluit vandaag aan</strong><small>Je positie en wachttijd worden server-side berekend.</small></div></Card>
    <p className="queue-explanation">Meld je aan voor de wachtrij en ontvang in de app een actuele indicatie van je plek.</p>
    <label className="queue-field">Gekozen service<select value={serviceId} onChange={(event) => setServiceId(event.target.value)} disabled={services.length === 0}>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {guest && <><label className="queue-field">Naam *<input value={guestName} onChange={(event) => setGuestName(event.target.value)} /></label><label className="queue-field">Telefoonnummer *<input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} type="tel" /></label></>}
    <label className="queue-field">Notitie <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optioneel bericht voor de barber" rows={3} /></label>
    <Button onClick={onJoin} disabled={submitting || !serviceId}>{submitting ? 'Bezig...' : 'Aansluiten bij wachtrij'}</Button>
    <Card className="queue-note"><Clock3 /><div><b>Actuele queue-informatie</b><p>De actuele wachtrij wordt door de server bijgehouden.</p></div></Card>
  </>
}

function ActiveQueue({ entry, metadata, leaving, onLeave, onConfirmLeave, onCancelLeave }: { entry: QueueEntryDTO; metadata: QueueEntryMetadata; leaving: boolean; onLeave: () => void; onConfirmLeave: () => void; onCancelLeave: () => void }) {
  const called = entry.status === 'called'
  const inService = entry.status === 'in_service'
  return <>
    <Card className={`active-queue ${called || inService ? 'ready-queue' : ''}`}><CheckCircle2 /><p className="eyebrow">{called ? 'JE BENT AAN DE BEURT' : inService ? 'IN BEHANDELING' : 'BEVESTIGD'}</p><h2>{called ? 'Kom naar de barberstoel.' : inService ? 'Je behandeling is gestart.' : 'Je staat op de wachtrij'}</h2><p>{called ? 'We staan voor je klaar. Loop naar binnen en neem plaats in de stoel.' : 'Blijf in de buurt van Centro Kapper. Je status wordt server-side bijgehouden.'}</p><div className="queue-position"><span>JOUW POSITIE</span><strong>{called || inService ? 'Nu' : String(metadata.position).padStart(2, '0')}</strong><small>{called || inService ? 'Aan de beurt' : `${metadata.count} wachtenden voor je`}</small></div><div className="progress"><i /></div><div className="active-details"><span>Service <b>{entry.serviceName}</b></span><span>Aangesloten om <b>{formatAmsterdamTime(entry.joinedAt)}</b></span><span>Geschatte wachttijd <b>{called || inService ? 'Nu' : `± ${metadata.estimatedWaitMinutes} min`}</b></span></div></Card>
    <button className="leave-queue" onClick={onLeave} disabled={leaving}>{leaving ? 'Bezig...' : 'Wachtrij verlaten'}</button>
    {leaving && <div className="confirm-backdrop"><Card className="confirm-dialog"><h2>Wachtrij verlaten?</h2><p>Je huidige plek wordt beëindigd. Je kunt later opnieuw aansluiten.</p><div className="modal-actions"><button className="cancel-modal" onClick={onCancelLeave}>Behouden</button><Button onClick={onConfirmLeave}>Verlaten</Button></div></Card></div>}
  </>
}

function CompletedQueue() {
  return <Card className="active-queue completed-queue"><CheckCircle2 /><p className="eyebrow">CENTRO KAPPER</p><h2>Je bent geholpen</h2><p>Deze wachtrij-entry is afgerond. Je kunt opnieuw aansluiten wanneer dat nodig is.</p></Card>
}
