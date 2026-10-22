import { useEffect, useState } from 'react'
import { ArrowLeft, Bell, CalendarClock, ChevronRight, Clock3, Coffee, Scissors, Store } from 'lucide-react'
import { activateServiceFn, createServiceFn, deactivateServiceFn, listServicesFn, updateServiceFn } from '../services/services.functions'
import { createBreakPeriodFn, createWholeDayBlockFn, deleteBreakPeriodFn, deleteWholeDayBlockFn, getBookingSettingsFn, getSettingsFn, updateBookingSettingsFn, updateBusinessProfileFn, updateOpeningHoursFn } from '../settings/settings.functions'
import { Card } from '../components/Card'
import { BookingSettingsSection } from './settings/BookingSettingsSection'
import { BreaksAndBlocksSection } from './settings/BreaksAndBlocksSection'
import { OpeningHoursSection } from './settings/OpeningHoursSection'
import { OwnerPushSettingsSection } from './settings/OwnerPushSettingsSection'
import { SalonInformationSection } from './settings/SalonInformationSection'
import { SectionFeedback } from './settings/SectionFeedback'
import { ServicesSection } from './settings/ServicesSection'
import type { BookingSettings, BreakPeriod, BusinessProfile, OpeningHour, Service, ServiceEditorValue, WholeDayBlock } from './settings/types'

type SectionId = 'salon' | 'booking' | 'hours' | 'breaks' | 'services' | 'push'
type FeedbackState = { kind: 'success' | 'error'; scope: SectionId | 'page'; text: string }

const SECTION_LINKS: Array<{ id: SectionId; title: string; subtitle: string; icon: typeof Store }> = [
  { id: 'salon', title: 'Saloninformatie', subtitle: 'Naam, adres en telefoon', icon: Store },
  { id: 'booking', title: 'Boekingsinstellingen', subtitle: 'Buffer, annulering en overlap', icon: CalendarClock },
  { id: 'hours', title: 'Openingstijden', subtitle: 'Open dagen en tijden', icon: Clock3 },
  { id: 'breaks', title: 'Pauzes en blokkades', subtitle: 'Vrije momenten en volledige dagen', icon: Coffee },
  { id: 'services', title: 'Diensten', subtitle: 'Prijzen, duur en beschikbaarheid', icon: Scissors },
  { id: 'push', title: 'Pushmeldingen', subtitle: 'Meldingen op je eigen apparaten', icon: Bell },
]

