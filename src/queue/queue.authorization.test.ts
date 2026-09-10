import { describe, expect, it } from 'vitest'

import { AuthError } from '../auth/auth.errors'
import { authorizeQueueJoin, requireQueueEntryAccess } from './queue.authorization'

const customer = { id: '22222222-2222-4222-8222-222222222222', email: 'customer@example.com', role: 'customer' as const, name: 'Customer', phone: '0612345678' }
const staff = { id: '33333333-3333-4333-8333-333333333333', email: 'staff@example.com', role: 'staff' as const, name: 'Staff', phone: '0612345678' }
const serviceId = '11111111-1111-4111-8111-111111111111'

describe('queue authorization', () => {
  it('resolves customer identity from the authenticated actor', () => {
    expect(authorizeQueueJoin({ serviceId }, customer)).toEqual({ kind: 'customer', userId: customer.id })
    expect(() => authorizeQueueJoin({ serviceId, customerUserId: '44444444-4444-4444-8444-444444444444' }, customer)).toThrow(AuthError)
  })

  it('allows guest join and staff-created entries', () => {
    expect(authorizeQueueJoin({ serviceId, guestName: 'Guest', guestPhone: '0612345678' }, null)).toEqual({ kind: 'guest' })
    expect(authorizeQueueJoin({ serviceId, customerUserId: customer.id }, staff)).toEqual({ kind: 'staff', userId: staff.id })
  })

  it('keeps guest UUID capability separate from customer ownership', () => {
    expect(() => requireQueueEntryAccess(null, { customerUserId: customer.id })).toThrow(AuthError)
    expect(() => requireQueueEntryAccess({ kind: 'customer', userId: customer.id }, { customerUserId: '44444444-4444-4444-8444-444444444444' })).toThrow(AuthError)
    expect(() => requireQueueEntryAccess(null, { customerUserId: null })).not.toThrow()
  })
})
