import { createServerFn } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'
import { createHash } from 'node:crypto'

import { requireAuthenticatedUser } from '../auth/authorization'
import { getCurrentUser } from '../auth/auth.service.server'
import { consumeRateLimit } from '../auth/rate-limit.server'
import { availabilitySchema } from '../availability/availability.schemas'
import { authorizeAppointmentCreate } from './appointment.authorization'
import { AppointmentError, createAppointment, getAppointment, getAvailability, listBookableServices, listCustomerAppointments, listStaffAppointments } from './appointment.service.server'
import { appointmentCreateSchema, appointmentIdSchema, appointmentListSchema } from './appointment.schemas'

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
