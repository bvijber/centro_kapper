export const business = { name: 'Centro Kapper', address: 'Nieuwe Markt 12, Breda', phone: '+31 76 204 03 03', hours: 'Ma–Za · 09:00–18:00', status: 'Nu open', statusDetail: 'Sluit vandaag om 18:00' }
export const barbers = [{ name: 'Sam Vermeer', role: 'Barber & eigenaar', rating: '4.9', image: 'https://i.pravatar.cc/160?img=12' }]
export const services = [{ name: 'Knippen', detail: 'Knippen & styling', price: '€ 30', duration: '35 min' }, { name: 'Baard trimmen', detail: 'Vormgeven & trimmen', price: '€ 20', duration: '25 min' }, { name: 'Knippen + baard', detail: 'Complete verzorging', price: '€40', duration: '45 min' }]
export type AppointmentStatus = 'Nieuw' | 'Bevestigd' | 'In behandeling' | 'Afgerond' | 'Geannuleerd' | 'Niet verschenen'
export type Appointment = { id: number; date: string; time: string; customer: string; service: string; duration: string; phone: string; email?: string; status: AppointmentStatus; note?: string; source?: 'Telefonisch' | 'WhatsApp' | 'Walk-in' | 'Medewerker toegevoegd' }
const dateFromToday = (offset: number) => { const date = new Date(); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10) }
export const appointments: Appointment[] = [
  { id: 1, date: dateFromToday(0), time: '09:30', customer: 'Daan Jansen', service: 'Knippen', duration: '45 min', phone: '+31 6 12 34 56 78', status: 'Bevestigd' },
  { id: 2, date: dateFromToday(0), time: '10:30', customer: 'Noah Smit', service: 'Knippen + baard', duration: '60 min', phone: '+31 6 23 45 67 89', status: 'Nieuw', note: 'Graag iets korter aan de zijkanten.' },
  { id: 3, date: dateFromToday(0), time: '12:00', customer: 'Finn de Boer', service: 'Baard trimmen', duration: '25 min', phone: '+31 6 34 56 78 90', status: 'Bevestigd' },
  { id: 4, date: dateFromToday(1), time: '09:00', customer: 'Lucas Visser', service: 'Knippen', duration: '45 min', phone: '+31 6 45 67 89 01', status: 'Nieuw' },
  { id: 5, date: dateFromToday(1), time: '11:00', customer: 'Mees Mulder', service: 'Knippen + baard', duration: '60 min', phone: '+31 6 56 78 90 12', status: 'Bevestigd' },
]
