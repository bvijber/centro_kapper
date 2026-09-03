import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SafeUser } from '../../src/auth/auth.schemas'

const { getCurrentUser } = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<SafeUser | null>>(),
}))
vi.mock('../../src/auth/auth.service.server', () => ({ getCurrentUser }))

import { requireAuthenticatedUser, requireCustomer, requireOwnership, requireStaff } from '../../src/auth/authorization'

const customer: SafeUser = { id: 'customer-1', email: 'customer@example.com', role: 'customer', name: 'Customer', phone: '0612345678' }
const staff: SafeUser = { id: 'staff-1', email: 'staff@example.com', role: 'staff', name: 'Staff', phone: '0612345678' }

describe('authorization helpers', () => {
  beforeEach(() => getCurrentUser.mockReset())

  it('rejects unauthenticated access', async () => {
    getCurrentUser.mockResolvedValue(null)
    await expect(requireAuthenticatedUser()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('allows the matching customer and staff roles', async () => {
    getCurrentUser.mockResolvedValue(customer)
    await expect(requireCustomer()).resolves.toBe(customer)
    getCurrentUser.mockResolvedValue(staff)
    await expect(requireStaff()).resolves.toBe(staff)
  })

  it('rejects the wrong role', async () => {
    getCurrentUser.mockResolvedValue(customer)
    await expect(requireStaff()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    getCurrentUser.mockResolvedValue(staff)
    await expect(requireCustomer()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('allows ownership only for the authenticated user', async () => {
    getCurrentUser.mockResolvedValue(customer)
    await expect(requireOwnership('customer-1')).resolves.toBe(customer)
    await expect(requireOwnership('other-user')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
