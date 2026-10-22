import { AlertCircle, CheckCircle2, Clock3, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getCurrentUserFn } from '../auth/auth.functions'
import { getQueueEntryPositionFn, joinQueueFn, leaveQueueFn } from '../queue/queue.functions'
import { listBookableServicesFn } from '../appointments/appointment.functions'
import type { QueueEntryDTO, QueueEntryMetadata } from '../queue/queue.service.server'
import {
  GUEST_QUEUE_ENTRY_KEY,
  QueuePollScheduler,
  createRequestGuard,
  fetchQueueSnapshot,
  isQueueSnapshotEqual,
  resolveSelectedEntry,
  toSnapshotView,
  type QueueSnapshot,
  type QueueSnapshotView,
} from '../queue/queue.polling'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { CustomerHeader } from '../components/CustomerHeader'
import { PushOptIn } from '../components/PushOptIn'
import { BottomNav } from '../components/BottomNav'
import { formatAmsterdamTime } from '../timezone'
import { publicErrorMessage } from '../components/publicError'
const ACTIVE_STATUSES = new Set(['waiting', 'called', 'in_service'])

type Service = { id: string; name: string; description: string; durationMinutes: number; priceCents: number }
type User = { id: string; role: 'customer' | 'owner' } | null

function errorMessage(caught: unknown): string {
  return publicErrorMessage(caught)
}

function isActive(entry: QueueEntryDTO | null): boolean {
  return entry !== null && ACTIVE_STATUSES.has(entry.status)
}

