import { CheckCircle2, Clock3, X } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import type { AppointmentDTO, BookableServiceDTO, CancellationRequestListItemDTO } from '../appointments/appointment.service.server'
import { cancelAppointmentFn, getAvailabilityFn, listBookableServicesFn, modifyAppointmentFn, requestCancellationFn, withdrawCancellationRequestFn } from '../appointments/appointment.functions'
import { getBusinessProfileFn } from '../settings/settings.functions'
import { APPOINTMENTS_POLL_INTERVAL_MS, fetchAppointmentsSnapshot } from '../appointments/appointment.polling'
import { usePageRefresh } from '../polling/use-page-refresh'
import { BottomNav } from '../components/BottomNav'
import { BookingCard } from '../components/BookingCard'
import { Button } from '../components/Button'
import { CustomerHeader } from '../components/CustomerHeader'
import { addCalendarDays, formatAmsterdamDate, formatAmsterdamDateKey, getAmsterdamDateParts } from '../timezone'
import { publicErrorMessage } from '../components/publicError'

type Slot = { date: string; time: string; startsAt: string; endsAt: string }

function errorMessage(caught: unknown): string {
  return publicErrorMessage(caught)
}

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace('.', ',')}`

export function MyBookings() {
  const [appointments, setAppointments] = useState<AppointmentDTO[]>([])
  const [requests, setRequests] = useState<CancellationRequestListItemDTO[]>([])
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editing, setEditing] = useState<AppointmentDTO | null>(null)
  const [requesting, setRequesting] = useState<AppointmentDTO | null>(null)
  const [businessAddress, setBusinessAddress] = useState('')

  const pendingByAppointment = useMemo(() => {
    const map = new Map<string, CancellationRequestListItemDTO>()
    for (const entry of requests) {
      if (entry.request.status === 'pending' && entry.appointment) map.set(entry.appointment.id, entry)
    }
    return map
  }, [requests])

  // De afspraken ververst automatisch, zodat statuswijzigingen door de
  // kapper zichtbaar worden zonder dat de klant hoeft te vernieuwen. De
  // achtergrondverversing is stil en past alleen toe wanneer de inhoud
  // werkelijk veranderd is.
  const refresh = usePageRefresh({
    load: fetchAppointmentsSnapshot,
    apply: (snapshot) => {
      setAppointments(snapshot.appointments)
      setRequests(snapshot.requests)
    },
    setLoading,
    setError,
    errorMessage,
    fallbackErrorMessage: 'Je afspraken konden niet worden geladen.',
    intervalMs: APPOINTMENTS_POLL_INTERVAL_MS,
  })

  const load = async () => {
    setError('')
    await refresh.loadInteractive()
  }

  useEffect(() => { void load() }, [])
  useEffect(() => {
    void getBusinessProfileFn({ data: undefined }).then((profile) => setBusinessAddress(profile?.address ?? '')).catch(() => setBusinessAddress(''))
  }, [])

  const now = new Date()
  const upcoming = appointments.filter((appointment) => appointment.startsAt >= now)
  const past = appointments.filter((appointment) => appointment.startsAt < now)
  const visible = tab === 'upcoming' ? upcoming : past

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

  const withdraw = async (appointment: AppointmentDTO) => {
    const request = pendingByAppointment.get(appointment.id)
    if (!request) return
    setError('')
    setSuccess('')
    try {
      await withdrawCancellationRequestFn({ data: { id: request.request.id } })
      setSuccess('Het annuleringsverzoek is ingetrokken.')
      await load()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const canManage = (appointment: AppointmentDTO) =>
    appointment.status === 'new' || appointment.status === 'confirmed'

  return <main className="page shell bookings-page">
    <CustomerHeader />
    <div className="hero-copy"><p className="eyebrow">CENTRO KAPPER</p><h1>Mijn<br /><em>afspraken.</em></h1><p className="lead">Beheer al je Centro Kapper afspraken op één plek.</p></div>
    <div className="tabs" role="tablist" aria-label="Afspraken filteren">
      <button type="button" role="tab" aria-selected={tab === 'upcoming'} className={tab === 'upcoming' ? 'active' : ''} onClick={() => setTab('upcoming')}><Clock3 size={17} aria-hidden="true" /> Aankomend</button>
      <button type="button" role="tab" aria-selected={tab === 'past'} className={tab === 'past' ? 'active' : ''} onClick={() => setTab('past')}><CheckCircle2 size={17} aria-hidden="true" /> Voltooid</button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {success && <p className="success-message" role="status">{success}</p>}
    {loading ? <p className="lead">Bezig met laden...</p> : null}
    {!loading && visible.length === 0 ? <div className="empty-state"><p className="eyebrow">GEEN AFSPRAKEN</p><p>Er zijn geen {tab === 'upcoming' ? 'aankomende' : 'voltooide'} afspraken om te tonen.</p><Link className="secondary-action" to="/booking">Afspraak maken</Link></div> : null}
    {visible.map((appointment) => (
      <BookingCard key={appointment.id} appointment={appointment} address={businessAddress}>
        {canManage(appointment) && (
          <div className="appointment-actions">
            <button type="button" onClick={() => setEditing(appointment)}>Wijzigen</button>
            {pendingByAppointment.has(appointment.id)
              ? <>
                  <button type="button" className="pending-request" disabled>Verzoek in behandeling</button>
                  <button type="button" onClick={() => void withdraw(appointment)}><X size={15} /> Intrekken</button>
                </>
              : <>
                  <button type="button" onClick={() => setRequesting(appointment)}>Annuleringsverzoek</button>
                  <button type="button" onClick={() => void cancel(appointment)}><X size={15} /> Annuleren</button>
                </>}
          </div>
        )}
      </BookingCard>
    ))}
    {editing && <ModifyModal appointment={editing} onClose={() => setEditing(null)} onSaved={(message) => { setEditing(null); setSuccess(message); void load() }} />}
    {requesting && <RequestModal appointment={requesting} onClose={() => setRequesting(null)} onSaved={(message) => { setRequesting(null); setSuccess(message); void load() }} />}
    <BottomNav />
  </main>
}

function ModifyModal({ appointment, onClose, onSaved }: { appointment: AppointmentDTO; onClose: () => void; onSaved: (message: string) => void }) {
  const [services, setServices] = useState<BookableServiceDTO[]>([])
  const [serviceId, setServiceId] = useState(appointment.serviceId)
  const [date, setDate] = useState(formatAmsterdamDateKey(appointment.startsAt))
  const [slots, setSlots] = useState<Slot[]>([])
  const [time, setTime] = useState('')
  const [loadingServices, setLoadingServices] = useState(true)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void listBookableServicesFn({ data: undefined })
      .then((result) => {
        setServices(result)
        if (!result.some((service) => service.id === appointment.serviceId) && result[0]) setServiceId(result[0].id)
      })
      .catch((caught) => setError(errorMessage(caught)))
      .finally(() => setLoadingServices(false))
  }, [appointment.serviceId])

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

  const dates = Array.from({ length: 14 }, (_, index) => addCalendarDays(formatAmsterdamDateKey(new Date()), index))
  const today = formatAmsterdamDateKey(new Date())

  const submit = async () => {
    setError('')
    if (!time) return setError('Kies eerst een beschikbaar tijdstip.')
    setSubmitting(true)
    try {
      const result = await modifyAppointmentFn({ data: { id: appointment.id, serviceId, localDate: date, localTime: time, overrideOpeningHours: false, overrideBreak: false, overrideWholeDayBlock: false, confirmOverlap: false } })
      if (result.kind === 'updated') {
        onSaved('De afspraak is bijgewerkt.')
      } else {
        setError(result.message)
      }
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="modal-backdrop">
    <section className="appointment-form" role="dialog" aria-modal="true" aria-labelledby="modify-appointment-title" tabIndex={-1} autoFocus onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
      <div className="modal-heading">
        <div><p className="eyebrow">CENTRO KAPPER</p><h2 id="modify-appointment-title">Afspraak wijzigen</h2></div>
        <button onClick={onClose} aria-label="Sluiten"><X /></button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loadingServices ? <p className="lead">Bezig met laden...</p> : (
        <label>Service *<select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
          {services.map((service) => <option key={service.id} value={service.id}>{service.name} · {euro(service.priceCents)} · {service.durationMinutes} min</option>)}
        </select></label>
      )}
      <div className="date-strip">
        <label className="date-picker">Andere datum<input type="date" min={today} value={date} onChange={(event) => setDate(event.target.value)} /></label>
        {dates.map((value) => {
          const parts = getAmsterdamDateParts(new Date(`${value}T12:00:00Z`))
          return <button type="button" key={value} aria-pressed={date === value} className={date === value ? 'selected' : ''} onClick={() => setDate(value)}>
            <span>{formatAmsterdamDate(new Date(`${value}T12:00:00Z`)).split(' ')[0]}</span><b>{parts.day}</b><small>{parts.month}</small>
          </button>
        })}
      </div>
      {loadingSlots ? <p className="lead">Beschikbaarheid laden...</p> : slots.length === 0 ? <p className="lead">Geen beschikbare tijden op deze datum.</p> : <div className="times">
        {slots.map((slot) => <button type="button" key={slot.startsAt} aria-pressed={time === slot.time} className={time === slot.time ? 'chosen' : ''} onClick={() => setTime(slot.time)}>{slot.time}</button>)}
      </div>}
      <div className="modal-actions">
        <button className="cancel-modal" onClick={onClose}>Terug</button>
        <Button onClick={() => void submit()} disabled={submitting || loadingSlots || !time}>{submitting ? 'Bezig...' : 'Wijziging opslaan'}</Button>
      </div>
    </section>
  </div>
}

function RequestModal({ appointment, onClose, onSaved }: { appointment: AppointmentDTO; onClose: () => void; onSaved: (message: string) => void }) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    if (!reason.trim()) return setError('Vul een reden in voor je annuleringsverzoek.')
    setSubmitting(true)
    try {
      await requestCancellationFn({ data: { appointmentId: appointment.id, reason: reason.trim() } })
      onSaved('Je annuleringsverzoek is ingediend. De eigenaar beoordeelt dit.')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="modal-backdrop">
    <section className="appointment-form" role="dialog" aria-modal="true" aria-labelledby="cancellation-request-title" tabIndex={-1} autoFocus onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
      <div className="modal-heading">
        <div><p className="eyebrow">CENTRO KAPPER</p><h2 id="cancellation-request-title">Annuleringsverzoek</h2></div>
        <button onClick={onClose} aria-label="Sluiten"><X /></button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <label>Reden *<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} placeholder="Waarom wil je annuleren?" /></label>
      <div className="modal-actions">
        <button className="cancel-modal" onClick={onClose}>Terug</button>
        <Button onClick={() => void submit()} disabled={submitting}>{submitting ? 'Bezig...' : 'Versturen'}</Button>
      </div>
    </section>
  </div>
}
