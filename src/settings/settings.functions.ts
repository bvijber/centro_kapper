import { createServerFn } from '@tanstack/react-start'

import { requireStaff } from '../auth/authorization'
import {
  breakPeriodCreateSchema,
  breakPeriodDeleteSchema,
  businessProfileUpdateSchema,
  openingHoursUpdateSchema,
  wholeDayBlockCreateSchema,
  wholeDayBlockDeleteSchema,
} from './settings.schemas'
import {
  createBreakPeriod,
  createWholeDayBlock,
  deleteBreakPeriod,
  deleteWholeDayBlock,
  getBusinessProfile,
  getOpeningHours,
  getSettings,
  updateBusinessProfile,
  updateOpeningHours,
} from './settings.service.server'

export const getBusinessProfileFn = createServerFn({ method: 'GET' }).handler(() => getBusinessProfile())
export const getOpeningHoursFn = createServerFn({ method: 'GET' }).handler(() => getOpeningHours())

export const getSettingsFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireStaff()
  return getSettings()
})

export const updateBusinessProfileFn = createServerFn({ method: 'POST' }).validator(businessProfileUpdateSchema).handler(async ({ data }) => {
  await requireStaff()
  return updateBusinessProfile(data)
})

export const updateOpeningHoursFn = createServerFn({ method: 'POST' }).validator(openingHoursUpdateSchema).handler(async ({ data }) => {
  await requireStaff()
  return updateOpeningHours(data)
})

export const createBreakPeriodFn = createServerFn({ method: 'POST' }).validator(breakPeriodCreateSchema).handler(async ({ data }) => {
  await requireStaff()
  return createBreakPeriod(data)
})

export const deleteBreakPeriodFn = createServerFn({ method: 'POST' }).validator(breakPeriodDeleteSchema).handler(async ({ data }) => {
  await requireStaff()
  return deleteBreakPeriod(data.id)
})

export const createWholeDayBlockFn = createServerFn({ method: 'POST' }).validator(wholeDayBlockCreateSchema).handler(async ({ data }) => {
  await requireStaff()
  return createWholeDayBlock(data)
})

export const deleteWholeDayBlockFn = createServerFn({ method: 'POST' }).validator(wholeDayBlockDeleteSchema).handler(async ({ data }) => {
  await requireStaff()
  return deleteWholeDayBlock(data.id)
})
