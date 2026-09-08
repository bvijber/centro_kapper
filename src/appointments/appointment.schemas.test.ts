import { describe, expect, it } from 'vitest'

import { appointmentCreateSchema, appointmentListSchema, appointmentModifySchema, appointmentSnapshotSchema, appointmentStatusUpdateSchema, cancellationRequestCreateSchema, cancellationRequestIdSchema } from './appointment.schemas'

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

  it('validates appointment status updates to allowed targets only', () => {
    expect(appointmentStatusUpdateSchema.safeParse({ id: serviceId, status: 'confirmed' }).success).toBe(true)
    expect(appointmentStatusUpdateSchema.safeParse({ id: serviceId, status: 'no_show' }).success).toBe(true)
    expect(appointmentStatusUpdateSchema.safeParse({ id: serviceId, status: 'new' }).success).toBe(false)
    expect(appointmentStatusUpdateSchema.safeParse({ id: serviceId, status: 'cancelled' }).success).toBe(false)
    expect(appointmentStatusUpdateSchema.safeParse({ id: 'not-a-uuid', status: 'confirmed' }).success).toBe(false)
  })

  it('requires a real change and paired local date/time in appointment modification', () => {
    expect(appointmentModifySchema.safeParse({ id: serviceId, serviceId }).success).toBe(true)
    expect(appointmentModifySchema.safeParse({ id: serviceId, localDate: '2026-09-07', localTime: '10:00' }).success).toBe(true)
    expect(appointmentModifySchema.safeParse({ id: serviceId }).success).toBe(false)
    expect(appointmentModifySchema.safeParse({ id: serviceId, localDate: '2026-09-07' }).success).toBe(false)
    expect(appointmentModifySchema.safeParse({ id: serviceId, localDate: '2026-09-07', localTime: '25:00' }).success).toBe(false)
    expect(appointmentModifySchema.safeParse({ id: serviceId, serviceId, confirmOverlap: true }).success).toBe(true)
  })

  it('validates cancellation request creation and ids', () => {
    expect(cancellationRequestCreateSchema.safeParse({ appointmentId: serviceId, reason: 'Verhinderd' }).success).toBe(true)
    expect(cancellationRequestCreateSchema.safeParse({ appointmentId: serviceId, reason: '   ' }).success).toBe(false)
    expect(cancellationRequestCreateSchema.safeParse({ appointmentId: 'nope', reason: 'Verhinderd' }).success).toBe(false)
    expect(cancellationRequestIdSchema.safeParse({ id: serviceId }).success).toBe(true)
    expect(cancellationRequestIdSchema.safeParse({ id: 'nope' }).success).toBe(false)
  })
})
