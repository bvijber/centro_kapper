import { randomUUID } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string; role: 'customer' | 'owner'; name: string | null; phone: string | null } | null,
  rateAllowed: true,
}))

const serviceMocks = vi.hoisted(() => ({
  getOwnerPushConfig: vi.fn(),
  registerOwnerPushSubscription: vi.fn(),
  unregisterOwnerPushSubscription: vi.fn(),
  listOwnerPushSubscriptions: vi.fn(),
  getOwnerPushStatus: vi.fn(),
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
vi.mock('../auth/authorization', () => ({
  requireOwner: vi.fn(async () => {
    if (!state.user) throw new Error('UNAUTHORIZED')
    if (state.user.role !== 'owner') {
      const error = new Error('Geen toegang.') as Error & { code: string }
      error.code = 'FORBIDDEN'
      throw error
    }
    return state.user
  }),
}))
vi.mock('../auth/rate-limit.server', () => ({ consumeRateLimit: vi.fn(async () => state.rateAllowed) }))
vi.mock('./owner-push.service.server', async () => {
  const actual = await vi.importActual<typeof import('./owner-push.service.server')>('./owner-push.service.server')
  return { ...actual, ...serviceMocks }
})

import {
  getOwnerPushConfigFn,
  getOwnerPushStatusFn,
  listOwnerPushSubscriptionsFn,
  registerOwnerPushSubscriptionFn,
  unregisterOwnerPushSubscriptionFn,
} from './owner-push.functions'

const customer = { id: randomUUID(), email: 'customer@example.test', role: 'customer' as const, name: 'Customer', phone: '0612345678' }
const owner = { id: randomUUID(), email: 'owner@example.test', role: 'owner' as const, name: 'Owner', phone: '0612345678' }
const subscriptionId = randomUUID()
const registerInput = {
  endpoint: 'https://push.example.test/owner/abc123',
  p256dh: 'BL7ELU24fJTAlH5Kyl8N6BDCac8u8li_U5PIwG963MOvdYs9s7LSzj8x_7v7RFdLZ9Eap50PiiyF5K0TDAis7t0',
  auth: 'juarI8x__VnHvsOgfeAPHg',
}

function resetMocks() {
  state.user = null
  state.rateAllowed = true
  Object.values(serviceMocks).forEach((mock) => mock.mockReset())
  serviceMocks.getOwnerPushConfig.mockResolvedValue({ publicKey: 'test-public-key' })
  serviceMocks.registerOwnerPushSubscription.mockResolvedValue({ id: subscriptionId, active: true, createdAt: new Date() })
  serviceMocks.unregisterOwnerPushSubscription.mockResolvedValue({ id: subscriptionId, active: false, createdAt: new Date() })
  serviceMocks.listOwnerPushSubscriptions.mockResolvedValue([{ id: subscriptionId, label: 'Apparaat ABC123', active: true, createdAt: new Date() }])
  serviceMocks.getOwnerPushStatus.mockResolvedValue({ subscribed: true, id: subscriptionId, label: 'Apparaat ABC123' })
}

describe('owner push Server Function boundary', () => {
  it('weigert klanten en gasten voor elke beheeractie', async () => {
    resetMocks()
    state.user = customer

    await expect(getOwnerPushConfigFn({ data: undefined })).rejects.toThrow()
    await expect(registerOwnerPushSubscriptionFn({ data: registerInput })).rejects.toThrow()
    await expect(unregisterOwnerPushSubscriptionFn({ data: { id: subscriptionId } })).rejects.toThrow()
    await expect(listOwnerPushSubscriptionsFn({ data: undefined })).rejects.toThrow()
    await expect(getOwnerPushStatusFn({ data: { endpoint: registerInput.endpoint } })).rejects.toThrow()

    expect(serviceMocks.registerOwnerPushSubscription).not.toHaveBeenCalled()
    expect(serviceMocks.unregisterOwnerPushSubscription).not.toHaveBeenCalled()
    expect(serviceMocks.listOwnerPushSubscriptions).not.toHaveBeenCalled()
    expect(serviceMocks.getOwnerPushStatus).not.toHaveBeenCalled()
  })

  it('beheert abonnementen alleen met de id van de ingelogde eigenaar', async () => {
    resetMocks()
    state.user = owner

    await expect(registerOwnerPushSubscriptionFn({ data: registerInput })).resolves.toMatchObject({ active: true })
    expect(serviceMocks.registerOwnerPushSubscription).toHaveBeenCalledWith(registerInput, owner.id)

    await expect(unregisterOwnerPushSubscriptionFn({ data: { id: subscriptionId } })).resolves.toMatchObject({ active: false })
    expect(serviceMocks.unregisterOwnerPushSubscription).toHaveBeenCalledWith(subscriptionId, owner.id)

    await expect(listOwnerPushSubscriptionsFn({ data: undefined })).resolves.toHaveLength(1)
    expect(serviceMocks.listOwnerPushSubscriptions).toHaveBeenCalledWith(owner.id)

    await expect(getOwnerPushStatusFn({ data: { endpoint: registerInput.endpoint } })).resolves.toMatchObject({ subscribed: true })
    expect(serviceMocks.getOwnerPushStatus).toHaveBeenCalledWith(registerInput.endpoint, owner.id)
  })

  it('weigert ongeldige invoer en geblokkeerde mutaties vóór de service', async () => {
    resetMocks()
    state.user = owner

    await expect(registerOwnerPushSubscriptionFn({ data: { ...registerInput, endpoint: 'geen-url' } })).rejects.toThrow()
    expect(serviceMocks.registerOwnerPushSubscription).not.toHaveBeenCalled()

    state.rateAllowed = false
    await expect(registerOwnerPushSubscriptionFn({ data: registerInput })).rejects.toMatchObject({ code: 'FAILED' })
    await expect(unregisterOwnerPushSubscriptionFn({ data: { id: subscriptionId } })).rejects.toMatchObject({ code: 'FAILED' })
    expect(serviceMocks.registerOwnerPushSubscription).not.toHaveBeenCalled()
    expect(serviceMocks.unregisterOwnerPushSubscription).not.toHaveBeenCalled()
  })
})