export function OwnerSettingsSections() {
  const [activeSection, setActiveSection] = useState<SectionId | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [services, setServices] = useState<Service[]>([])
  const [profile, setProfile] = useState<BusinessProfile>({ name: '', address: '', phone: '' })
  const [booking, setBooking] = useState<BookingSettings>({ bufferMinutes: 0, cancellationDeadlineMinutes: 1440, overlapBehavior: 'block', confirmationBehavior: 'manual', noShowReleaseBehavior: 'manual' })
  const [hours, setHours] = useState<OpeningHour[]>([])
  const [blocks, setBlocks] = useState<WholeDayBlock[]>([])
  const [breaks, setBreaks] = useState<BreakPeriod[]>([])

  const load = async (initial = false) => {
    if (initial) setLoading(true)
    try {
      const [settings, serviceRows, bookingSettings] = await Promise.all([
        getSettingsFn({ data: undefined }),
        listServicesFn({ data: undefined }),
        getBookingSettingsFn({ data: undefined }),
      ])
      setProfile({ name: settings.businessProfile.name, address: settings.businessProfile.address, phone: settings.businessProfile.phone })
      setHours(settings.openingHours)
      setBlocks(settings.wholeDayBlocks)
      setBreaks(settings.breakPeriods)
      setServices(serviceRows.filter((service) => !service.archivedAt))
      setBooking(bookingSettings)
    } catch {
      setFeedback({ kind: 'error', scope: 'page', text: 'Instellingen konden niet worden geladen.' })
    } finally {
      if (initial) setLoading(false)
    }
  }

  useEffect(() => { void load(true) }, [])

  const openSection = (id: SectionId) => { setFeedback(null); setActiveSection(id) }
  const backToOverview = () => { setFeedback(null); setActiveSection(null) }

  const saveProfile = async () => {
    setSaving(true)
    try {
      await updateBusinessProfileFn({ data: profile })
      setFeedback({ kind: 'success', scope: 'salon', text: 'Saloninformatie opgeslagen.' })
    } catch {
      setFeedback({ kind: 'error', scope: 'salon', text: 'Saloninformatie kon niet worden opgeslagen.' })
    } finally {
      setSaving(false)
    }
  }

  const saveBooking = async () => {
    setSaving(true)
    try {
      await updateBookingSettingsFn({ data: booking })
      setFeedback({ kind: 'success', scope: 'booking', text: 'Boekingsinstellingen opgeslagen.' })
    } catch {
      setFeedback({ kind: 'error', scope: 'booking', text: 'Boekingsinstellingen konden niet worden opgeslagen.' })
    } finally {
      setSaving(false)
    }
  }

  const saveHours = async () => {
    for (const hour of hours) {
      if (hour.isOpen && (!hour.openingTime || !hour.closingTime)) {
        setFeedback({ kind: 'error', scope: 'hours', text: 'Vul openingstijden in voor open dagen.' })
        return
      }
      if (hour.isOpen && hour.openingTime && hour.closingTime && hour.openingTime >= hour.closingTime) {
        setFeedback({ kind: 'error', scope: 'hours', text: 'De sluitingstijd moet na de openingstijd liggen.' })
        return
      }
    }
    setSaving(true)
    try {
      await updateOpeningHoursFn({ data: { openingHours: hours } })
      setFeedback({ kind: 'success', scope: 'hours', text: 'Openingstijden opgeslagen.' })
    } catch {
      setFeedback({ kind: 'error', scope: 'hours', text: 'Openingstijden konden niet worden opgeslagen.' })
    } finally {
      setSaving(false)
    }
  }

  const deleteBreak = async (id: string) => {
    setSaving(true)
    try {
      await deleteBreakPeriodFn({ data: { id } })
      await load()
      setFeedback({ kind: 'success', scope: 'breaks', text: 'Pauze verwijderd.' })
    } catch {
      setFeedback({ kind: 'error', scope: 'breaks', text: 'Pauze kon niet worden verwijderd.' })
    } finally {
      setSaving(false)
    }
  }

  const deleteBlock = async (id: string) => {
    setSaving(true)
    try {
      await deleteWholeDayBlockFn({ data: { id } })
      await load()
      setFeedback({ kind: 'success', scope: 'breaks', text: 'Dagblokkade verwijderd.' })
    } catch {
      setFeedback({ kind: 'error', scope: 'breaks', text: 'Dagblokkade kon niet worden verwijderd.' })
    } finally {
      setSaving(false)
    }
  }

  const createBreak = async (input: { startsAt: Date; endsAt: Date }): Promise<string | null> => {
    try {
      await createBreakPeriodFn({ data: input })
      await load()
      setFeedback({ kind: 'success', scope: 'breaks', text: 'Pauze toegevoegd.' })
      return null
    } catch {
      return 'Pauze kon niet worden opgeslagen.'
    }
  }

  const createBlock = async (input: { blockDate: string }): Promise<string | null> => {
    try {
      await createWholeDayBlockFn({ data: input })
      await load()
      setFeedback({ kind: 'success', scope: 'breaks', text: 'Dag geblokkeerd.' })
      return null
    } catch {
      return 'Blokkade kon niet worden opgeslagen.'
    }
  }

  const saveService = async (value: ServiceEditorValue, serviceId?: string): Promise<string | null> => {
    try {
      if (serviceId) await updateServiceFn({ data: { id: serviceId, ...value } })
      else await createServiceFn({ data: value })
      await load()
      setFeedback({ kind: 'success', scope: 'services', text: serviceId ? 'Dienst opgeslagen.' : 'Dienst toegevoegd.' })
      return null
    } catch {
      return serviceId ? 'Dienst kon niet worden opgeslagen.' : 'Dienst kon niet worden toegevoegd.'
    }
  }

  const toggleService = async (service: Service) => {
    setSaving(true)
    try {
      if (service.active) await deactivateServiceFn({ data: { id: service.id } })
      else await activateServiceFn({ data: { id: service.id } })
    } catch {
      setFeedback({ kind: 'error', scope: 'services', text: service.active ? 'Dienst kon niet worden gedeactiveerd.' : 'Dienst kon niet worden geactiveerd.' })
      setSaving(false)
      return
    }
    await load()
    setFeedback({ kind: 'success', scope: 'services', text: service.active ? 'Dienst gedeactiveerd.' : 'Dienst geactiveerd.' })
    setSaving(false)
  }

  if (loading) {
    return <Card className="queue-loading settings-loading"><div className="spinner" /><h2>Instellingen laden...</h2><p>Een moment, we halen de actuele saloninstellingen op.</p></Card>
  }

  const pageFeedback = feedback && feedback.scope === 'page' ? feedback : null
  const sectionFeedback = feedback && feedback.scope !== 'page' && feedback.scope === activeSection ? feedback : null

  return <>
    {pageFeedback && <SectionFeedback feedback={pageFeedback} />}
    {activeSection === null
      ? <div className="settings-overview">
        {SECTION_LINKS.map((item) => {
          const Icon = item.icon
          return <button key={item.id} type="button" className="card settings-overview-item" onClick={() => openSection(item.id)}>
            <Icon size={20} aria-hidden="true" />
            <div><b>{item.title}</b><small>{item.subtitle}</small></div>
            <ChevronRight className="settings-chevron" size={18} aria-hidden="true" />
          </button>
        })}
      </div>
      : <>
        <button type="button" className="settings-back" onClick={backToOverview}><ArrowLeft size={16} aria-hidden="true" /> Instellingen</button>
        <SectionFeedback feedback={sectionFeedback} />
        {activeSection === 'salon' && <SalonInformationSection profile={profile} onChange={setProfile} saving={saving} onSave={() => void saveProfile()} />}
        {activeSection === 'booking' && <BookingSettingsSection booking={booking} onChange={setBooking} saving={saving} onSave={() => void saveBooking()} />}
        {activeSection === 'hours' && <OpeningHoursSection hours={hours} onChange={setHours} saving={saving} onSave={() => void saveHours()} />}
        {activeSection === 'breaks' && <BreaksAndBlocksSection breaks={breaks} blocks={blocks} saving={saving} onCreateBreak={createBreak} onCreateBlock={createBlock} onDeleteBreak={(id) => void deleteBreak(id)} onDeleteBlock={(id) => void deleteBlock(id)} />}
        {activeSection === 'services' && <ServicesSection services={services} saving={saving} onSave={saveService} onToggle={(service) => void toggleService(service)} />}
        {activeSection === 'push' && <OwnerPushSettingsSection />}
      </>}
  </>
}
