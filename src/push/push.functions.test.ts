import { randomUUID } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string; role: 'customer' | 'owner'; name: string | null; phone: string | null } | null,
  rateAllowed: true,
}))

const serviceMocks = vi.hoisted(() => ({
  getPushConfig: vi.fn(),
  registerPushSubscription: vi.fn(),
  getPushSubscriptionStatus: vi.fn(),
  unregisterPushSubscription: vi.fn(),
}))

vi.mock('@tanstack/react-start/server', () => ({ getRequestIP: () => '192.0.2.10', getRequestHeader: () => undefined }))
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    let validator: { parse: (value: unknown) => unknown } | undefined
    const builder = {
      validator(nextValidator: { parse: (value: unknown) => unknown }) {
        validator = nextValidator
        return builder
      },
      handler(handler: (options: { data: unknown }) => unknown) {
        return async ({ data }: { data: unknown }) => handler({ data: validator?.parse(data) ?? data })
      },
    }
    return builder
  },
}))
vi.mock('../db/client.server', () => ({ db: {} }))
vi.mock('../auth/auth.service.server', () => ({ getCurrentUser: vi.fn(async () => state.user) }))
vi.mock('../auth/rate-limit.server', () => ({ consumeRateLimit: vi.fn(async () => state.rateAllowed) }))
vi.mock('../auth/request-context.server', () => ({ getClientIP: () => '192.0.2.10' }))
vi.mock('./push.service.server', async () => {
  const { PushError } = await vi.importActual<typeof import('./push.service.server')>('./push.service.server')
  return { PushError, ...serviceMocks }
})

import {
  getPushConfigFn,
  getPushSubscriptionStatusFn,
  registerPushSubscriptionFn,
  unregisterPushSubscriptionFn,
} from './push.functions'

const customer = { id: randomUUID(), email: 'customer@example.test', role: 'customer' as const, name: 'Customer', phone: '0612345678' }
const owner = { id: randomUUID(), email: 'owner@example.test', role: 'owner' as const, name: 'Owner', phone: '0612345678' }
const entryId = randomUUID()
const subscriptionInput = {
  queueEntryId: entryId,
  endpoint: 'https://push.example.test/endpoint/abc123',
  p256dh: 'BL7ELU24fJTAlH5Kyl8N6BDCac8u8li_U5PIwG963MOvdYs9s7LSzj8x_7v7RFdLZ9Eap50PiiyF5K0TDAis7t0',
  auth: 'juarI8x__VnHvsOgfeAPHg',
  capability: 'c'.repeat(64),
}

function resetMocks() {
  state.user = null
  state.rateAllowed = true
  Object.values(serviceMocks).forEach((mock) => mock.mockReset())
  serviceMocks.getPushConfig.mockResolvedValue({ publicKey: 'test-public-key' })
  serviceMocks.registerPushSubscription.mockResolvedValue({ id: randomUUID(), queueEntryId: entryId, active: true })
  serviceMocks.getPushSubscriptionStatus.mockResolvedValue({ subscribed: true })
  serviceMocks.unregisterPushSubscription.mockResolvedValue({ queueEntryId: entryId, active: false })
}

describe('push Server Function boundary', () => {
  it('exposes the public config without authentication', async () => {
    resetMocks()
    await expect(getPushConfigFn({ data: undefined })).resolves.toEqual({ publicKey: 'test-public-key' })
    expect(serviceMocks.getPushConfig).toHaveBeenCalledTimes(1)
  })

  it('registers with the customer actor from the session', async () => {
    resetMocks()
    state.user = customer
    const { capability: _capability, ...customerInput } = subscriptionInput

    await expect(registerPushSubscriptionFn({ data: customerInput })).resolves.toMatchObject({ queueEntryId: entryId, active: true })
    expect(serviceMocks.registerPushSubscription).toHaveBeenCalledWith(customerInput, { kind: 'customer', userId: customer.id })
  })

  it('registers with the guest actor including capability', async () => {
    resetMocks()

    await expect(registerPushSubscriptionFn({ data: subscriptionInput })).resolves.toMatchObject({ queueEntryId: entryId, active: true })
    expect(serviceMocks.registerPushSubscription).toHaveBeenCalledWith(subscriptionInput, { kind: 'guest', capability: subscriptionInput.capability })
  })

  it('passes the owner actor to the service for server-side rejection', async () => {
    resetMocks()
    state.user = owner
    const { capability: _capability, ...customerInput } = subscriptionInput

    await expect(registerPushSubscriptionFn({ data: customerInput })).resolves.toMatchObject({ queueEntryId: entryId, active: true })
    expect(serviceMocks.registerPushSubscription).toHaveBeenCalledWith(customerInput, { kind: 'owner', userId: owner.id })
  })

  it('rejects invalid input and rate-limited mutations before the service', async () => {
    resetMocks()
    state.user = customer
    const { capability: _capability, ...customerInput } = subscriptionInput

    await expect(registerPushSubscriptionFn({ data: { ...customerInput, endpoint: 'geen-url' } })).rejects.toThrow()
    expect(serviceMocks.registerPushSubscription).not.toHaveBeenCalled()

    state.rateAllowed = false
    await expect(registerPushSubscriptionFn({ data: customerInput })).rejects.toMatchObject({ code: 'FAILED' })
    expect(serviceMocks.registerPushSubscription).not.toHaveBeenCalled()
  })

  it('reads status and unregisters through the boundary', async () => {
    resetMocks()
    state.user = customer

    await expect(getPushSubscriptionStatusFn({ data: { queueEntryId: entryId } })).resolves.toEqual({ subscribed: true })
    expect(serviceMocks.getPushSubscriptionStatus).toHaveBeenCalledWith({ queueEntryId: entryId }, { kind: 'customer', userId: customer.id })

    await expect(unregisterPushSubscriptionFn({ data: { queueEntryId: entryId, endpoint: subscriptionInput.endpoint } })).resolves.toEqual({ queueEntryId: entryId, active: false })
    expect(serviceMocks.unregisterPushSubscription).toHaveBeenCalledWith(
      { queueEntryId: entryId, endpoint: subscriptionInput.endpoint },
      { kind: 'customer', userId: customer.id },
    )
  })
})
