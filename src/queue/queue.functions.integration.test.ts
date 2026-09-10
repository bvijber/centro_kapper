import { randomUUID } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string; role: 'customer' | 'staff'; name: string | null; phone: string | null } | null,
  rateAllowed: true,
}))

const serviceMocks = vi.hoisted(() => ({
  joinQueue: vi.fn(),
  getQueueEntry: vi.fn(),
  getQueueEntryMetadata: vi.fn(),
  listStaffQueue: vi.fn(),
  listCustomerQueue: vi.fn(),
  leaveQueue: vi.fn(),
  callQueueEntry: vi.fn(),
  startQueueService: vi.fn(),
  completeQueueEntry: vi.fn(),
  cancelQueueEntry: vi.fn(),
  skipQueueEntry: vi.fn(),
  rejoinQueueEntry: vi.fn(),
}))

vi.mock('@tanstack/react-start/server', () => ({ getRequestIP: () => '192.0.2.10' }))
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
vi.mock('../auth/auth.service.server', () => ({ getCurrentUser: vi.fn(async () => state.user) }))
vi.mock('../auth/rate-limit.server', () => ({ consumeRateLimit: vi.fn(async () => state.rateAllowed) }))
vi.mock('../auth/authorization', async () => {
  const { AuthError } = await vi.importActual<typeof import('../auth/auth.errors')>('../auth/auth.errors')
  return {
    requireCustomer: vi.fn(async () => {
      if (state.user?.role !== 'customer') throw new AuthError('Geen toegang.', 'FORBIDDEN')
      return state.user
    }),
    requireStaff: vi.fn(async () => {
      if (state.user?.role !== 'staff') throw new AuthError('Geen toegang.', 'FORBIDDEN')
      return state.user
    }),
  }
})
vi.mock('./queue.service.server', async () => {
  const { QueueError } = await vi.importActual<typeof import('./queue.service.server')>('./queue.service.server')
  return { QueueError, ...serviceMocks }
})

import {
  callQueueEntryFn,
  cancelQueueEntryFn,
  completeQueueEntryFn,
  getQueueEntryFn,
  getQueueEntryPositionFn,
  joinQueueFn,
  leaveQueueFn,
  listCustomerQueueFn,
  listStaffQueueFn,
  rejoinQueueEntryFn,
  skipQueueEntryFn,
  startQueueServiceFn,
} from './queue.functions'

const customer = { id: randomUUID(), email: 'customer@example.test', role: 'customer' as const, name: 'Customer', phone: '0612345678' }
const staff = { id: randomUUID(), email: 'staff@example.test', role: 'staff' as const, name: 'Staff', phone: '0612345678' }
const serviceId = randomUUID()
const entryId = randomUUID()
const entry = { id: entryId, customerUserId: customer.id, status: 'waiting' }

function resetMocks() {
  state.user = null
  state.rateAllowed = true
  Object.values(serviceMocks).forEach((mock) => mock.mockReset())
  serviceMocks.joinQueue.mockResolvedValue(entry)
  serviceMocks.getQueueEntry.mockResolvedValue(entry)
  serviceMocks.getQueueEntryMetadata.mockResolvedValue({ position: 2, count: 1, estimatedWaitMinutes: 35 })
  serviceMocks.listStaffQueue.mockResolvedValue([entry])
  serviceMocks.listCustomerQueue.mockResolvedValue([entry])
  serviceMocks.leaveQueue.mockResolvedValue({ ...entry, status: 'cancelled' })
  serviceMocks.callQueueEntry.mockResolvedValue({ ...entry, status: 'called' })
  serviceMocks.startQueueService.mockResolvedValue({ ...entry, status: 'in_service' })
  serviceMocks.completeQueueEntry.mockResolvedValue({ ...entry, status: 'completed' })
  serviceMocks.cancelQueueEntry.mockResolvedValue({ ...entry, status: 'cancelled' })
  serviceMocks.skipQueueEntry.mockResolvedValue({ ...entry, status: 'skipped' })
  serviceMocks.rejoinQueueEntry.mockResolvedValue({ ...entry, status: 'waiting' })
}

function invoke<T>(fn: (options: { data: T }) => Promise<unknown>, data: T): Promise<unknown> {
  return fn({ data })
}

