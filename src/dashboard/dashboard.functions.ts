import { createServerFn } from '@tanstack/react-start'

import { requireOwner } from '../auth/authorization'
import { getOwnerDashboard } from './dashboard.service.server'

export const getOwnerDashboardFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireOwner()
  return getOwnerDashboard()
})
