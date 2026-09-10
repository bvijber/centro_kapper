import { Bell, Check, CheckCircle2, Clock3, MapPin, Phone, RotateCcw, UserRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { listStaffQueueFn, callQueueEntryFn, cancelQueueEntryFn, completeQueueEntryFn, rejoinQueueEntryFn, skipQueueEntryFn, startQueueServiceFn } from '../queue/queue.functions'
import type { QueueEntryDTO } from '../queue/queue.service.server'
import { Card } from '../components/Card'
import { StaffBottomNav } from '../components/StaffBottomNav'
import { formatAmsterdamDateKey, formatAmsterdamTime } from '../timezone'
import logo from '../assets/logo_centro_kapper.jpeg'

type Tab = 'active' | 'history'
type QueueStatus = QueueEntryDTO['status']

const ACTIVE_STATUSES = new Set<QueueStatus>(['waiting', 'called', 'in_service'])
const statusLabel: Record<QueueStatus, string> = { waiting: 'Wachtend', called: 'Opgeroepen', in_service: 'In behandeling', completed: 'Afgerond', cancelled: 'Geannuleerd', skipped: 'Overgeslagen' }
const statusClass: Record<QueueStatus, string> = { waiting: 'queue-pending', called: 'queue-ready', in_service: 'queue-accepted', completed: 'queue-completed', cancelled: 'queue-rejected', skipped: 'queue-rejected' }

function errorMessage(caught: unknown): string {
  return String(caught).replace(/^Error:\s*/, '')
}

export function StaffQueue() {
  const [entries, setEntries] = useState<QueueEntryDTO[]>([])
  const [tab, setTab] = useState<Tab>('active')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setEntries(await listStaffQueueFn({ data: { queueDate: formatAmsterdamDateKey(new Date()) } }))
    } catch (caught) {
      setError(errorMessage(caught) || 'De wachtrij kon niet worden geladen.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const mutate = async (id: string, action: () => Promise<unknown>, message: string) => {
    setBusyId(id)
    setError('')
    setSuccess('')
    try {
      await action()
      setSuccess(message)
      await load()
    } catch (caught) {
      setError(errorMessage(caught) || 'De queue-actie kon niet worden uitgevoerd.')
    } finally {
      setBusyId(null)
    }
  }

  const activeEntries = entries.filter((entry) => ACTIVE_STATUSES.has(entry.status))
  const historyEntries = entries.filter((entry) => !ACTIVE_STATUSES.has(entry.status))
  const visibleEntries = tab === 'active' ? activeEntries : historyEntries

  return <main className="page shell staff-page queue-staff-page"><header className="topbar"><Link to="/staff" className="brand"><img src={logo} alt="Centro Kapper" /><span>Centro <b>Kapper</b></span></Link><Bell className="staff-bell" size={22} /></header><p className="eyebrow">CENTRO KAPPER · BEHEER</p><div className="staff-heading"><div><h1>Wachtrij beheren</h1><p>Serverdata van vandaag.</p></div><Clock3 size={27} /></div>{error && <p className="form-error" role="alert">{error}</p>}{success && <p className="success-message" role="status">{success}</p>}<Card className="queue-stats"><div><strong>{activeEntries.length}</strong><span>actief</span></div><div><strong>{historyEntries.length}</strong><span>historisch</span></div></Card><div className="queue-tabs"><button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Actief</button><button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Historie</button></div>{loading ? <Card className="queue-loading"><div className="spinner" /><h2>Wachtrij laden...</h2></Card> : visibleEntries.length === 0 ? <Card className="queue-loading"><UsersEmpty /><h2>{tab === 'active' ? 'Geen actieve klanten' : 'Geen historie vandaag'}</h2><p>Nieuwe queue-entries verschijnen hier automatisch na het laden.</p></Card> : <div className="staff-queue-list">{visibleEntries.map((entry, index) => <QueueRow key={entry.id} entry={entry} position={index + 1} busy={busyId === entry.id} onCall={() => void mutate(entry.id, () => callQueueEntryFn({ data: { id: entry.id } }), 'Klant is opgeroepen.')} onStart={() => void mutate(entry.id, () => startQueueServiceFn({ data: { id: entry.id, status: 'in_service' } }), 'Behandeling is gestart.')} onComplete={() => void mutate(entry.id, () => completeQueueEntryFn({ data: { id: entry.id } }), 'Queue-entry is afgerond.')} onCancel={() => void mutate(entry.id, () => cancelQueueEntryFn({ data: { id: entry.id } }), 'Queue-entry is geannuleerd.')} onSkip={() => void mutate(entry.id, () => skipQueueEntryFn({ data: { id: entry.id } }), 'Klant is overgeslagen.')} onRejoin={() => void mutate(entry.id, () => rejoinQueueEntryFn({ data: { id: entry.id } }), 'Klant staat opnieuw achteraan in de wachtrij.')} />)}</div>}<div className="queue-location"><MapPin size={16} /> Centro Kapper · Nieuwe Markt 12, Breda</div><StaffBottomNav /></main>
}

function QueueRow({ entry, position, busy, onCall, onStart, onComplete, onCancel, onSkip, onRejoin }: { entry: QueueEntryDTO; position: number; busy: boolean; onCall: () => void; onStart: () => void; onComplete: () => void; onCancel: () => void; onSkip: () => void; onRejoin: () => void }) {
  return <Card className="staff-queue-row"><div className="staff-queue-top"><span className="queue-number">{position}</span><div className="queue-customer"><h3>{entry.customerUserId ? 'Customer' : entry.guestName ?? 'Gast'}</h3><p>{entry.serviceName}</p></div><span className={`queue-status ${statusClass[entry.status]}`}>{statusLabel[entry.status]}</span></div><div className="queue-contact"><span>{entry.guestPhone ? <><Phone size={14} /> {entry.guestPhone}</> : <><UserRound size={14} /> Customer-account</>}</span><span><Clock3 size={14} /> Ingekomen {formatAmsterdamTime(entry.joinedAt)}</span></div><div className="staff-queue-actions">{entry.status === 'waiting' && <><button disabled={busy} onClick={onCall}><UserRound size={15} /> Oproepen</button><button className="reject" disabled={busy} onClick={onCancel}><X size={15} /> Annuleren</button></>}{entry.status === 'called' && <><button disabled={busy} onClick={onStart}><Check size={15} /> Start behandeling</button><button className="reject" disabled={busy} onClick={onSkip}><X size={15} /> Overslaan</button></>}{entry.status === 'in_service' && <><button disabled={busy} onClick={onComplete}><CheckCircle2 size={15} /> Afronden</button><button className="reject" disabled={busy} onClick={onCancel}><X size={15} /> Annuleren</button></>}{entry.status === 'skipped' && <button disabled={busy} onClick={onRejoin}><RotateCcw size={15} /> Opnieuw achteraan</button>}</div></Card>
}

function UsersEmpty() {
  return <UserRound size={28} />
}
