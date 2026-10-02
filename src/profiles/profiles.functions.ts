import { createServerFn } from '@tanstack/react-start'

import { requireCustomer, requireOwner } from '../auth/authorization'
import { customerProfileUpdateSchema, staffProfileUpdateSchema } from './profiles.schemas'
import { getCustomerProfile, getStaffProfile, updateCustomerProfile, updateStaffProfile } from './profiles.service.server'

export const getMyCustomerProfileFn = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireCustomer()
  return getCustomerProfile(user.id)
})

export const updateMyCustomerProfileFn = createServerFn({ method: 'POST' }).validator(customerProfileUpdateSchema).handler(async ({ data }) => {
  const user = await requireCustomer()
  return updateCustomerProfile(user.id, data)
})

export const getMyStaffProfileFn = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireOwner()
  return getStaffProfile(user.id)
})

export const updateMyStaffProfileFn = createServerFn({ method: 'POST' }).validator(staffProfileUpdateSchema).handler(async ({ data }) => {
  const user = await requireOwner()
  return updateStaffProfile(user.id, data)
})
