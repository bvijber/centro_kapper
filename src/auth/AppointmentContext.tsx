import { createContext, useContext, useState, type ReactNode } from 'react'
import { appointments as seedAppointments, type Appointment, type AppointmentStatus } from '../data/mockData'
type AppointmentContextValue = { appointments: Appointment[]; addAppointment: (appointment: Omit<Appointment, 'id'>) => void; updateAppointment: (id: number, changes: Partial<Appointment>) => void }
const AppointmentContext = createContext<AppointmentContextValue | undefined>(undefined)
export function AppointmentProvider({ children }: { children: ReactNode }) { const [appointments, setAppointments] = useState(seedAppointments); const addAppointment = (appointment: Omit<Appointment, 'id'>) => setAppointments(current => [...current, { ...appointment, id: Date.now() }]); const updateAppointment = (id: number, changes: Partial<Appointment>) => setAppointments(current => current.map(item => item.id === id ? { ...item, ...changes } : item)); return <AppointmentContext.Provider value={{ appointments, addAppointment, updateAppointment }}>{children}</AppointmentContext.Provider> }
export function useAppointments() { const context = useContext(AppointmentContext); if (!context) throw new Error('useAppointments must be used within AppointmentProvider'); return context }
export type { AppointmentStatus }
