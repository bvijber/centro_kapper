import { ArrowLeft, ChevronRight, Star } from 'lucide-react'
import { Link, useNavigate as useTanStackNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getCurrentUserFn } from '../auth/auth.functions'
import { createAppointmentFn, getAvailabilityFn, listBookableServicesFn } from '../appointments/appointment.functions'
import { getBusinessProfileFn, getOpeningHoursFn } from '../settings/settings.functions'
import { getPublicOwnerProfileFn } from '../profiles/profiles.functions'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { BottomNav } from '../components/BottomNav'
import { ServiceCard } from '../components/ServiceCard'
import { addCalendarDays, formatAmsterdamDate, formatAmsterdamDateKey, getAmsterdamDateParts, getAmsterdamWeekday } from '../timezone'

type Service = { id: string; name: string; description: string; durationMinutes: number; priceCents: number }
type Slot = { date: string; time: string; startsAt: string; endsAt: string }

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace('.', ',')}`
const serviceCard = (service: Service) => ({ name: service.name, detail: service.description, price: euro(service.priceCents), duration: `${service.durationMinutes} min` })
const ownerInitials = (name: string) => name.trim().split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase()

export function Booking() {
  const navigate = useTanStackNavigate()
  const [services, setServices] = useState<Service[]>([])
  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [date, setDate] = useState(formatAmsterdamDateKey(new Date()))
  const [slots, setSlots] = useState<Slot[]>([])
  const [time, setTime] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [loadingServices, setLoadingServices] = useState(true)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [openingHours, setOpeningHours] = useState<{ weekday: number; isOpen: boolean }[]>([])
  const [ownerName, setOwnerName] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')

  useEffect(() => {
    void Promise.all([
      listBookableServicesFn({ data: undefined }).then((result) => { setServices(result); setSelectedServiceId(result[0]?.id ?? '') }).catch(() => setError('Diensten konden niet worden geladen.')).finally(() => setLoadingServices(false)),
      getCurrentUserFn().then((result) => setUser(result ? { id: result.id } : null)).catch(() => setUser(null)),
      getOpeningHoursFn({ data: undefined }).then(setOpeningHours).catch(() => {}),
      getPublicOwnerProfileFn().then((owner) => setOwnerName(owner?.displayName ?? '')).catch(() => setOwnerName('')),
      getBusinessProfileFn({ data: undefined }).then((profile) => setBusinessAddress(profile?.address ?? '')).catch(() => setBusinessAddress('')),
    ])
  }, [])

  useEffect(() => {
    if (!selectedServiceId) return
    setLoadingSlots(true)
    setError('')
    setTime('')
    void getAvailabilityFn({ data: { serviceId: selectedServiceId, date } })
      .then((result) => setSlots(result.slots))
      .catch(() => { setSlots([]); setError('Beschikbaarheid kon niet worden geladen.') })
      .finally(() => setLoadingSlots(false))
  }, [selectedServiceId, date])

  const todayKey = formatAmsterdamDateKey(new Date())
  const openWeekdays = openingHours.filter(h => h.isOpen).map(h => h.weekday)
  const dates: string[] = []
  let dayOffset = 0
  while (dates.length < 14 && dayOffset < 60) {
    const date = addCalendarDays(todayKey, dayOffset)
    const weekday = getAmsterdamWeekday(date)
    if (openWeekdays.length === 0 || openWeekdays.includes(weekday)) {
      dates.push(date)
    }
    dayOffset++
  }
  const isPastDate = (dateStr: string) => dateStr < todayKey
  const timeGroups = [
    { label: 'OCHTEND', test: (h: number) => h >= 6 && h < 12 },
    { label: 'MIDDAG', test: (h: number) => h >= 12 && h < 17 },
    { label: 'AVOND', test: (h: number) => h >= 17 && h < 22 },
  ]
  const groupedSlots = timeGroups
    .map((group) => ({ ...group, slots: slots.filter((slot) => group.test(Number(slot.time.split(':')[0]))) }))
    .filter((group) => group.slots.length > 0)
  const submit = async () => {
    setError('')
    setSuccess('')
    if (!selectedServiceId || !time) return setError('Kies eerst een dienst en beschikbaar tijdstip.')
    if (!user && (!guestName.trim() || !guestPhone.trim())) return setError('Vul je naam en telefoonnummer in.')
    setSubmitting(true)
    try {
      await createAppointmentFn({ data: {
        serviceId: selectedServiceId,
        localDate: date,
        localTime: time,
        ...(user ? {} : { guestName: guestName.trim(), guestPhone: guestPhone.trim(), guestEmail: guestEmail.trim() || undefined }),
      } })
      if (user) {
        await navigate({ to: '/bookings' })
      } else {
        setSuccess('Je aanvraag is ontvangen. De eigenaar bevestigt de afspraak handmatig.')
        setTime('')
      }
    } catch (caught) {
      const message = String(caught)
      setError(message.includes('niet meer beschikbaar') || message.includes('CONFLICT') ? 'Het gekozen tijdstip is inmiddels niet meer beschikbaar.' : 'De afspraak kon niet worden aangemaakt.')
      if (message.includes('niet meer beschikbaar') || message.includes('CONFLICT')) {
        const result = await getAvailabilityFn({ data: { serviceId: selectedServiceId, date } }).catch(() => null)
        setSlots(result?.slots ?? [])
        setTime('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="page booking-page">
    <header className="subheader"><Link to="/home"><ArrowLeft /></Link><h2>AFSPRAAK BOEKEN</h2></header>
    <div className="booking-business">
      <Card className="fixed-business"><span className="eyebrow">JE BOEKT BIJ</span><strong>Centro Kapper</strong>{businessAddress ? <small>{businessAddress}</small> : null}</Card>
      {ownerName && <Card className="barber-profile"><div className="avatar">{ownerInitials(ownerName)}</div><div><h3>{ownerName}</h3><p>Eigenaar</p><span><Star size={15} fill="currentColor" /> 4.9 (86 reviews)</span></div></Card>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {success && <p className="success-message" role="status">{success}</p>}
    <p className="eyebrow">KIES EEN SERVICE</p>
     {loadingServices ? <p className="lead">Bezig met laden...</p> : services.length === 0 ? <div className="empty-state"><p className="eyebrow">GEEN SERVICES</p><p>Er zijn momenteel geen services beschikbaar om te boeken.</p></div> : <div className="services">{services.map((service) => <ServiceCard key={service.id} service={serviceCard(service)} selected={selectedServiceId === service.id} onClick={() => setSelectedServiceId(service.id)} />)}</div>}
    <div className="booking-sticky">
    <p className="eyebrow">KIES EEN DATUM</p>
    <label className="date-picker">Andere datum<input type="date" min={todayKey} value={date} onChange={(event) => setDate(event.target.value)} /></label>
     <div className="dates">{dates.map((value) => { const parts = getAmsterdamDateParts(new Date(`${value}T12:00:00Z`)); const past = isPastDate(value); return <button type="button" aria-pressed={date === value} className={`${date === value ? 'chosen' : ''}${past ? ' disabled' : ''}`} onClick={() => { if (!past) setDate(value) }} key={value} disabled={past}><span>{formatAmsterdamDate(new Date(`${value}T12:00:00Z`)).split(' ')[0]}</span><b>{parts.day}</b><small>{parts.month}</small></button> })}</div>
    <p className="eyebrow">KIES EEN TIJD</p>
     {loadingSlots ? <p className="lead">Beschikbaarheid laden...</p> : slots.length === 0 ? <div className="empty-state"><p className="eyebrow">GEEN BESCHIKBARE TIJDEN</p><p>Er zijn geen beschikbare tijden op deze datum.</p></div> : groupedSlots.map((group) => <div className="time-group" key={group.label}><span className="time-group-label">{group.label}</span><div className="times">{group.slots.map((slot) => <button type="button" aria-pressed={time === slot.time} className={time === slot.time ? 'chosen' : ''} onClick={() => setTime(slot.time)} key={slot.startsAt}>{slot.time}</button>)}</div></div>)}
    </div>
    {!user && <Card className="booking-guest-form"><p className="eyebrow">JOUW GEGEVENS</p><label>Naam *<input value={guestName} onChange={(event) => setGuestName(event.target.value)} /></label><label>Telefoonnummer *<input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} type="tel" /></label><label>E-mailadres<input value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} type="email" /></label></Card>}
    <Button onClick={() => void submit()} disabled={submitting}>{submitting ? 'Bezig...' : 'Bevestig afspraak'} <ChevronRight size={18} /></Button>
    <div className="booking-bottom-nav"><BottomNav /></div>
  </main>
}
