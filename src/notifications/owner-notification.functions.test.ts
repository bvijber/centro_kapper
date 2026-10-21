import { randomUUID } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string; role: 'customer' | 'owner'; name: string; phone: string } | null,
}))

const serviceMocks = vi.hoisted(() => ({
  listOwnerNotifications: vi.fn(),
  getOwnerUnreadCount: vi.fn(),
  markOwnerNotificationRead: vi.fn(),
  markAllOwnerNotificationsRead: vi.fn(),
  cleanupExpiredOwnerNotifications: vi.fn(),
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
        return async (options?: { data?: unknown }) => {
          const data = options?.data
          return handler({ data: validator ? validator.parse(data) : data })
        }
      },
    }
    return builder
  },
}))
vi.mock('../auth/authorization', async () => {
  const { AuthError } = await vi.importActual<typeof import('../auth/auth.errors')>('../auth/auth.errors')
  return {
    requireOwner: vi.fn(async () => {
      if (state.user?.role !== 'owner') throw new AuthError('Geen toegang.', 'FORBIDDEN')
      return state.user
    }),
  }
})
vi.mock('./owner-notification.service.server', () => serviceMocks)

import {
  getOwnerNotificationsFn,
  markAllOwnerNotificationsReadFn,
  markOwnerNotificationReadFn,
} from './owner-notification.functions'

const owner = { id: randomUUID(), email: 'owner@example.test', role: 'owner' as const, name: 'Owner', phone: '0612345678' }
const customer = { id: randomUUID(), email: 'customer@example.test', role: 'customer' as const, name: 'Customer', phone: '0612345678' }
const notificationId = randomUUID()

function resetMocks() {
  state.user = null
  Object.values(serviceMocks).forEach((mock) => mock.mockReset())
  serviceMocks.listOwnerNotifications.mockResolvedValue([])
  serviceMocks.getOwnerUnreadCount.mockResolvedValue(0)
  serviceMocks.markOwnerNotificationRead.mockResolvedValue(true)
  serviceMocks.markAllOwnerNotificationsRead.mockResolvedValue(0)
  serviceMocks.cleanupExpiredOwnerNotifications.mockResolvedValue(0)
}

describe('owner notification Server Function boundary', () => {
  it('rejects customers and anonymous visitors', async () => {
    resetMocks()

    state.user = customer
    await expect(getOwnerNotificationsFn()).rejects.toMatchObject({ code: 'FORBIDDEN' })

    state.user = null
    await expect(getOwnerNotificationsFn()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(markOwnerNotificationReadFn({ data: { id: notificationId } })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(markAllOwnerNotificationsReadFn()).rejects.toMatchObject({ code: 'FORBIDDEN' })

    expect(serviceMocks.listOwnerNotifications).not.toHaveBeenCalled()
    expect(serviceMocks.markOwnerNotificationRead).not.toHaveBeenCalled()
    expect(serviceMocks.markAllOwnerNotificationsRead).not.toHaveBeenCalled()
  })

  it('returns the notifications and unread count of the authenticated owner', async () => {
    resetMocks()
    state.user = owner
    serviceMocks.getOwnerUnreadCount.mockResolvedValue(3)

    await expect(getOwnerNotificationsFn()).resolves.toEqual({ items: [], unread: 3 })
    expect(serviceMocks.listOwnerNotifications).toHaveBeenCalledWith(owner.id)
    expect(serviceMocks.getOwnerUnreadCount).toHaveBeenCalledWith(owner.id)
  })

  it('marks a single notification as read for the owner only', async () => {
    resetMocks()
    state.user = owner
    serviceMocks.getOwnerUnreadCount.mockResolvedValue(0)

    await expect(markOwnerNotificationReadFn({ data: { id: notificationId } })).resolves.toEqual({
      updated: true,
      unread: 0,
    })
    expect(serviceMocks.markOwnerNotificationRead).toHaveBeenCalledWith(owner.id, notificationId)
  })

  it('marks all notifications as read for the owner only', async () => {
    resetMocks()
    state.user = owner
    serviceMocks.markAllOwnerNotificationsRead.mockResolvedValue(4)

    await expect(markAllOwnerNotificationsReadFn()).resolves.toEqual({ updated: 4, unread: 0 })
    expect(serviceMocks.markAllOwnerNotificationsRead).toHaveBeenCalledWith(owner.id)
  })

  it('rejects an invalid notification id before reaching the service', async () => {
    resetMocks()
    state.user = owner

    await expect(markOwnerNotificationReadFn({ data: { id: 'geen-uuid' } })).rejects.toThrow()
    expect(serviceMocks.markOwnerNotificationRead).not.toHaveBeenCalled()
  })
})
