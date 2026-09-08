import { createServerFn } from '@tanstack/react-start'

import { requireStaff } from '../auth/authorization'
import { serviceCreateSchema, serviceIdSchema, serviceUpdateRequestSchema } from './services.schemas'
import { activateService, archiveService, createService, deactivateService, listServices, updateService } from './services.service.server'

export const listServicesFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireStaff()
  return listServices()
})

export const createServiceFn = createServerFn({ method: 'POST' }).validator(serviceCreateSchema).handler(async ({ data }) => {
  await requireStaff()
  return createService(data)
})

export const updateServiceFn = createServerFn({ method: 'POST' }).validator(serviceUpdateRequestSchema).handler(async ({ data }) => {
  await requireStaff()
  return updateService(data.id, data)
})

export const activateServiceFn = createServerFn({ method: 'POST' }).validator(serviceIdSchema).handler(async ({ data }) => {
  await requireStaff()
  return activateService(data.id)
})

export const deactivateServiceFn = createServerFn({ method: 'POST' }).validator(serviceIdSchema).handler(async ({ data }) => {
  await requireStaff()
  return deactivateService(data.id)
})

export const archiveServiceFn = createServerFn({ method: 'POST' }).validator(serviceIdSchema).handler(async ({ data }) => {
  await requireStaff()
  return archiveService(data.id)
})