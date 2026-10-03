import { useEffect, useState } from 'react'
import { activateServiceFn, createServiceFn, deactivateServiceFn, listServicesFn, updateServiceFn } from '../services/services.functions'
import { createBreakPeriodFn, createWholeDayBlockFn, deleteBreakPeriodFn, deleteWholeDayBlockFn, getSettingsFn, updateBookingSettingsFn, updateBusinessProfileFn, updateOpeningHoursFn } from '../settings/settings.functions'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { StaffBottomNav } from '../components/StaffBottomNav'

type Service = Awaited<ReturnType<typeof listServicesFn>>[number]

export function OwnerSettings() {
  const [services, setServices] = useState<Service[]>([])
  const [profile, setProfile] = useState({ name: '', address: '', phone: '' })
  const [booking, setBooking] = useState({ bufferMinutes: 0, cancellationDeadlineMinutes: 1440, overlapBehavior: 'block' as 'block' | 'allow_with_warning', confirmationBehavior: 'manual' as const, noShowReleaseBehavior: 'manual' as 'automatic' | 'manual' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [hours, setHours] = useState<Array<{ weekday: number; isOpen: boolean; openingTime: string | null; closingTime: string | null }>>([])
  const [blocks, setBlocks] = useState<Array<{ id: string; blockDate: string }>>([])
  const [breaks, setBreaks] = useState<Array<{ id: string; startsAt: Date; endsAt: Date }>>([])

  const load = async () => {
    try {
      const [settings, serviceRows] = await Promise.all([getSettingsFn({ data: undefined }), listServicesFn({ data: undefined })])
      setServices(serviceRows)
      setProfile({ name: settings.businessProfile.name, address: settings.businessProfile.address, phone: settings.businessProfile.phone })
      setHours(settings.openingHours)
      setBlocks(settings.wholeDayBlocks)
      setBreaks(settings.breakPeriods)
      const current = await import('../settings/settings.functions').then(({ getBookingSettingsFn }) => getBookingSettingsFn({ data: undefined }))
      setBooking(current)
    } catch { setError('Instellingen konden niet worden geladen.') }
  }

  useEffect(() => { void load() }, [])

  const saveProfile = async () => { try { await updateBusinessProfileFn({ data: profile }); setMessage('Saloninformatie opgeslagen.'); setError('') } catch { setError('Saloninformatie kon niet worden opgeslagen.') } }
  const saveBooking = async () => { try { await updateBookingSettingsFn({ data: booking }); setMessage('Boekingsinstellingen opgeslagen.'); setError('') } catch { setError('Boekingsinstellingen konden niet worden opgeslagen.') } }
  const saveHours = async () => { try { await updateOpeningHoursFn({ data: { openingHours: hours } }); setMessage('Openingstijden opgeslagen.'); setError('') } catch { setError('Openingstijden konden niet worden opgeslagen.') } }
  const addBlock = async () => { const blockDate = window.prompt('Datum blokkeren (YYYY-MM-DD)'); if (!blockDate) return; try { await createWholeDayBlockFn({ data: { blockDate } }); await load(); setMessage('Dag geblokkeerd.') } catch { setError('Blokkade kon niet worden opgeslagen.') } }
  const addBreak = async () => { const startsAt = window.prompt('Pauze start als ISO-tijdstip'); const endsAt = window.prompt('Pauze einde als ISO-tijdstip'); if (!startsAt || !endsAt) return; try { await createBreakPeriodFn({ data: { startsAt: new Date(startsAt), endsAt: new Date(endsAt) } }); await load(); setMessage('Pauze opgeslagen.') } catch { setError('Pauze kon niet worden opgeslagen.') } }
  const addService = async () => { try { await createServiceFn({ data: { name: 'Nieuwe dienst', description: 'Beschrijving', durationMinutes: 30, priceCents: 0 } }); await load(); setMessage('Dienst toegevoegd.'); setError('') } catch { setError('Dienst kon niet worden toegevoegd.') } }
  const updateService = async (service: Service) => { try { await updateServiceFn({ data: { id: service.id, name: service.name, description: service.description, durationMinutes: service.durationMinutes, priceCents: service.priceCents } }); setMessage('Dienst opgeslagen.'); setError('') } catch { setError('Dienst kon niet worden opgeslagen.') } }

  return <main className="page shell staff-page owner-settings-page">
    <p className="eyebrow">CENTRO KAPPER · EIGENAAR</p><h1 className="staff-title">Beheer<br /><em>instellingen.</em></h1>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="success-message" role="status">{message}</p>}
    <Card className="owner-settings-section"><p className="eyebrow">SALONINFORMATIE</p><label>Naam<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label><label>Adres<input value={profile.address} onChange={(event) => setProfile({ ...profile, address: event.target.value })} /></label><label>Telefoon<input value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></label><Button onClick={() => void saveProfile()}>Opslaan</Button></Card>
    <Card className="owner-settings-section"><p className="eyebrow">BOEKINGSINSTELLINGEN</p><label>Buffer in minuten<input type="number" min="0" value={booking.bufferMinutes} onChange={(event) => setBooking({ ...booking, bufferMinutes: Number(event.target.value) })} /></label><label>Annuleringstermijn in minuten<input type="number" min="0" value={booking.cancellationDeadlineMinutes} onChange={(event) => setBooking({ ...booking, cancellationDeadlineMinutes: Number(event.target.value) })} /></label><label>Overlap<select value={booking.overlapBehavior} onChange={(event) => setBooking({ ...booking, overlapBehavior: event.target.value as typeof booking.overlapBehavior })}><option value="block">Blokkeren</option><option value="allow_with_warning">Waarschuwen en bevestigen</option></select></label><label>No-show vrijgave<select value={booking.noShowReleaseBehavior} onChange={(event) => setBooking({ ...booking, noShowReleaseBehavior: event.target.value as typeof booking.noShowReleaseBehavior })}><option value="manual">Handmatig</option><option value="automatic">Automatisch</option></select></label><Button onClick={() => void saveBooking()}>Opslaan</Button></Card>
    <Card className="owner-settings-section"><p className="eyebrow">OPENINGSTIJDEN</p>{hours.map((hour) => <div className="form-row" key={hour.weekday}><label>Dag {hour.weekday}<input type="checkbox" checked={hour.isOpen} onChange={(event) => setHours(hours.map((item) => item.weekday === hour.weekday ? { ...item, isOpen: event.target.checked } : item))} /></label><input type="time" value={hour.openingTime ?? ''} disabled={!hour.isOpen} onChange={(event) => setHours(hours.map((item) => item.weekday === hour.weekday ? { ...item, openingTime: event.target.value } : item))} /><input type="time" value={hour.closingTime ?? ''} disabled={!hour.isOpen} onChange={(event) => setHours(hours.map((item) => item.weekday === hour.weekday ? { ...item, closingTime: event.target.value } : item))} /></div>)}<Button onClick={() => void saveHours()}>Openingstijden opslaan</Button></Card>
    <Card className="owner-settings-section owner-settings-lists"><p className="eyebrow">PAUZES EN BLOKKADES</p>{breaks.map((item) => <p key={item.id}>{item.startsAt.toISOString()} - {item.endsAt.toISOString()} <button onClick={() => void deleteBreakPeriodFn({ data: { id: item.id } }).then(load)}>Verwijderen</button></p>)}<Button onClick={() => void addBreak()}>Pauze toevoegen</Button>{blocks.map((item) => <p key={item.id}>{item.blockDate} <button onClick={() => void deleteWholeDayBlockFn({ data: { id: item.id } }).then(load)}>Verwijderen</button></p>)}<Button onClick={() => void addBlock()}>Dag blokkeren</Button></Card>
    <Card className="owner-settings-section"><p className="eyebrow">DIENSTEN</p>{services.map((service) => <div className="service-admin-row" key={service.id}><label>Naam<input value={service.name} onChange={(event) => setServices(services.map((item) => item.id === service.id ? { ...item, name: event.target.value } : item))} /></label><label>Beschrijving<input value={service.description} onChange={(event) => setServices(services.map((item) => item.id === service.id ? { ...item, description: event.target.value } : item))} /></label><label>Prijs in centen<input type="number" min="0" value={service.priceCents} onChange={(event) => setServices(services.map((item) => item.id === service.id ? { ...item, priceCents: Number(event.target.value) } : item))} /></label><label>Duur in minuten<input type="number" min="1" value={service.durationMinutes} onChange={(event) => setServices(services.map((item) => item.id === service.id ? { ...item, durationMinutes: Number(event.target.value) } : item))} /></label><Button onClick={() => void updateService(service)}>Opslaan</Button>{service.active ? <Button onClick={() => void deactivateServiceFn({ data: { id: service.id } }).then(load)}>Deactiveren</Button> : <Button onClick={() => void activateServiceFn({ data: { id: service.id } }).then(load)}>Activeren</Button>}</div>)}<Button onClick={() => void addService()}>Dienst toevoegen</Button></Card>
    <StaffBottomNav />
  </main>
}
