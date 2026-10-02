import { createFileRoute } from '@tanstack/react-router'
import { StaffAppointments } from '../../../pages/StaffAppointments'

export const Route = createFileRoute('/_owner/owner/appointments')({ component: StaffAppointments })
