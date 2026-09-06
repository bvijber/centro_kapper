import { createServerFn } from '@tanstack/react-start'

import { requireAuthenticatedUser } from '../auth/authorization'
import { getCurrentUser } from '../auth/auth.service.server'
import { authorizeAppointmentCreate } from './appointment.authorization'
import { createAppointment, getAppointment, listCustomerAppointments, listStaffAppointments } from './appointment.service.server'
import { appointmentCreateSchema, appointmentIdSchema, appointmentListSchema } from './appointment.schemas'

export const createAppointmentFn = createServerFn({ method: 'POST' }).validator(appointmentCreateSchema).handler(async ({ data }) => {
  const user = await getCurrentUser()
  const actor = authorizeAppointmentCreate(data, user)
  return createAppointment(data, actor)
})

export const getAppointmentFn = createServerFn({ method: 'GET' }).validator(appointmentIdSchema).handler(async ({ data }) => {
  const user = await requireAuthenticatedUser()
  return getAppointment(data.id, user.role === 'customer' ? user.id : undefined)
})

export const listAppointmentsFn = createServerFn({ method: 'GET' }).validator(appointmentListSchema).handler(async ({ data }) => {
  const user = await requireAuthenticatedUser()
  return user.role === 'staff' ? listStaffAppointments(data) : listCustomerAppointments(user.id, data)
})
