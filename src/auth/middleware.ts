import { createMiddleware } from '@tanstack/react-start'

import { getCurrentUser } from './auth.service.server'

export const authMiddleware = createMiddleware({ type: 'function' })
  .server(async ({ next }) => next({ context: { user: await getCurrentUser() } }))
