import { createHash } from 'node:crypto'

import { createServerFn } from '@tanstack/react-start'

import { requireCustomer, requireOwner } from '../auth/authorization'
import { getCurrentUser } from '../auth/auth.service.server'
import { consumeRateLimit } from '../auth/rate-limit.server'
import { getClientIP } from '../auth/request-context.server'
import {
  authorizeQueueJoin,
  resolveQueueActor,
} from './queue.authorization'
import {
  QueueError,
  cancelQueueEntry,
  callQueueEntry,
  completeQueueEntry,
  getQueueEntry,
  getQueueEntryMetadata,
  joinQueue,
  leaveQueue,
  listCustomerQueue,
  listStaffQueue,
  rejoinQueueEntry,
  skipQueueEntry,
  startQueueService,
} from './queue.service.server'
import {
  queueDateSchema,
  queueEntryIdSchema,
  queueJoinSchema,
  queueStartServiceSchema,
} from './queue.schemas'

const QUEUE_RATE_LIMIT = 20
const QUEUE_RATE_WINDOW_SECONDS = 15 * 60

function rateLimitSubject(actor: { kind: 'guest' | 'customer' | 'staff'; userId?: string }): string {
  return actor.kind === 'guest'
    ? getClientIP() ?? 'unknown'
    : actor.userId ?? 'unknown'
}

async function enforceQueueMutationRateLimit(action: string, actor: { kind: 'guest' | 'customer' | 'staff'; userId?: string }): Promise<void> {
  const subject = createHash('sha256').update(rateLimitSubject(actor)).digest('hex')
  const key = `queue-${action}:${subject}`
  if (!(await consumeRateLimit(key, QUEUE_RATE_LIMIT, QUEUE_RATE_WINDOW_SECONDS))) {
    throw new QueueError('Deze queue-actie is tijdelijk niet beschikbaar.', 'FAILED')
  }
}

export const joinQueueFn = createServerFn({ method: 'POST' })
  .validator(queueJoinSchema)
  .handler(async ({ data }) => {
    const user = await getCurrentUser()
    const actor = authorizeQueueJoin(data, user)
    await enforceQueueMutationRateLimit('join', actor)
    return joinQueue(data, actor)
  })

export const getQueueEntryFn = createServerFn({ method: 'GET' })
  .validator(queueEntryIdSchema)
  .handler(async ({ data }) => {
    const user = await getCurrentUser()
    return getQueueEntry(data.id, user ? resolveQueueActor(user) : { kind: 'guest', capability: data.capability })
  })

export const getQueueEntryPositionFn = createServerFn({ method: 'GET' })
  .validator(queueEntryIdSchema)
  .handler(async ({ data }) => {
    const user = await getCurrentUser()
    return getQueueEntryMetadata(data.id, user ? resolveQueueActor(user) : { kind: 'guest', capability: data.capability })
  })

export const listStaffQueueFn = createServerFn({ method: 'GET' })
  .validator(queueDateSchema)
  .handler(async ({ data }) => {
    const user = await requireOwner()
    return listStaffQueue(data.queueDate, resolveQueueActor(user))
  })

export const listCustomerQueueFn = createServerFn({ method: 'GET' })
  .validator(queueDateSchema)
  .handler(async ({ data }) => {
    const user = await requireCustomer()
    return listCustomerQueue(user.id, data.queueDate, resolveQueueActor(user))
  })

export const leaveQueueFn = createServerFn({ method: 'POST' })
  .validator(queueEntryIdSchema)
  .handler(async ({ data }) => {
    const user = await getCurrentUser()
    const actor = user ? resolveQueueActor(user) : { kind: 'guest' as const, capability: data.capability }
    await enforceQueueMutationRateLimit('leave', actor)
    return leaveQueue(data.id, actor)
  })

export const callQueueEntryFn = createServerFn({ method: 'POST' })
  .validator(queueEntryIdSchema)
  .handler(async ({ data }) => {
    const user = await requireOwner()
    const actor = resolveQueueActor(user)
    await enforceQueueMutationRateLimit('staff', actor)
    return callQueueEntry(data.id, actor)
  })

export const startQueueServiceFn = createServerFn({ method: 'POST' })
  .validator(queueStartServiceSchema)
  .handler(async ({ data }) => {
    const user = await requireOwner()
    const actor = resolveQueueActor(user)
    await enforceQueueMutationRateLimit('staff', actor)
    return startQueueService(data.id, actor, data.appointmentId)
  })

export const completeQueueEntryFn = createServerFn({ method: 'POST' })
  .validator(queueEntryIdSchema)
  .handler(async ({ data }) => {
    const user = await requireOwner()
    const actor = resolveQueueActor(user)
    await enforceQueueMutationRateLimit('staff', actor)
    return completeQueueEntry(data.id, actor)
  })

export const cancelQueueEntryFn = createServerFn({ method: 'POST' })
  .validator(queueEntryIdSchema)
  .handler(async ({ data }) => {
    const user = await requireOwner()
    const actor = resolveQueueActor(user)
    await enforceQueueMutationRateLimit('staff', actor)
    return cancelQueueEntry(data.id, actor)
  })

export const skipQueueEntryFn = createServerFn({ method: 'POST' })
  .validator(queueEntryIdSchema)
  .handler(async ({ data }) => {
    const user = await requireOwner()
    const actor = resolveQueueActor(user)
    await enforceQueueMutationRateLimit('staff', actor)
    return skipQueueEntry(data.id, actor)
  })

export const rejoinQueueEntryFn = createServerFn({ method: 'POST' })
  .validator(queueEntryIdSchema)
  .handler(async ({ data }) => {
    const user = await requireOwner()
    const actor = resolveQueueActor(user)
    await enforceQueueMutationRateLimit('staff', actor)
    return rejoinQueueEntry(data.id, actor)
  })
