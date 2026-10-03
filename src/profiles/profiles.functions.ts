import { createServerFn } from '@tanstack/react-start'

import { requireCustomer, requireOwner } from '../auth/authorization'
import { customerProfileUpdateSchema, ownerProfileUpdateSchema } from './profiles.schemas'
import { getCustomerProfile, getOwnerProfile, updateCustomerProfile, updateOwnerProfile } from './profiles.service.server'

export const getMyCustomerProfileFn = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireCustomer()
  return getCustomerProfile(user.id)
})

export const updateMyCustomerProfileFn = createServerFn({ method: 'POST' }).validator(customerProfileUpdateSchema).handler(async ({ data }) => {
  const user = await requireCustomer()
  return updateCustomerProfile(user.id, data)
})

export const getMyOwnerProfileFn = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireOwner()
  return getOwnerProfile(user.id)
})

export const updateMyOwnerProfileFn = createServerFn({ method: 'POST' }).validator(ownerProfileUpdateSchema).handler(async ({ data }) => {
  const user = await requireOwner()
  return updateOwnerProfile(user.id, data)
})
