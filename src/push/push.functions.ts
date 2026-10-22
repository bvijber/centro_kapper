import { createHash } from 'node:crypto'

import { createServerFn } from '@tanstack/react-start'

import { getCurrentUser } from '../auth/auth.service.server'
import { consumeRateLimit } from '../auth/rate-limit.server'
import { getClientIP } from '../auth/request-context.server'
import type { QueueActor } from '../queue/queue.authorization'
import {
  PushError,
  getPushConfig,
  getPushSubscriptionStatus,
  registerPushSubscription,
  unregisterPushSubscription,
} from './push.service.server'
import {
  pushSubscriptionRegisterSchema,
  pushSubscriptionStatusSchema,
  pushSubscriptionUnregisterSchema,
} from './push.schemas'

const PUSH_RATE_LIMIT = 20
const PUSH_RATE_WINDOW_SECONDS = 15 * 60

function resolvePushActor(user: Awaited<ReturnType<typeof getCurrentUser>>, capability?: string): QueueActor {
  if (!user) return { kind: 'guest', capability }
  return user.role === 'owner' ? { kind: 'owner', userId: user.id } : { kind: 'customer', userId: user.id }
}

async function enforcePushMutationRateLimit(action: string, actor: QueueActor): Promise<void> {
  const subject = actor.kind === 'guest' ? getClientIP() ?? 'unknown' : actor.userId
  const key = `push-${action}:${createHash('sha256').update(subject).digest('hex')}`
  if (!(await consumeRateLimit(key, PUSH_RATE_LIMIT, PUSH_RATE_WINDOW_SECONDS))) {
    throw new PushError('Pushacties zijn tijdelijk niet beschikbaar.', 'FAILED')
  }
}

export const getPushConfigFn = createServerFn({ method: 'GET' }).handler(async () => getPushConfig())

export const registerPushSubscriptionFn = createServerFn({ method: 'POST' })
  .validator(pushSubscriptionRegisterSchema)
  .handler(async ({ data }) => {
    const actor = resolvePushActor(await getCurrentUser(), data.capability)
    await enforcePushMutationRateLimit('subscribe', actor)
    return registerPushSubscription(data, actor)
  })

export const getPushSubscriptionStatusFn = createServerFn({ method: 'GET' })
  .validator(pushSubscriptionStatusSchema)
  .handler(async ({ data }) => {
    const actor = resolvePushActor(await getCurrentUser(), data.capability)
    return getPushSubscriptionStatus(data, actor)
  })

export const unregisterPushSubscriptionFn = createServerFn({ method: 'POST' })
  .validator(pushSubscriptionUnregisterSchema)
  .handler(async ({ data }) => {
    const actor = resolvePushActor(await getCurrentUser(), data.capability)
    await enforcePushMutationRateLimit('unsubscribe', actor)
    return unregisterPushSubscription(data, actor)
  })
