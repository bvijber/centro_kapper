import { Clock3, MapPin, Navigation, Phone, Scissors } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getHomeDataFn } from '../home/home.functions'
import type { HomeDTO } from '../home/home.service.server'
import { formatPriceCents } from '../appointments/appointment.presentation'
import { BottomNav } from '../components/BottomNav'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { CustomerHeader } from '../components/CustomerHeader'
import logo from '../assets/logo_centro_kapper.jpeg'
import { publicErrorMessage } from '../components/publicError'

export function Home() {
  const [data, setData] = useState<HomeDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void getHomeDataFn()
      .then(setData)
      .catch((caught) => setError(publicErrorMessage(caught, 'Saloninformatie kon niet worden geladen.')))
      .finally(() => setLoading(false))
  }, [])

  return <main className="page shell home-page">
    <CustomerHeader />
    <div className="home-main">
      <Card className="business-hero"><img src={logo} alt="Centro Kapper logo" /><div><p className="eyebrow">CENTRO KAPPER</p><h1>Welkom,<br /><em>jouw moment.</em></h1></div></Card>
      {loading ? <p className="lead">Bezig met laden...</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {!loading && !error && data && (
        <>
          <div className="business-status"><span><i /> {data.openStatus.label}</span><small>{data.openStatus.detail}</small></div>
          <div className="address"><MapPin size={18} /><span>{data.business.address}</span></div>
          <div className="home-actions"><Link to="/booking"><Button>Afspraak maken</Button></Link><Link to="/queue" className="secondary-action"><Clock3 size={19} /> Aansluiten bij wachtrij</Link></div>
          <div className="section-heading"><h2>Onze services</h2><span>Centro Kapper</span></div>
          {data.services.length === 0 ? <div className="empty-state"><p className="eyebrow">GEEN SERVICES</p><p>Er zijn momenteel geen services beschikbaar.</p></div> : <div className="featured-services">{data.services.map(service => <Card key={service.id} className="featured-service"><Scissors size={21} aria-hidden="true" /><div><b>{service.name}</b><small>{service.description} · {service.durationMinutes} min</small></div><strong>{formatPriceCents(service.priceCents)}</strong></Card>)}</div>}
        </>
      )}
    </div>
    <aside className="home-aside">
      {!loading && !error && data && (
        <>
          <Card className="hours-card"><div><p className="eyebrow">OPENINGSTIJDEN</p><h3>{data.hoursSummary}</h3><p>Vandaag staan we voor je klaar.</p></div><Clock3 /></Card>
          <div className="contact-actions"><a href={`tel:${data.business.phone}`}><Phone size={18} /> Contact</a>{data.business.address ? <a href={`https://maps.google.com/?q=${encodeURIComponent(data.business.address)}`} target="_blank" rel="noreferrer"><Navigation size={18} /> Route</a> : null}</div>
        </>
      )}
    </aside>
    <BottomNav />
  </main>
}
