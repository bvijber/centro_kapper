import { createFileRoute } from '@tanstack/react-router'
import { OwnerDashboard } from '../../../pages/OwnerDashboard'

export const Route = createFileRoute('/_owner/owner/')({ component: OwnerDashboard })
