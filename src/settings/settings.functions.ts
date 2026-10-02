import { createServerFn } from '@tanstack/react-start'

import { requireOwner } from '../auth/authorization'
import {
  breakPeriodCreateSchema,
  breakPeriodDeleteSchema,
  bookingSettingsUpdateSchema,
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
  getBookingSettings,
  getOpeningHours,
  getSettings,
  updateBusinessProfile,
  updateBookingSettings,
  updateOpeningHours,
} from './settings.service.server'

export const getBusinessProfileFn = createServerFn({ method: 'GET' }).handler(() => getBusinessProfile())
export const getOpeningHoursFn = createServerFn({ method: 'GET' }).handler(() => getOpeningHours())

export const getBookingSettingsFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireOwner()
  return getBookingSettings()
})

export const getSettingsFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireOwner()
  return getSettings()
})

export const updateBusinessProfileFn = createServerFn({ method: 'POST' }).validator(businessProfileUpdateSchema).handler(async ({ data }) => {
  await requireOwner()
  return updateBusinessProfile(data)
})

export const updateBookingSettingsFn = createServerFn({ method: 'POST' }).validator(bookingSettingsUpdateSchema).handler(async ({ data }) => {
  await requireOwner()
  return updateBookingSettings(data)
})

export const updateOpeningHoursFn = createServerFn({ method: 'POST' }).validator(openingHoursUpdateSchema).handler(async ({ data }) => {
  await requireOwner()
  return updateOpeningHours(data)
})

export const createBreakPeriodFn = createServerFn({ method: 'POST' }).validator(breakPeriodCreateSchema).handler(async ({ data }) => {
  await requireOwner()
  return createBreakPeriod(data)
})

export const deleteBreakPeriodFn = createServerFn({ method: 'POST' }).validator(breakPeriodDeleteSchema).handler(async ({ data }) => {
  await requireOwner()
  return deleteBreakPeriod(data.id)
})

export const createWholeDayBlockFn = createServerFn({ method: 'POST' }).validator(wholeDayBlockCreateSchema).handler(async ({ data }) => {
  await requireOwner()
  return createWholeDayBlock(data)
})

export const deleteWholeDayBlockFn = createServerFn({ method: 'POST' }).validator(wholeDayBlockDeleteSchema).handler(async ({ data }) => {
  await requireOwner()
  return deleteWholeDayBlock(data.id)
})
