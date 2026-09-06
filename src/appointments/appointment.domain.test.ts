import { describe, expect, it } from 'vitest'

import { assertAppointmentLifecycle, calculateOccupiedEnd, canTransitionAppointmentStatus } from './appointment.domain'

describe('appointment domain', () => {
  it('calculates occupied end from service duration plus buffer', () => {
    const start = new Date('2026-09-06T07:00:00.000Z')
    expect(calculateOccupiedEnd(start, 30, 10).toISOString()).toBe('2026-09-06T07:40:00.000Z')
    expect(calculateOccupiedEnd(start, 1, 0).toISOString()).toBe('2026-09-06T07:01:00.000Z')
  })

  it('uses elapsed time across Europe/Amsterdam DST transitions', () => {
    const start = new Date('2026-03-29T01:30:00+01:00')
    expect(calculateOccupiedEnd(start, 60, 0).toISOString()).toBe('2026-03-29T01:30:00.000Z')
  })

  it('accepts arbitrary dynamic start times and rejects invalid duration values', () => {
    expect(calculateOccupiedEnd(new Date('2026-09-06T07:37:00Z'), 23, 7).getUTCMinutes()).toBe(7)
    expect(() => calculateOccupiedEnd(new Date('2026-09-06T07:37:00Z'), 0, 7)).toThrow()
    expect(() => calculateOccupiedEnd(new Date('2026-09-06T07:37:00Z'), 23, -1)).toThrow()
  })

  it('enforces the appointment lifecycle transition matrix', () => {
    expect(canTransitionAppointmentStatus('new', 'confirmed')).toBe(true)
    expect(canTransitionAppointmentStatus('new', 'cancelled')).toBe(true)
    expect(canTransitionAppointmentStatus('new', 'no_show')).toBe(true)
    expect(canTransitionAppointmentStatus('confirmed', 'in_progress')).toBe(true)
    expect(canTransitionAppointmentStatus('in_progress', 'completed')).toBe(true)
    expect(canTransitionAppointmentStatus('new', 'completed')).toBe(false)
    expect(canTransitionAppointmentStatus('confirmed', 'completed')).toBe(false)
    expect(canTransitionAppointmentStatus('completed', 'confirmed')).toBe(false)
  })

  it('only permits release timestamps for no-show appointments', () => {
    expect(() => assertAppointmentLifecycle('no_show', null)).not.toThrow()
    expect(() => assertAppointmentLifecycle('no_show', new Date())).not.toThrow()
    expect(() => assertAppointmentLifecycle('confirmed', new Date())).toThrow()
  })
})