export function Queue() {
  const [user, setUser] = useState<User>(null)
  const [services, setServices] = useState<Service[]>([])
  const [entry, setEntry] = useState<QueueEntryDTO | null>(null)
  const [entries, setEntries] = useState<QueueEntryDTO[]>([])
  const [guestEntries, setGuestEntries] = useState<Array<{ id: string; capability: string }>>([])
  const [metadata, setMetadata] = useState<QueueEntryMetadata | null>(null)
  const [metadataById, setMetadataById] = useState<Record<string, QueueEntryMetadata>>({})
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

  const mountedRef = useRef(true)
  const requestGuardRef = useRef(createRequestGuard())
  const lastAppliedRef = useRef<QueueSnapshotView | null>(null)
  const userRef = useRef(user)
  userRef.current = user
  const guestEntriesRef = useRef(guestEntries)
  guestEntriesRef.current = guestEntries
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const entryRef = useRef(entry)
  entryRef.current = entry

  useEffect(() => () => {
    mountedRef.current = false
  }, [])

  const applySnapshot = (snapshot: QueueSnapshot, opts?: { preserveSelection?: boolean }) => {
    const fallback = snapshot.entry
    const selected = opts?.preserveSelection
      ? (resolveSelectedEntry(entryRef.current?.id ?? null, snapshot.entries, fallback) ?? null)
      : fallback
    const selectedId = selected?.id ?? null
    const metadataForSelected = selectedId ? (snapshot.metadataById[selectedId] ?? null) : null
    const view = toSnapshotView(
      { entries: snapshot.entries, entry: selected, metadata: metadataForSelected, metadataById: snapshot.metadataById, storedGuestCaps: snapshot.storedGuestCaps },
      selectedId,
    )
    if (isQueueSnapshotEqual(lastAppliedRef.current, view)) return
    lastAppliedRef.current = view
    setEntries(snapshot.entries)
    setEntry(selected)
    setMetadata(metadataForSelected)
    setMetadataById(snapshot.metadataById)
  }

  const loadEntry = async (currentUser: User, opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false
    const loadId = requestGuardRef.current.start()
    const isCurrent = () => mountedRef.current && requestGuardRef.current.isCurrent(loadId)
    if (!silent) {
      setLoading(true)
      setError('')
    }
    try {
      const snapshot = await fetchQueueSnapshot(currentUser, guestEntriesRef.current)
      if (!isCurrent()) return
      if (!silent && snapshot.storedGuestCaps) setGuestEntries(snapshot.storedGuestCaps)
      applySnapshot(snapshot, { preserveSelection: silent })
    } catch (caught) {
      if (silent) throw caught
      if (!isCurrent()) return
      if (!currentUser && typeof window !== 'undefined') window.localStorage.removeItem(GUEST_QUEUE_ENTRY_KEY)
      setEntry(null)
      setMetadata(null)
      setMetadataById({})
      setError(errorMessage(caught) || 'Queue-informatie kon niet worden geladen.')
    } finally {
      if (!silent && isCurrent()) setLoading(false)
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

  const userKey = user ? `${user.role}:${user.id}` : 'guest'
  const guestKey = guestEntries.map((item) => item.id).join(',')
  const hasActiveEntry = entries.some((item) => isActive(item))

  useEffect(() => {
    if (!hasActiveEntry) return
    const scheduler = new QueuePollScheduler({
      load: () => loadEntry(userRef.current, { silent: true }),
      shouldContinue: () => mountedRef.current && entriesRef.current.some((item) => isActive(item)),
    })
    scheduler.start()
    return () => scheduler.stop()
  }, [userKey, guestKey, hasActiveEntry])

  const reload = async () => loadEntry(user)
  const selectEntry = async (selected: QueueEntryDTO) => {
    setEntry(selected)
    if (isActive(selected)) {
      const capability = guestEntries.find((item) => item.id === selected.id)?.capability
      setMetadata(await getQueueEntryPositionFn({ data: { id: selected.id, ...(capability ? { capability } : {}) } }))
    }
  }

  const handleJoin = async () => {
    setError('')
    setSuccess('')
    setSubmitting(true)
    requestGuardRef.current.start()
    try {
      const created = await joinQueueFn({ data: {
        serviceId,
        ...(user ? {} : { guestName: guestName.trim(), guestPhone: guestPhone.trim() }),
        ...(note.trim() ? { note: note.trim() } : {}),
      } })
      if (!user && typeof window !== 'undefined' && created.guestCapability) {
        const next = [...guestEntries, { id: created.id, capability: created.guestCapability }]
        window.localStorage.setItem(GUEST_QUEUE_ENTRY_KEY, JSON.stringify(next))
        setGuestEntries(next)
      }
      setEntry(created)
      setEntries((current) => [...current.filter((item) => item.id !== created.id), created])
      const position = await getQueueEntryPositionFn({ data: { id: created.id, ...(created.guestCapability ? { capability: created.guestCapability } : {}) } })
      setMetadata(position)
      setMetadataById((current) => ({ ...current, [created.id]: position }))
      setSuccess('Je staat op de wachtrij.')
    } catch (caught) {
      setError(errorMessage(caught) || 'Je kon niet aan de wachtrij worden toegevoegd.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLeave = async (target: QueueEntryDTO = entry as QueueEntryDTO) => {
    if (!target) return
    setError('')
    setSuccess('')
    setLeaving(true)
    requestGuardRef.current.start()
    try {
      await leaveQueueFn({ data: { id: target.id, ...(!user ? { capability: guestEntries.find((item) => item.id === target.id)?.capability } : {}) } })
       if (!user && typeof window !== 'undefined') {
         const next = guestEntries.filter((item) => item.id !== target.id)
         window.localStorage.setItem(GUEST_QUEUE_ENTRY_KEY, JSON.stringify(next))
         setGuestEntries(next)
       }
      await reload()
      setSuccess('Je bent uit de wachtrij verwijderd.')
    } catch (caught) {
      setError(errorMessage(caught) || 'De wachtrij kon niet worden verlaten.')
    } finally {
      setLeaving(false)
    }
  }

  const active = isActive(entry)
  const activeEntries = entries.filter((item) => isActive(item))
  return <main className="page shell queue-page">
    <CustomerHeader />
    <div className="hero-copy"><p className="eyebrow">CENTRO KAPPER</p><h1>De<br /><em>wachtrij.</em></h1><p className="lead">Vandaag zonder afspraak langskomen? Sluit aan en houd je plek in de gaten.</p></div>
     {error && <p className="form-error" role="alert"><AlertCircle size={15} /> {error}</p>}
     {success && <p className="success-message" role="status">{success}</p>}
      {entries.length > 1 && <Card className="queue-entry-list"><p className="eyebrow">MIJN AANMELDINGEN</p>{entries.map((item) => <button type="button" aria-pressed={entry?.id === item.id} key={item.id} className={entry?.id === item.id ? 'chosen' : ''} onClick={() => void selectEntry(item)}>{item.serviceName} · {item.status}</button>)}</Card>}
     {loading || loadingServices ? <Card className="queue-loading"><div className="spinner" /><h2>Wachtrij laden...</h2><p>Een moment, we halen de actuele informatie op.</p></Card> : activeEntries.length > 0 ? activeEntries.map((item) => <ActiveQueue key={item.id} entry={item} metadata={metadataById[item.id] ?? (item.id === entry?.id ? metadata : null)} leaving={leaving && item.id === entry?.id} onLeave={() => { setEntry(item); setLeaving(true) }} onConfirmLeave={() => void handleLeave(item)} onCancelLeave={() => setLeaving(false)} capability={item.customerUserId ? undefined : guestEntries.find((guest) => guest.id === item.id)?.capability} />) : entry?.status === 'completed' ? <CompletedQueue /> : <NotJoined services={services} serviceId={serviceId} setServiceId={setServiceId} guest={user === null} guestName={guestName} setGuestName={setGuestName} guestPhone={guestPhone} setGuestPhone={setGuestPhone} note={note} setNote={setNote} submitting={submitting} onJoin={() => void handleJoin()} />}
    {user && <BottomNav />}
  </main>
}

function NotJoined({ services, serviceId, setServiceId, guest, guestName, setGuestName, guestPhone, setGuestPhone, note, setNote, submitting, onJoin }: { services: Service[]; serviceId: string; setServiceId: (value: string) => void; guest: boolean; guestName: string; setGuestName: (value: string) => void; guestPhone: string; setGuestPhone: (value: string) => void; note: string; setNote: (value: string) => void; submitting: boolean; onJoin: () => void }) {
  return <>
    <Card className="queue-summary"><UsersRound /><div><span>Actieve wachtrij</span><strong>Sluit vandaag aan</strong><small>Je positie en wachttijd worden server-side berekend.</small></div></Card>
    <p className="queue-explanation">Meld je aan voor de wachtrij en ontvang in de app een actuele indicatie van je plek.</p>
    <label className="queue-field">Gekozen service<select value={serviceId} onChange={(event) => setServiceId(event.target.value)} disabled={services.length === 0}>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {guest && <><label className="queue-field">Naam *<input value={guestName} onChange={(event) => setGuestName(event.target.value)} /></label><label className="queue-field">Telefoonnummer *<input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} type="tel" /></label></>}
    <label className="queue-field">Notitie <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optioneel bericht voor de eigenaar" rows={3} /></label>
    <Button onClick={onJoin} disabled={submitting || !serviceId}>{submitting ? 'Bezig...' : 'Aansluiten bij wachtrij'}</Button>
    <Card className="queue-note"><Clock3 /><div><b>Actuele queue-informatie</b><p>De actuele wachtrij wordt door de server bijgehouden.</p></div></Card>
  </>
}

function ActiveQueue({ entry, metadata, leaving, onLeave, onConfirmLeave, onCancelLeave, capability }: { entry: QueueEntryDTO; metadata: QueueEntryMetadata | null; leaving: boolean; onLeave: () => void; onConfirmLeave: () => void; onCancelLeave: () => void; capability?: string }) {
  const called = entry.status === 'called'
  const inService = entry.status === 'in_service'
  if (!metadata) return <Card className="active-queue"><p className="form-error" role="alert">Queue-informatie kon niet worden geladen.</p><button type="button" className="leave-queue" onClick={onLeave}>Wachtrij verlaten</button>{leaving && <div className="confirm-backdrop"><Card className="confirm-dialog"><h2>Wachtrij verlaten?</h2><div className="modal-actions"><button className="cancel-modal" onClick={onCancelLeave}>Behouden</button><Button onClick={onConfirmLeave}>Verlaten</Button></div></Card></div>}</Card>
  return <>
    <Card className={`active-queue ${called || inService ? 'ready-queue' : ''}`}><CheckCircle2 /><p className="eyebrow">{called ? 'JE BENT AAN DE BEURT' : inService ? 'IN BEHANDELING' : 'BEVESTIGD'}</p><h2>{called ? 'Kom naar de stoel.' : inService ? 'Je behandeling is gestart.' : 'Je staat op de wachtrij'}</h2><p>{called ? 'We staan voor je klaar. Loop naar binnen en neem plaats in de stoel.' : 'Blijf in de buurt van Centro Kapper. Je status wordt server-side bijgehouden.'}</p><div className="queue-position"><span>JOUW POSITIE</span><strong>{called || inService ? 'Nu' : String(metadata.position).padStart(2, '0')}</strong><small>{called || inService ? 'Aan de beurt' : `${metadata.count} wachtenden voor je`}</small></div><div className="progress"><i /></div><div className="active-details"><span>Service <b>{entry.serviceName}</b></span><span>Aangesloten om <b>{formatAmsterdamTime(entry.joinedAt)}</b></span><span>Geschatte wachttijd <b>{called || inService ? 'Nu' : `± ${metadata.estimatedWaitMinutes} min`}</b></span></div><PushOptIn entryId={entry.id} capability={capability} /></Card>
    <button className="leave-queue" onClick={onLeave} disabled={leaving}>{leaving ? 'Bezig...' : 'Wachtrij verlaten'}</button>
    {leaving && <div className="confirm-backdrop"><Card className="confirm-dialog"><h2>Wachtrij verlaten?</h2><p>Je huidige plek wordt beëindigd. Je kunt later opnieuw aansluiten.</p><div className="modal-actions"><button className="cancel-modal" onClick={onCancelLeave}>Behouden</button><Button onClick={onConfirmLeave}>Verlaten</Button></div></Card></div>}
  </>
}

function CompletedQueue() {
  return <Card className="active-queue completed-queue"><CheckCircle2 /><p className="eyebrow">CENTRO KAPPER</p><h2>Je bent geholpen</h2><p>Deze wachtrij-entry is afgerond. Je kunt opnieuw aansluiten wanneer dat nodig is.</p></Card>
}
