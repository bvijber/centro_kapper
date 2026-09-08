import { createServerFn } from '@tanstack/react-start'

import { requireStaff } from '../auth/authorization'
import { getStaffDashboard } from './dashboard.service.server'

export const getStaffDashboardFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireStaff()
  return getStaffDashboard()
})