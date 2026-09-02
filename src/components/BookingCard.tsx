import { CalendarDays, Clock3, MapPin } from 'lucide-react'
import { Card } from './Card'
export function BookingCard() { return <Card className="booking-card"><span className="badge">In afwachting</span><div className="booking-main"><div className="business-mark">CK</div><div><h3>Centro Kapper</h3><p><MapPin size={15} /> Nieuwe Markt 12, Breda</p></div></div><div className="booking-meta"><span><CalendarDays size={18} /> 14 juni 2026</span><span><Clock3 size={18} /> 18:30</span></div></Card> }
