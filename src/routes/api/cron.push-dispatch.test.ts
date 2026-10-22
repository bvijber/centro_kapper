import { beforeEach, describe, expect, it, vi } from 'vitest'

const dispatchMocks = vi.hoisted(() => ({
  reconcileStaleSending: vi.fn(),
  dispatchPendingDeliveries: vi.fn(),
  cleanupPushData: vi.fn(),
}))

const ownerDispatchMocks = vi.hoisted(() => ({
  reconcileStaleOwnerPushDeliveries: vi.fn(),
  dispatchOwnerPushDeliveries: vi.fn(),
  cleanupOwnerPushData: vi.fn(),
}))

vi.mock('../../push/push.dispatch.server', () => ({ ...dispatchMocks }))
vi.mock('../../push/owner-push.dispatch.server', () => ({ ...ownerDispatchMocks }))

import { handlePushDispatchCron } from './cron.push-dispatch'

const SECRET = 'test-cron-secret-12345678'

function requestWithAuth(authHeader: string | null): Request {
  return new Request('https://voorbeeld.test/api/cron/push-dispatch', {
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('cron dispatch route boundary', () => {
  it('weigert onbevoegde requests met 401 (Test N)', async () => {
    const previous = process.env.CRON_SECRET
    process.env.CRON_SECRET = SECRET
    try {
      const missing = await handlePushDispatchCron(requestWithAuth(null))
      expect(missing.status).toBe(401)
      const wrong = await handlePushDispatchCron(requestWithAuth('Bearer verkeerd-geheim'))
      expect(wrong.status).toBe(401)
      expect(dispatchMocks.reconcileStaleSending).not.toHaveBeenCalled()
      expect(dispatchMocks.dispatchPendingDeliveries).not.toHaveBeenCalled()
      expect(dispatchMocks.cleanupPushData).not.toHaveBeenCalled()
      expect(ownerDispatchMocks.dispatchOwnerPushDeliveries).not.toHaveBeenCalled()
    } finally {
      if (previous === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = previous
    }
  })

  it('verwerkt een geautoriseerde run en rapporteert tellingen', async () => {
    const previous = process.env.CRON_SECRET
    process.env.CRON_SECRET = SECRET
    dispatchMocks.reconcileStaleSending.mockResolvedValue({ recovered: 1, closed: 0 })
    dispatchMocks.dispatchPendingDeliveries.mockResolvedValue({ claimed: 2, sent: 2, retried: 0, failed: 0, invalid: 0, expired: 0, skipped: null })
    dispatchMocks.cleanupPushData.mockResolvedValue({ deliveries: 3, notifications: 1, subscriptions: 0 })
    ownerDispatchMocks.reconcileStaleOwnerPushDeliveries.mockResolvedValue({ recovered: 0, closed: 0 })
    ownerDispatchMocks.dispatchOwnerPushDeliveries.mockResolvedValue({ created: 1, claimed: 1, sent: 1, retried: 0, failed: 0, invalid: 0, expired: 0, skipped: null })
    ownerDispatchMocks.cleanupOwnerPushData.mockResolvedValue({ deliveries: 0, subscriptions: 0 })
    try {
      const response = await handlePushDispatchCron(requestWithAuth(`Bearer ${SECRET}`))
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toMatchObject({ ok: true })
      // De klantensectie blijft ongewijzigd aanwezig.
      expect(body.stale).toEqual({ recovered: 1, closed: 0 })
      expect(body.dispatched).toMatchObject({ claimed: 2, sent: 2 })
      expect(body.cleaned).toEqual({ deliveries: 3, notifications: 1, subscriptions: 0 })
      // De eigenaarsectie draait volledig gescheiden.
      expect(body.owner.error).toBeNull()
      expect(body.owner.dispatched).toMatchObject({ sent: 1 })
    } finally {
      if (previous === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = previous
    }
  })

  it('laat de klantensectie intact als de eigenaarsectie faalt', async () => {
    const previous = process.env.CRON_SECRET
    process.env.CRON_SECRET = SECRET
    dispatchMocks.reconcileStaleSending.mockResolvedValue({ recovered: 0, closed: 0 })
    dispatchMocks.dispatchPendingDeliveries.mockResolvedValue({ claimed: 0, sent: 0, retried: 0, failed: 0, invalid: 0, expired: 0, skipped: null })
    dispatchMocks.cleanupPushData.mockResolvedValue({ deliveries: 0, notifications: 0, subscriptions: 0 })
    ownerDispatchMocks.reconcileStaleOwnerPushDeliveries.mockRejectedValue(new Error('tabellen ontbreken'))
    ownerDispatchMocks.dispatchOwnerPushDeliveries.mockRejectedValue(new Error('tabellen ontbreken'))
    ownerDispatchMocks.cleanupOwnerPushData.mockRejectedValue(new Error('tabellen ontbreken'))
    try {
      const response = await handlePushDispatchCron(requestWithAuth(`Bearer ${SECRET}`))
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.ok).toBe(true)
      expect(body.owner.error).toBe('owner-push-failed')
      expect(body.dispatched).toMatchObject({ claimed: 0 })
    } finally {
      if (previous === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = previous
    }
  })
})
