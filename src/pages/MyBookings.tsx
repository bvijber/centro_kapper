import { CheckCircle2, Clock3 } from 'lucide-react'
import { BottomNav } from '../components/BottomNav'
import { BookingCard } from '../components/BookingCard'
import { CustomerHeader } from '../components/CustomerHeader'
export function MyBookings() { return <main className="page shell bookings-page"><CustomerHeader /><div className="hero-copy"><p className="eyebrow">CENTRO KAPPER</p><h1>Mijn<br /><em>afspraken.</em></h1><p className="lead">Beheer al je Centro Kapper afspraken op één plek.</p></div><div className="tabs"><button className="active"><Clock3 size={17} /> Aankomend</button><button><CheckCircle2 size={17} /> Voltooid</button></div><BookingCard /><BottomNav /></main> }
