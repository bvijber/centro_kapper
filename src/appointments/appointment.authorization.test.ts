import { describe, expect, it } from 'vitest'

import type { SafeUser } from '../auth/auth.schemas'
import { authorizeAppointmentCreate, authorizeAppointmentRead, requireAppointmentMutationAccess, requireOwnerMutationActor, resolveMutationActor } from './appointment.authorization'

const customer: SafeUser = { id: '00000000-0000-0000-0000-000000000001', email: 'customer@example.com', role: 'customer', name: 'Customer', phone: '0612345678' }
const owner: SafeUser = { id: '00000000-0000-0000-0000-000000000002', email: 'owner@example.com', role: 'owner', name: 'Owner', phone: '0612345678' }
const input = { serviceId: '00000000-0000-0000-0000-000000000003', startsAt: new Date('2026-09-06T09:37:00+02:00'), overrideOpeningHours: false, overrideBreak: false, overrideWholeDayBlock: false }

function thrownCode(callback: () => unknown): string | undefined {
  try {
    callback()
  } catch (error) {
    if (error instanceof Error && 'code' in error) return (error as Error & { code?: string }).code
  }
  return undefined
}

describe('appointment authorization', () => {
  it('allows authenticated customers, owner and guests to create', () => {
    expect(authorizeAppointmentCreate(input, customer)).toEqual({ kind: 'customer', userId: customer.id })
    expect(authorizeAppointmentCreate({ ...input, customerUserId: customer.id }, owner)).toEqual({ kind: 'owner', userId: owner.id })
    expect(authorizeAppointmentCreate({ ...input, guestName: 'Guest', guestPhone: '0612345678' }, null)).toEqual({ kind: 'guest' })
  })

  it('rejects unauthenticated non-guest creation and client-supplied customer identity', () => {
    expect(thrownCode(() => authorizeAppointmentCreate(input, null))).toBe('UNAUTHORIZED')
    expect(thrownCode(() => authorizeAppointmentCreate({ ...input, customerUserId: owner.id }, customer))).toBe('FORBIDDEN')
    expect(thrownCode(() => authorizeAppointmentCreate({ ...input, overrideBreak: true }, customer))).toBe('FORBIDDEN')
    expect(thrownCode(() => authorizeAppointmentCreate({ ...input, overrideBreak: true, guestName: 'Guest', guestPhone: '0612345678' }, null))).toBe('FORBIDDEN')
  })

  it('enforces customer ownership and permits owner reads', () => {
    expect(() => authorizeAppointmentRead(customer, customer.id)).not.toThrow()
    expect(thrownCode(() => authorizeAppointmentRead(customer, owner.id))).toBe('FORBIDDEN')
    expect(() => authorizeAppointmentRead(owner, customer.id)).not.toThrow()
  })

  it('resolves mutation actors from authenticated users', () => {
    expect(resolveMutationActor(customer)).toEqual({ kind: 'customer', userId: customer.id })
    expect(resolveMutationActor(owner)).toEqual({ kind: 'owner', userId: owner.id })
  })

  it('permits owner mutation access and customer access only on own appointments', () => {
    const ownerActor = resolveMutationActor(owner)
    const customerActor = resolveMutationActor(customer)
    expect(() => requireAppointmentMutationAccess(ownerActor, customer.id)).not.toThrow()
    expect(() => requireAppointmentMutationAccess(ownerActor, null)).not.toThrow()
    expect(() => requireAppointmentMutationAccess(customerActor, customer.id)).not.toThrow()
    expect(thrownCode(() => requireAppointmentMutationAccess(customerActor, owner.id))).toBe('FORBIDDEN')
    expect(thrownCode(() => requireAppointmentMutationAccess(customerActor, null))).toBe('FORBIDDEN')
  })

  it('only permits owner to perform status mutations', () => {
    expect(() => requireOwnerMutationActor(resolveMutationActor(owner))).not.toThrow()
    expect(thrownCode(() => requireOwnerMutationActor(resolveMutationActor(customer)))).toBe('FORBIDDEN')
  })
})
