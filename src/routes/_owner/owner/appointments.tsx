import { createFileRoute } from '@tanstack/react-router'
import { OwnerAppointments } from '../../../pages/OwnerAppointments'

export const Route = createFileRoute('/_owner/owner/appointments')({ component: OwnerAppointments })
