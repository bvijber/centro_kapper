import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SafeUser } from '../auth/auth.schemas'

const { getCurrentUser } = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<SafeUser | null>>(),
}))
vi.mock('../auth/auth.service.server', () => ({ getCurrentUser }))

import { requireOwner } from '../auth/authorization'

const customer: SafeUser = { id: 'customer-1', email: 'customer@example.com', role: 'customer', name: 'Customer', phone: '0612345678' }
const owner: SafeUser = { id: 'owner-1', email: 'owner@example.com', role: 'owner', name: 'Owner', phone: '0612345678' }

describe('settings authorization boundary', () => {
  beforeEach(() => getCurrentUser.mockReset())

  it('rejects unauthenticated and customer access to settings mutations', async () => {
    getCurrentUser.mockResolvedValue(null)
    await expect(requireOwner()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    getCurrentUser.mockResolvedValue(customer)
    await expect(requireOwner()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('allows owner access to settings mutations', async () => {
    getCurrentUser.mockResolvedValue(owner)
    await expect(requireOwner()).resolves.toBe(owner)
  })
})
