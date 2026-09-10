import { describe, expect, it } from 'vitest'

import { queueJoinSchema, queueStatusUpdateSchema } from './queue.schemas'

const serviceId = '11111111-1111-4111-8111-111111111111'
const customerId = '22222222-2222-4222-8222-222222222222'

describe('queue schemas', () => {
  it('accepts customer and guest identity shapes', () => {
    expect(queueJoinSchema.safeParse({ serviceId, customerUserId: customerId }).success).toBe(true)
    expect(queueJoinSchema.safeParse({ serviceId, guestName: 'Guest', guestPhone: '0612345678' }).success).toBe(true)
  })

  it('requires complete mutually exclusive party identity', () => {
    expect(queueJoinSchema.safeParse({ serviceId }).success).toBe(true)
    expect(queueJoinSchema.safeParse({ serviceId, guestName: 'Guest' }).success).toBe(false)
    expect(queueJoinSchema.safeParse({ serviceId, guestPhone: '0612345678' }).success).toBe(false)
    expect(queueJoinSchema.safeParse({ serviceId, customerUserId: customerId, guestName: 'Guest', guestPhone: '0612345678' }).success).toBe(false)
    expect(queueJoinSchema.safeParse({ serviceId: 'not-a-uuid' }).success).toBe(false)
  })

  it('accepts only lifecycle target statuses', () => {
    expect(queueStatusUpdateSchema.safeParse({ id: customerId, status: 'called' }).success).toBe(true)
    expect(queueStatusUpdateSchema.safeParse({ id: customerId, status: 'in_service', appointmentId: serviceId }).success).toBe(true)
    expect(queueStatusUpdateSchema.safeParse({ id: customerId, status: 'waiting' }).success).toBe(false)
    expect(queueStatusUpdateSchema.safeParse({ id: customerId, status: 'accepted' }).success).toBe(false)
  })
})
