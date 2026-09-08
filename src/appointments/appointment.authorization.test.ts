import { describe, expect, it } from 'vitest'

import type { SafeUser } from '../auth/auth.schemas'
import { authorizeAppointmentCreate, authorizeAppointmentRead, requireAppointmentMutationAccess, requireStaffMutationActor, resolveMutationActor } from './appointment.authorization'

const customer: SafeUser = { id: '00000000-0000-0000-0000-000000000001', email: 'customer@example.com', role: 'customer', name: 'Customer', phone: '0612345678' }
const staff: SafeUser = { id: '00000000-0000-0000-0000-000000000002', email: 'staff@example.com', role: 'staff', name: 'Staff', phone: '0612345678' }
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
  it('allows authenticated customers, staff and guests to create', () => {
    expect(authorizeAppointmentCreate(input, customer)).toEqual({ kind: 'customer', userId: customer.id })
    expect(authorizeAppointmentCreate({ ...input, customerUserId: customer.id }, staff)).toEqual({ kind: 'staff', userId: staff.id })
    expect(authorizeAppointmentCreate({ ...input, guestName: 'Guest', guestPhone: '0612345678' }, null)).toEqual({ kind: 'guest' })
  })

  it('rejects unauthenticated non-guest creation and client-supplied customer identity', () => {
    expect(thrownCode(() => authorizeAppointmentCreate(input, null))).toBe('UNAUTHORIZED')
    expect(thrownCode(() => authorizeAppointmentCreate({ ...input, customerUserId: staff.id }, customer))).toBe('FORBIDDEN')
    expect(thrownCode(() => authorizeAppointmentCreate({ ...input, overrideBreak: true }, customer))).toBe('FORBIDDEN')
    expect(thrownCode(() => authorizeAppointmentCreate({ ...input, overrideBreak: true, guestName: 'Guest', guestPhone: '0612345678' }, null))).toBe('FORBIDDEN')
  })

  it('enforces customer ownership and permits staff reads', () => {
    expect(() => authorizeAppointmentRead(customer, customer.id)).not.toThrow()
    expect(thrownCode(() => authorizeAppointmentRead(customer, staff.id))).toBe('FORBIDDEN')
    expect(() => authorizeAppointmentRead(staff, customer.id)).not.toThrow()
  })

  it('resolves mutation actors from authenticated users', () => {
    expect(resolveMutationActor(customer)).toEqual({ kind: 'customer', userId: customer.id })
    expect(resolveMutationActor(staff)).toEqual({ kind: 'staff', userId: staff.id })
  })

  it('permits staff mutation access and customer access only on own appointments', () => {
    const staffActor = resolveMutationActor(staff)
    const customerActor = resolveMutationActor(customer)
    expect(() => requireAppointmentMutationAccess(staffActor, customer.id)).not.toThrow()
    expect(() => requireAppointmentMutationAccess(staffActor, null)).not.toThrow()
    expect(() => requireAppointmentMutationAccess(customerActor, customer.id)).not.toThrow()
    expect(thrownCode(() => requireAppointmentMutationAccess(customerActor, staff.id))).toBe('FORBIDDEN')
    expect(thrownCode(() => requireAppointmentMutationAccess(customerActor, null))).toBe('FORBIDDEN')
  })

  it('only permits staff to perform status mutations', () => {
    expect(() => requireStaffMutationActor(resolveMutationActor(staff))).not.toThrow()
    expect(thrownCode(() => requireStaffMutationActor(resolveMutationActor(customer)))).toBe('FORBIDDEN')
  })
})
