import { describe, expect, it } from 'vitest'

import { appointmentCreateSchema, appointmentListSchema, appointmentSnapshotSchema } from './appointment.schemas'

const serviceId = '11111111-1111-4111-8111-111111111111'
const customerId = '22222222-2222-4222-8222-222222222222'

describe('appointment schemas', () => {
  it('accepts customer and guest appointment shapes', () => {
    expect(appointmentCreateSchema.safeParse({ serviceId, startsAt: '2026-09-06T09:37:00+02:00' }).success).toBe(true)
    expect(appointmentCreateSchema.safeParse({ serviceId, customerUserId: customerId, startsAt: '2026-09-06T09:43:00+02:00' }).success).toBe(true)
    expect(appointmentCreateSchema.safeParse({ serviceId, guestName: 'Guest', guestPhone: '0612345678', startsAt: '2026-09-06T10:11:00+02:00' }).success).toBe(true)
    expect(appointmentCreateSchema.safeParse({ serviceId, guestName: 'Guest', guestPhone: '0612345678', guestEmail: 'guest@example.com', startsAt: '2026-09-06T10:11:00+02:00' }).success).toBe(true)
    expect(appointmentCreateSchema.safeParse({ serviceId, startsAt: '2026-09-06T09:37:00+02:00', overrideBreak: true }).success).toBe(true)
  })

  it('rejects incomplete identities, invalid duration inputs and conflicting identities', () => {
    expect(appointmentCreateSchema.safeParse({ serviceId, guestName: 'Guest', startsAt: '2026-09-06T09:37:00+02:00' }).success).toBe(false)
    expect(appointmentCreateSchema.safeParse({ serviceId, guestPhone: '0612345678', startsAt: '2026-09-06T09:37:00+02:00' }).success).toBe(false)
    expect(appointmentCreateSchema.safeParse({ serviceId, guestEmail: 'guest@example.com', startsAt: '2026-09-06T09:37:00+02:00' }).success).toBe(false)
    expect(appointmentCreateSchema.safeParse({ serviceId, customerUserId: customerId, guestName: 'Guest', guestPhone: '0612345678', startsAt: '2026-09-06T09:37:00+02:00' }).success).toBe(false)
    expect(appointmentCreateSchema.safeParse({ serviceId, startsAt: 'not-a-timestamp' }).success).toBe(false)
    expect(appointmentCreateSchema.safeParse({ serviceId: 'not-a-uuid', startsAt: '2026-09-06T09:37:00+02:00' }).success).toBe(false)
    expect(appointmentSnapshotSchema.safeParse({ serviceNameAtBooking: 'Cut', servicePriceCentsAtBooking: -1, serviceDurationMinutesAtBooking: 30, bufferMinutesAtBooking: 10 }).success).toBe(false)
    expect(appointmentSnapshotSchema.safeParse({ serviceNameAtBooking: 'Cut', servicePriceCentsAtBooking: 1000, serviceDurationMinutesAtBooking: 0, bufferMinutesAtBooking: 10 }).success).toBe(false)
    expect(appointmentSnapshotSchema.safeParse({ serviceNameAtBooking: 'Cut', servicePriceCentsAtBooking: 1000, serviceDurationMinutesAtBooking: 30, bufferMinutesAtBooking: -1 }).success).toBe(false)
  })

  it('validates dynamic list ranges without imposing slot increments', () => {
    expect(appointmentListSchema.safeParse({ from: '2026-09-06T09:37:00+02:00', to: '2026-09-06T10:11:00+02:00' }).success).toBe(true)
    expect(appointmentListSchema.safeParse({ from: '2026-09-06T10:11:00+02:00', to: '2026-09-06T09:37:00+02:00' }).success).toBe(false)
  })
})
