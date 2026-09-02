import { createFileRoute } from '@tanstack/react-router'
import { StaffDashboard } from '../../pages/StaffDashboard'
export const Route = createFileRoute('/_staff/staff')({ component: StaffDashboard })
