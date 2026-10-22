import { createHash } from 'node:crypto'

import { createServerFn } from '@tanstack/react-start'

import { requireOwner } from '../auth/authorization'
import { consumeRateLimit } from '../auth/rate-limit.server'
import {
  getOwnerPushConfig,
  getOwnerPushStatus,
  listOwnerPushSubscriptions,
  OwnerPushError,
  registerOwnerPushSubscription,
  unregisterOwnerPushSubscription,
} from './owner-push.service.server'
import {
  ownerPushRegisterSchema,
  ownerPushStatusSchema,
  ownerPushSubscriptionIdSchema,
} from './owner-push.schemas'

/**
 * Serverfuncties voor de pushmeldingen van de **eigenaar**
 * (BUSINESS_RULES.md §29 "Eigenaarpush").
 *
 * Elke functie dwingt `requireOwner()` af: alleen de eigenaar mag
 * eigenaarpush beheren. De klantenpush (`push.functions.ts`) blijft volledig
 * gescheiden; er wordt geen code gedeeld.
 */
const OWNER_PUSH_RATE_LIMIT = 20
const OWNER_PUSH_RATE_WINDOW_SECONDS = 15 * 60

async function enforceOwnerPushRateLimit(action: string, ownerUserId: string): Promise<void> {
  const subject = createHash('sha256').update(ownerUserId).digest('hex')
  const key = `owner-push-${action}:${subject}`
  if (!(await consumeRateLimit(key, OWNER_PUSH_RATE_LIMIT, OWNER_PUSH_RATE_WINDOW_SECONDS))) {
    throw new OwnerPushError('Pushacties zijn tijdelijk niet beschikbaar.', 'FAILED')
  }
}

export const getOwnerPushConfigFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireOwner()
  return getOwnerPushConfig()
})

export const registerOwnerPushSubscriptionFn = createServerFn({ method: 'POST' })
  .validator(ownerPushRegisterSchema)
  .handler(async ({ data }) => {
    const owner = await requireOwner()
    await enforceOwnerPushRateLimit('subscribe', owner.id)
    return registerOwnerPushSubscription(data, owner.id)
  })

export const unregisterOwnerPushSubscriptionFn = createServerFn({ method: 'POST' })
  .validator(ownerPushSubscriptionIdSchema)
  .handler(async ({ data }) => {
    const owner = await requireOwner()
    await enforceOwnerPushRateLimit('unsubscribe', owner.id)
    return unregisterOwnerPushSubscription(data.id, owner.id)
  })

export const listOwnerPushSubscriptionsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const owner = await requireOwner()
  return listOwnerPushSubscriptions(owner.id)
})

export const getOwnerPushStatusFn = createServerFn({ method: 'GET' })
  .validator(ownerPushStatusSchema)
  .handler(async ({ data }) => {
    const owner = await requireOwner()
    return getOwnerPushStatus(data.endpoint, owner.id)
  })
