import { createServerFn } from '@tanstack/react-start'

import { requireOwner } from '../auth/authorization'
import { getStaffDashboard } from './dashboard.service.server'

export const getStaffDashboardFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireOwner()
  return getStaffDashboard()
})
