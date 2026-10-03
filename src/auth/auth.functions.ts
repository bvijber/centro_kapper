import { createServerFn } from '@tanstack/react-start'

import { login, logout, getCurrentUser, refreshSession, registerCustomer } from './auth.service.server'
import { loginSchema, parseRegisterCustomerInput } from './auth.schemas'

export const registerCustomerFn = createServerFn({ method: 'POST' })
  .validator(parseRegisterCustomerInput)
  .handler(({ data }) => registerCustomer(data))

export const loginFn = createServerFn({ method: 'POST' })
  .validator(loginSchema)
  .handler(({ data }) => login(data))

export const logoutFn = createServerFn({ method: 'POST' })
  .handler(() => logout())

export const getCurrentUserFn = createServerFn({ method: 'GET' })
  .handler(() => getCurrentUser())

export const refreshSessionFn = createServerFn({ method: 'POST' })
  .handler(() => refreshSession())