describe('queue Server Function boundary', () => {
  it('supports guest join, read and leave through the UUID capability', async () => {
    resetMocks()
    const input = { serviceId, guestName: 'Guest', guestPhone: '0612345678' }

    await expect(invoke(joinQueueFn, input)).resolves.toEqual(entry)
    await expect(invoke(getQueueEntryFn, { id: entryId })).resolves.toEqual(entry)
    await expect(invoke(leaveQueueFn, { id: entryId })).resolves.toEqual({ ...entry, status: 'cancelled' })

    expect(serviceMocks.joinQueue).toHaveBeenCalledWith(input, { kind: 'guest' })
    expect(serviceMocks.getQueueEntry).toHaveBeenCalledWith(entryId, { kind: 'guest' })
    expect(serviceMocks.leaveQueue).toHaveBeenCalledWith(entryId, { kind: 'guest' })
  })

  it('rejects invalid input at the Server Function boundary', async () => {
    resetMocks()
    await expect(invoke(joinQueueFn, { serviceId: 'not-a-uuid' })).rejects.toThrow()
    await expect(invoke(getQueueEntryFn, { id: 'not-a-uuid' })).rejects.toThrow()
    expect(serviceMocks.joinQueue).not.toHaveBeenCalled()
  })

  it('rejects guest lifecycle mutations and customer entry access is session-owned', async () => {
    resetMocks()
    await expect(invoke(callQueueEntryFn, { id: entryId })).rejects.toMatchObject({ code: 'FORBIDDEN' })

    state.user = customer
    await expect(invoke(getQueueEntryFn, { id: entryId })).resolves.toEqual(entry)
    expect(serviceMocks.getQueueEntry).toHaveBeenCalledWith(entryId, { kind: 'customer', userId: customer.id })
  })

  it('uses the authenticated customer identity for joins and customer lists', async () => {
    resetMocks()
    state.user = customer

    await expect(invoke(joinQueueFn, { serviceId })).resolves.toEqual(entry)
    await expect(invoke(listCustomerQueueFn, { queueDate: '2026-09-10' })).resolves.toEqual([entry])

    expect(serviceMocks.joinQueue).toHaveBeenCalledWith({ serviceId }, { kind: 'customer', userId: customer.id })
    expect(serviceMocks.listCustomerQueue).toHaveBeenCalledWith(customer.id, '2026-09-10', { kind: 'customer', userId: customer.id })
  })

  it('supports staff walk-ins, staff reads and all staff lifecycle boundaries', async () => {
    resetMocks()
    state.user = staff
    const walkIn = { serviceId, customerUserId: customer.id }

    await expect(invoke(joinQueueFn, walkIn)).resolves.toEqual(entry)
    await expect(invoke(listStaffQueueFn, { queueDate: '2026-09-10' })).resolves.toEqual([entry])
    await expect(invoke(getQueueEntryFn, { id: entryId })).resolves.toEqual(entry)
    await expect(invoke(callQueueEntryFn, { id: entryId })).resolves.toMatchObject({ status: 'called' })
    await expect(invoke(startQueueServiceFn, { id: entryId, status: 'in_service', appointmentId: randomUUID() })).resolves.toMatchObject({ status: 'in_service' })
    await expect(invoke(completeQueueEntryFn, { id: entryId })).resolves.toMatchObject({ status: 'completed' })
    await expect(invoke(cancelQueueEntryFn, { id: entryId })).resolves.toMatchObject({ status: 'cancelled' })
    await expect(invoke(skipQueueEntryFn, { id: entryId })).resolves.toMatchObject({ status: 'skipped' })
    await expect(invoke(rejoinQueueEntryFn, { id: entryId })).resolves.toMatchObject({ status: 'waiting' })

    expect(serviceMocks.joinQueue).toHaveBeenCalledWith(walkIn, { kind: 'staff', userId: staff.id })
    expect(serviceMocks.listStaffQueue).toHaveBeenCalledWith('2026-09-10', { kind: 'staff', userId: staff.id })
    expect(serviceMocks.startQueueService).toHaveBeenCalledWith(entryId, { kind: 'staff', userId: staff.id }, expect.any(String))
  })

  it('returns position, count and estimated wait metadata for the specific entry', async () => {
    resetMocks()
    state.user = customer

    await expect(invoke(getQueueEntryPositionFn, { id: entryId })).resolves.toEqual({ position: 2, count: 1, estimatedWaitMinutes: 35 })
    expect(serviceMocks.getQueueEntryMetadata).toHaveBeenCalledWith(entryId, { kind: 'customer', userId: customer.id })
  })

  it('enforces the existing rate limiter on mutations', async () => {
    resetMocks()
    state.rateAllowed = false

    await expect(invoke(joinQueueFn, { serviceId, guestName: 'Guest', guestPhone: '0612345678' })).rejects.toMatchObject({ code: 'FAILED' })
    expect(serviceMocks.joinQueue).not.toHaveBeenCalled()
  })
})
