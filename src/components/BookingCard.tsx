import type { ReactNode } from 'react'
import { CalendarDays, Clock3, MapPin } from 'lucide-react'
import type { AppointmentDTO } from '../appointments/appointment.service.server'
import { appointmentStatusClass, appointmentStatusLabel, formatPriceCents } from '../appointments/appointment.presentation'
import { formatAmsterdamDate, formatAmsterdamTime } from '../timezone'
import { Card } from './Card'

export function BookingCard({ appointment, children }: { appointment: AppointmentDTO; children?: ReactNode }) {
  return <Card className="booking-card">
    <span className={`appointment-status ${appointmentStatusClass(appointment.status)}`}>{appointmentStatusLabel(appointment.status)}</span>
    <div className="booking-main">
      <div className="business-mark">CK</div>
      <div><h3>{appointment.serviceNameAtBooking}</h3><p><MapPin size={15} /> Nieuwe Markt 12, Breda</p></div>
    </div>
    <div className="booking-meta">
      <span><CalendarDays size={18} /> {formatAmsterdamDate(appointment.startsAt)}</span>
      <span><Clock3 size={18} /> {formatAmsterdamTime(appointment.startsAt)} – {formatAmsterdamTime(appointment.endsAt)}</span>
    </div>
    <p className="booking-price">{formatPriceCents(appointment.servicePriceCentsAtBooking)}</p>
    {children}
  </Card>
}