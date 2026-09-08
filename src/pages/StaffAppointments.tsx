import { Bell, CalendarDays, Check, CheckCircle2, Edit3, Phone, Plus, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { AppointmentDTO, BookableServiceDTO, CancellationRequestListItemDTO } from '../appointments/appointment.service.server'
import { approveCancellationRequestFn, cancelAppointmentFn, createAppointmentFn, getAvailabilityFn, listAppointmentsFn, listBookableServicesFn, listCancellationRequestsFn, modifyAppointmentFn, rejectCancellationRequestFn, updateAppointmentStatusFn } from '../appointments/appointment.functions'
import { appointmentStatusClass, appointmentStatusLabel, formatPriceCents } from '../appointments/appointment.presentation'
import { Card } from '../components/Card'
import { StaffBottomNav } from '../components/StaffBottomNav'
import logo from '../assets/logo_centro_kapper.jpeg'
import { addCalendarDays, formatAmsterdamDate, formatAmsterdamDateKey, getAmsterdamDateParts, formatAmsterdamTime } from '../timezone'

type Slot = { date: string; time: string; startsAt: string; endsAt: string }
type OverrideFlags = { overrideOpeningHours: boolean; overrideBreak: boolean; overrideWholeDayBlock: boolean }

function errorMessage(caught: unknown): string {
  return String(caught).replace(/^Error:\s*/, '')
}

const todayKey = () => formatAmsterdamDateKey(new Date())

export function StaffAppointments() {
  const [appointments, setAppointments] = useState<AppointmentDTO[]>([])
  const [pendingRequests, setPendingRequests] = useState<CancellationRequestListItemDTO[]>([])
  const [services, setServices] = useState<BookableServiceDTO[]>([])
  const [date, setDate] = useState(todayKey())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editing, setEditing] = useState<AppointmentDTO | null>(null)
  const [creating, setCreating] = useState(false)
  const [overlap, setOverlap] = useState<{ appointment: AppointmentDTO; serviceId: string; localDate: string; localTime: string; overrides: OverrideFlags } | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [appointmentsResult, requestsResult, servicesResult] = await Promise.all([
        listAppointmentsFn({ data: {} }),
        listCancellationRequestsFn({ data: {} }),
        listBookableServicesFn({ data: undefined }),
      ])
      setAppointments(appointmentsResult)
      setPendingRequests(requestsResult)
      setServices(servicesResult)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const visible = appointments.filter((item) => formatAmsterdamDateKey(item.startsAt) === date)

  const statusAction = async (id: string, status: 'confirmed' | 'in_progress' | 'completed' | 'no_show', message: string) => {
    setError('')
    setSuccess('')
    try {
      await updateAppointmentStatusFn({ data: { id, status } })
      setSuccess(message)
      await load()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const cancel = async (appointment: AppointmentDTO) => {
    setError('')
    setSuccess('')
    try {
      await cancelAppointmentFn({ data: { id: appointment.id } })
      setSuccess('De afspraak is geannuleerd.')
      await load()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const review = async (request: CancellationRequestListItemDTO, approve: boolean) => {
    setError('')
    setSuccess('')
    try {
      if (approve) {
        await approveCancellationRequestFn({ data: { id: request.request.id } })
        setSuccess('Het annuleringsverzoek is goedgekeurd.')
      } else {
        await rejectCancellationRequestFn({ data: { id: request.request.id } })
        setSuccess('Het annuleringsverzoek is afgewezen.')
      }
      await load()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const confirmOverlap = async () => {
    if (!overlap) return
    setError('')
    setSuccess('')
    try {
      await modifyAppointmentFn({ data: { id: overlap.appointment.id, serviceId: overlap.serviceId, localDate: overlap.localDate, localTime: overlap.localTime, ...overlap.overrides, confirmOverlap: true } })
      setOverlap(null)
      setSuccess('De afspraak is gewijzigd.')
      await load()
    } catch (caught) {
      setOverlap(null)
      setError(errorMessage(caught))
    }
  }

  const customerName = (appointment: { customerName?: string | null; guestName?: string | null }) => appointment.customerName ?? appointment.guestName ?? 'Gast'

  return <main className="page shell staff-page appointments-page">
    <header className="topbar">
      <Link to="/staff" className="brand"><img src={logo} alt="Centro Kapper" /><span>Centro <b>Kapper</b></span></Link>
      <Bell className="staff-bell" size={22} />
    </header>
    <p className="eyebrow">CENTRO KAPPER · BEHEER</p>
    <div className="staff-heading">
      <div><h1>Afspraken</h1><p>Het volledige schema van Centro Kapper.</p></div>
      <CalendarDays size={27} />
    </div>
    <button className="new-appointment" onClick={() => { setError(''); setSuccess(''); setCreating(true) }}><Plus size={20} /> Nieuwe afspraak</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {success && <p className="success-message" role="status">{success}</p>}

    {pendingRequests.length > 0 && <section className="request-section">
      <p className="eyebrow">ANNULERINGSVERZOEKEN</p>
      {pendingRequests.map((entry) => entry.appointment && (
        <Card key={entry.request.id} className="appointment-card">
          <div className="appointment-top">
            <div className="appointment-time"><strong>{formatAmsterdamTime(entry.appointment.startsAt)}</strong></div>
            <span className="appointment-status new">Verzoek</span>
          </div>
          <div className="appointment-customer">
            <div className="customer-initials">{customerName(entry.appointment).split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
            <div><h3>{customerName(entry.appointment)}</h3><p>{entry.appointment.serviceNameAtBooking}</p></div>
          </div>
          <p className="appointment-note">“{entry.request.reason}”</p>
          <div className="appointment-actions">
            <button onClick={() => void review(entry, true)}><Check size={15} /> Goedkeuren</button>
            <button onClick={() => void review(entry, false)}><X size={15} /> Afwijzen</button>
          </div>
        </Card>
      ))}
    </section>}

    <div className="day-filter">
      <button className={date === todayKey() ? 'active' : ''} onClick={() => setDate(todayKey())}>Vandaag <small>{appointments.filter((item) => formatAmsterdamDateKey(item.startsAt) === todayKey()).length} afspraken</small></button>
      <button className={date === addCalendarDays(todayKey(), 1) ? 'active' : ''} onClick={() => setDate(addCalendarDays(todayKey(), 1))}>Morgen <small>{appointments.filter((item) => formatAmsterdamDateKey(item.startsAt) === addCalendarDays(todayKey(), 1)).length} afspraken</small></button>
    </div>
    <div className="date-strip">
      {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
        const key = addCalendarDays(todayKey(), offset)
        const parts = getAmsterdamDateParts(new Date(`${key}T12:00:00Z`))
        return <button key={key} className={date === key ? 'selected' : ''} onClick={() => setDate(key)}>
          <span>{formatAmsterdamDate(new Date(`${key}T12:00:00Z`)).split(' ')[0]}</span><b>{parts.day}</b><small>{parts.month}</small>
        </button>
      })}
    </div>
    <div className="appointment-list">
      {loading ? <p className="lead">Bezig met laden...</p> : null}
      {!loading && visible.length === 0 ? <p className="lead">Geen afspraken op deze datum.</p> : null}
      {visible.map((item) => (
        <Card key={item.id} className="appointment-card">
          <div className="appointment-top">
            <div className="appointment-time"><strong>{formatAmsterdamTime(item.startsAt)}</strong></div>
            <span className={`appointment-status ${appointmentStatusClass(item.status)}`}>{appointmentStatusLabel(item.status)}</span>
          </div>
          <div className="appointment-customer">
            <div className="customer-initials">{customerName(item).split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
            <div><h3>{customerName(item)}</h3><p>{item.serviceNameAtBooking} <span>· {item.serviceDurationMinutesAtBooking} min</span></p></div>
            {item.guestPhone && <a href={`tel:${item.guestPhone}`} aria-label={`Bel ${customerName(item)}`}><Phone size={18} /></a>}
          </div>
          {item.guestPhone && <p className="phone-number">{item.guestPhone}</p>}
          {item.note && <p className="appointment-note">“{item.note}”</p>}
          <div className="appointment-actions">
            {item.status === 'new' && <button onClick={() => void statusAction(item.id, 'confirmed', 'De afspraak is bevestigd.')}><Check size={15} /> Bevestig</button>}
            {item.status === 'confirmed' && <button onClick={() => void statusAction(item.id, 'in_progress', 'De behandeling is gestart.')}>Start</button>}
            {item.status === 'in_progress' && <button onClick={() => void statusAction(item.id, 'completed', 'De afspraak is afgerond.')}><CheckCircle2 size={15} /> Afgerond</button>}
            {item.status === 'new' || item.status === 'confirmed' ? (
              <>
                <button onClick={() => { setError(''); setSuccess(''); setEditing(item) }}><Edit3 size={15} /> Wijzig</button>
                <button onClick={() => void statusAction(item.id, 'no_show', 'De afspraak is als no-show gemarkeerd.')}>No-show</button>
                <button onClick={() => void cancel(item)}><X size={15} /> Annuleer</button>
              </>
            ) : null}
          </div>
        </Card>
      ))}
    </div>
    {editing && <ModifyModal
      appointment={editing}
      services={services}
      onClose={() => setEditing(null)}
      onUpdated={() => { setEditing(null); setSuccess('De afspraak is gewijzigd.'); void load() }}
      onOverlap={(serviceId, localDate, localTime, overrides) => { setOverlap({ appointment: editing, serviceId, localDate, localTime, overrides }); setEditing(null) }}
    />}
    {creating && <CreateModal services={services} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); setSuccess('De afspraak is aangemaakt.'); void load() }} />}
    {overlap && <OverlapModal
      message="Dit tijdstip overlapt met een bestaande afspraak. Bevestig dat je de wijziging toch wilt doorvoeren."
      onClose={() => setOverlap(null)}
      onConfirm={() => void confirmOverlap()}
    />}
    <StaffBottomNav />
  </main>
}

function ModifyModal({ appointment, services, onClose, onUpdated, onOverlap }: {
  appointment: AppointmentDTO
  services: BookableServiceDTO[]
  onClose: () => void
  onUpdated: () => void
  onOverlap: (serviceId: string, localDate: string, localTime: string, overrides: OverrideFlags) => void
}) {
  return <SlotMutationModal
    title="Afspraak wijzigen"
    submitLabel="Wijziging opslaan"
    services={services}
    initialServiceId={appointment.serviceId}
    initialDate={formatAmsterdamDateKey(appointment.startsAt)}
    showOverrides
    autoSelectService
    onClose={onClose}
    onSubmit={async ({ serviceId, localDate, localTime, overrides }) => {
      try {
        const result = await modifyAppointmentFn({ data: { id: appointment.id, serviceId, localDate, localTime, ...overrides, confirmOverlap: false } })
        if (result.kind === 'updated') onUpdated()
        else onOverlap(serviceId, localDate, localTime, overrides)
        return { ok: true }
      } catch (caught) {
        return { ok: false, message: errorMessage(caught) }
      }
    }}
  />
}

function CreateModal({ services, onClose, onCreated }: {
  services: BookableServiceDTO[]
  onClose: () => void
  onCreated: () => void
}) {
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [note, setNote] = useState('')

  return <SlotMutationModal
    title="Nieuwe afspraak"
    submitLabel="Afspraak aanmaken"
    services={services}
    initialServiceId=""
    initialDate={todayKey()}
    showOverrides={false}
    onClose={onClose}
    onSubmit={async ({ serviceId, localDate, localTime }) => {
      if (!guestName.trim() || !guestPhone.trim()) {
        return { ok: false, message: 'Vul de naam en het telefoonnummer van de klant in.' }
      }
      try {
        await createAppointmentFn({ data: { serviceId, localDate, localTime, guestName: guestName.trim(), guestPhone: guestPhone.trim(), guestEmail: guestEmail.trim() || undefined, note: note.trim() || undefined, overrideOpeningHours: false, overrideBreak: false, overrideWholeDayBlock: false } })
        onCreated()
        return { ok: true }
      } catch (caught) {
        return { ok: false, message: errorMessage(caught) }
      }
    }}
  >
    <label>Klantnaam *<input value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Naam van de klant" /></label>
    <label>Telefoonnummer *<input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} type="tel" placeholder="06 12 34 56 78" /></label>
    <label>E-mailadres <input value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} type="email" placeholder="naam@email.nl" /></label>
    <label>Notities <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Optionele notitie" /></label>
  </SlotMutationModal>
}

function SlotMutationModal({ title, submitLabel, services, initialServiceId, initialDate, showOverrides, autoSelectService = false, onClose, onSubmit, children }: {
  title: string
  submitLabel: string
  services: BookableServiceDTO[]
  initialServiceId: string
  initialDate: string
  showOverrides: boolean
  autoSelectService?: boolean
  onClose: () => void
  onSubmit: (value: { serviceId: string; localDate: string; localTime: string; overrides: OverrideFlags }) => Promise<{ ok: boolean; message?: string }>
  children?: ReactNode
}) {
  const [serviceId, setServiceId] = useState(initialServiceId || services[0]?.id || '')
  const [date, setDate] = useState(initialDate)
  const [slots, setSlots] = useState<Slot[]>([])
  const [time, setTime] = useState('')
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [overrides, setOverrides] = useState<OverrideFlags>({ overrideOpeningHours: false, overrideBreak: false, overrideWholeDayBlock: false })

  useEffect(() => {
    if (autoSelectService && services.length > 0 && !services.some((service) => service.id === serviceId)) {
      setServiceId(services[0].id)
    }
  }, [services, serviceId, autoSelectService])

  useEffect(() => {
    if (!serviceId) return
    setLoadingSlots(true)
    setTime('')
    setError('')
    void getAvailabilityFn({ data: { serviceId, date } })
      .then((result) => setSlots(result.slots))
      .catch((caught) => { setSlots([]); setError(errorMessage(caught)) })
      .finally(() => setLoadingSlots(false))
  }, [serviceId, date])

  const dates = Array.from({ length: 14 }, (_, index) => addCalendarDays(todayKey(), index))

  const submit = async () => {
    setError('')
    if (!serviceId) return setError('Kies een dienst.')
    if (!time) return setError('Kies een beschikbaar tijdstip.')
    setSubmitting(true)
    const result = await onSubmit({ serviceId, localDate: date, localTime: time, overrides })
    setSubmitting(false)
    if (!result.ok) setError(result.message ?? 'Wijziging kon niet worden opgeslagen.')
  }

  const toggle = (key: keyof OverrideFlags) => setOverrides((current) => ({ ...current, [key]: !current[key] }))

  return <div className="modal-backdrop">
    <section className="appointment-form">
      <div className="modal-heading">
        <div><p className="eyebrow">CENTRO KAPPER</p><h2>{title}</h2></div>
        <button onClick={onClose} aria-label="Sluiten"><X /></button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {children}
      <label>Service *<select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
        <option value="" disabled>Kies een dienst</option>
        {services.map((service) => <option key={service.id} value={service.id}>{service.name} · {formatPriceCents(service.priceCents)} · {service.durationMinutes} min</option>)}
      </select></label>
      <div className="date-strip">
        {dates.map((value) => {
          const parts = getAmsterdamDateParts(new Date(`${value}T12:00:00Z`))
          return <button type="button" key={value} className={date === value ? 'selected' : ''} onClick={() => setDate(value)}>
            <span>{formatAmsterdamDate(new Date(`${value}T12:00:00Z`)).split(' ')[0]}</span><b>{parts.day}</b><small>{parts.month}</small>
          </button>
        })}
      </div>
      {loadingSlots ? <p className="lead">Beschikbaarheid laden...</p> : slots.length === 0 ? <p className="lead">Geen beschikbare tijden op deze datum.</p> : <div className="times">
        {slots.map((slot) => <button type="button" key={slot.startsAt} className={time === slot.time ? 'chosen' : ''} onClick={() => setTime(slot.time)}>{slot.time}</button>)}
      </div>}
      {showOverrides && <div className="override-toggles">
        <label><input type="checkbox" checked={overrides.overrideOpeningHours} onChange={() => toggle('overrideOpeningHours')} /> Buiten openingstijden</label>
        <label><input type="checkbox" checked={overrides.overrideBreak} onChange={() => toggle('overrideBreak')} /> Pauze negeren</label>
        <label><input type="checkbox" checked={overrides.overrideWholeDayBlock} onChange={() => toggle('overrideWholeDayBlock')} /> Dagblokkade negeren</label>
      </div>}
      <div className="modal-actions">
        <button className="cancel-modal" onClick={onClose}>Annuleren</button>
        <button className="button" onClick={() => void submit()} disabled={submitting || loadingSlots || !serviceId || !time}>{submitting ? 'Bezig...' : submitLabel}</button>
      </div>
    </section>
  </div>
}

function OverlapModal({ message, onClose, onConfirm }: { message: string; onClose: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop">
    <section className="appointment-form">
      <div className="modal-heading">
        <div><p className="eyebrow">CENTRO KAPPER</p><h2>Overlapwaarschuwing</h2></div>
        <button onClick={onClose} aria-label="Sluiten"><X /></button>
      </div>
      <p className="lead">{message}</p>
      <div className="modal-actions">
        <button className="cancel-modal" onClick={onClose}>Terug</button>
        <button className="button" onClick={onConfirm}>Toch doorvoeren</button>
      </div>
    </section>
  </div>
}