import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SafeUser } from '../auth/auth.schemas'

const { getCurrentUser } = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<SafeUser | null>>(),
}))
vi.mock('../auth/auth.service.server', () => ({ getCurrentUser }))

import { requireStaff } from '../auth/authorization'

const customer: SafeUser = { id: 'customer-1', email: 'customer@example.com', role: 'customer', name: 'Customer', phone: '0612345678' }
const staff: SafeUser = { id: 'staff-1', email: 'staff@example.com', role: 'staff', name: 'Staff', phone: '0612345678' }

describe('settings authorization boundary', () => {
  beforeEach(() => getCurrentUser.mockReset())

  it('rejects unauthenticated and customer access to settings mutations', async () => {
    getCurrentUser.mockResolvedValue(null)
    await expect(requireStaff()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    getCurrentUser.mockResolvedValue(customer)
    await expect(requireStaff()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('allows staff access to settings mutations', async () => {
    getCurrentUser.mockResolvedValue(staff)
    await expect(requireStaff()).resolves.toBe(staff)
  })
})
