import { createServerFn } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'
import { createHash } from 'node:crypto'

import { requireAuthenticatedUser, requireCustomer, requireStaff } from '../auth/authorization'
import { getCurrentUser } from '../auth/auth.service.server'
import { consumeRateLimit } from '../auth/rate-limit.server'
import { availabilitySchema } from '../availability/availability.schemas'
import { authorizeAppointmentCreate, resolveMutationActor } from './appointment.authorization'
import { AppointmentError, approveCancellationRequest, cancelAppointment, createAppointment, getAppointment, getAvailability, listBookableServices, listCancellationRequests, listCustomerAppointments, listStaffAppointments, modifyAppointment, rejectCancellationRequest, requestCancellation, updateAppointmentStatus, withdrawCancellationRequest } from './appointment.service.server'
import {
  appointmentCancelSchema,
  appointmentCreateSchema,
  appointmentIdSchema,
  appointmentListSchema,
  appointmentModifySchema,
  appointmentStatusUpdateSchema,
  cancellationRequestCreateSchema,
  cancellationRequestIdSchema,
  cancellationRequestListSchema,
} from './appointment.schemas'

export const createAppointmentFn = createServerFn({ method: 'POST' }).validator(appointmentCreateSchema).handler(async ({ data }) => {
  const user = await getCurrentUser()
  const actor = authorizeAppointmentCreate(data, user)
  const rateValue = actor.kind === 'guest' ? getRequestIP({ xForwardedFor: true }) ?? 'unknown' : actor.userId
  const rateKey = `appointment-create:${createHash('sha256').update(rateValue).digest('hex')}`
  if (!(await consumeRateLimit(rateKey, 20, 15 * 60))) throw new AppointmentError('Boeken is tijdelijk niet beschikbaar.', 'FAILED')
  return createAppointment(data, actor)
})

export const getAvailabilityFn = createServerFn({ method: 'GET' }).validator(availabilitySchema).handler(async ({ data }) => getAvailability(data))

export const listBookableServicesFn = createServerFn({ method: 'GET' }).handler(async () => listBookableServices())

export const getAppointmentFn = createServerFn({ method: 'GET' }).validator(appointmentIdSchema).handler(async ({ data }) => {
  const user = await requireAuthenticatedUser()
  return getAppointment(data.id, user.role === 'customer' ? user.id : undefined)
})

export const listAppointmentsFn = createServerFn({ method: 'GET' }).validator(appointmentListSchema).handler(async ({ data }) => {
  const user = await requireAuthenticatedUser()
  return user.role === 'staff' ? listStaffAppointments(data) : listCustomerAppointments(user.id, data)
})

export const updateAppointmentStatusFn = createServerFn({ method: 'POST' }).validator(appointmentStatusUpdateSchema).handler(async ({ data }) => {
  const user = await requireStaff()
  return updateAppointmentStatus(data.id, data.status, resolveMutationActor(user))
})

export const modifyAppointmentFn = createServerFn({ method: 'POST' }).validator(appointmentModifySchema).handler(async ({ data }) => {
  const user = await requireAuthenticatedUser()
  return modifyAppointment(data.id, data, resolveMutationActor(user))
})

export const cancelAppointmentFn = createServerFn({ method: 'POST' }).validator(appointmentCancelSchema).handler(async ({ data }) => {
  const user = await requireAuthenticatedUser()
  return cancelAppointment(data.id, resolveMutationActor(user))
})

export const requestCancellationFn = createServerFn({ method: 'POST' }).validator(cancellationRequestCreateSchema).handler(async ({ data }) => {
  const user = await requireCustomer()
  return requestCancellation(data.appointmentId, data.reason, resolveMutationActor(user))
})

export const withdrawCancellationRequestFn = createServerFn({ method: 'POST' }).validator(cancellationRequestIdSchema).handler(async ({ data }) => {
  const user = await requireAuthenticatedUser()
  return withdrawCancellationRequest(data.id, resolveMutationActor(user))
})

export const approveCancellationRequestFn = createServerFn({ method: 'POST' }).validator(cancellationRequestIdSchema).handler(async ({ data }) => {
  const user = await requireStaff()
  return approveCancellationRequest(data.id, resolveMutationActor(user))
})

export const rejectCancellationRequestFn = createServerFn({ method: 'POST' }).validator(cancellationRequestIdSchema).handler(async ({ data }) => {
  const user = await requireStaff()
  return rejectCancellationRequest(data.id, resolveMutationActor(user))
})

export const listCancellationRequestsFn = createServerFn({ method: 'GET' }).validator(cancellationRequestListSchema).handler(async ({ data }) => {
  const user = await requireAuthenticatedUser()
  return listCancellationRequests(data, resolveMutationActor(user))
})
