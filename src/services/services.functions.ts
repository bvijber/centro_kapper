import { createServerFn } from '@tanstack/react-start'

import { requireOwner } from '../auth/authorization'
import { serviceCreateSchema, serviceIdSchema, serviceUpdateRequestSchema } from './services.schemas'
import { activateService, archiveService, createService, deactivateService, listServices, updateService } from './services.service.server'

export const listServicesFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireOwner()
  return listServices()
})

export const createServiceFn = createServerFn({ method: 'POST' }).validator(serviceCreateSchema).handler(async ({ data }) => {
  await requireOwner()
  return createService(data)
})

export const updateServiceFn = createServerFn({ method: 'POST' }).validator(serviceUpdateRequestSchema).handler(async ({ data }) => {
  await requireOwner()
  return updateService(data.id, data)
})

export const activateServiceFn = createServerFn({ method: 'POST' }).validator(serviceIdSchema).handler(async ({ data }) => {
  await requireOwner()
  return activateService(data.id)
})

export const deactivateServiceFn = createServerFn({ method: 'POST' }).validator(serviceIdSchema).handler(async ({ data }) => {
  await requireOwner()
  return deactivateService(data.id)
})

export const archiveServiceFn = createServerFn({ method: 'POST' }).validator(serviceIdSchema).handler(async ({ data }) => {
  await requireOwner()
  return archiveService(data.id)
})
