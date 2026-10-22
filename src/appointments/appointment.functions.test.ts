import { randomUUID } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string; role: 'customer' | 'owner'; name: string | null; phone: string | null } | null,
}))

const serviceMocks = vi.hoisted(() => ({
  updateAppointmentStatus: vi.fn(),
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
vi.mock('../auth/auth.service.server', () => ({ getCurrentUser: vi.fn(async () => state.user) }))
vi.mock('../auth/rate-limit.server', () => ({ consumeRateLimit: vi.fn(async () => true) }))
vi.mock('../auth/request-context.server', () => ({ getClientIP: () => '192.0.2.10', getRequestAuditContext: () => ({}) }))
vi.mock('../auth/authorization', async () => {
  const { AuthError } = await vi.importActual<typeof import('../auth/auth.errors')>('../auth/auth.errors')
  return {
    requireAuthenticatedUser: vi.fn(async () => {
      if (!state.user) throw new AuthError('Je moet ingelogd zijn.', 'UNAUTHORIZED')
      return state.user
    }),
    requireCustomer: vi.fn(async () => {
      if (state.user?.role !== 'customer') throw new AuthError('Geen toegang.', 'FORBIDDEN')
      return state.user
    }),
    requireOwner: vi.fn(async () => {
      if (state.user?.role !== 'owner') throw new AuthError('Geen toegang.', 'FORBIDDEN')
      return state.user
    }),
    requireOwnership: vi.fn(async () => state.user),
  }
})
vi.mock('./appointment.service.server', async () => {
  const { AppointmentError } = await vi.importActual<typeof import('./appointment.service.server')>('./appointment.service.server')
  return { AppointmentError, ...serviceMocks }
})

import { updateAppointmentStatusFn } from './appointment.functions'

const customer = { id: randomUUID(), email: 'customer@example.test', role: 'customer' as const, name: 'Customer', phone: '0612345678' }
const owner = { id: randomUUID(), email: 'owner@example.test', role: 'owner' as const, name: 'Owner', phone: '0612345678' }
const appointmentId = randomUUID()

function resetMocks() {
  state.user = null
  Object.values(serviceMocks).forEach((mock) => mock.mockReset())
  serviceMocks.updateAppointmentStatus.mockResolvedValue({ id: appointmentId, status: 'no_show' })
}

describe('appointment status Server Function boundary', () => {
  it('rejects no-show transitions for customers and guests (Test F)', async () => {
    resetMocks()

    state.user = customer
    await expect(updateAppointmentStatusFn({ data: { id: appointmentId, status: 'no_show' } })).rejects.toMatchObject({ code: 'FORBIDDEN' })

    state.user = null
    await expect(updateAppointmentStatusFn({ data: { id: appointmentId, status: 'no_show' } })).rejects.toMatchObject({ code: 'FORBIDDEN' })

    expect(serviceMocks.updateAppointmentStatus).not.toHaveBeenCalled()
  })

  it('rejects invalid statuses before reaching the service', async () => {
    resetMocks()
    state.user = owner

    const invalidInput = { id: appointmentId, status: 'cancelled' }
    await expect(updateAppointmentStatusFn({ data: invalidInput as never })).rejects.toThrow()

    expect(serviceMocks.updateAppointmentStatus).not.toHaveBeenCalled()
  })

  it('forwards owner no-show transitions with the owner actor', async () => {
    resetMocks()
    state.user = owner

    await expect(updateAppointmentStatusFn({ data: { id: appointmentId, status: 'no_show' } })).resolves.toEqual({ id: appointmentId, status: 'no_show' })

    expect(serviceMocks.updateAppointmentStatus).toHaveBeenCalledWith(appointmentId, 'no_show', { kind: 'owner', userId: owner.id })
  })
})
