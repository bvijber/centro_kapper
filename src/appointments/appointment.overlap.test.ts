import { describe, expect, it } from 'vitest'

import { blocksCapacity, getAppointmentLockKey, isOverlapping } from './appointment.overlap'

const range = (start: string, end: string) => ({ startsAt: new Date(`2026-09-06T${start}:00Z`), endsAt: new Date(`2026-09-06T${end}:00Z`) })

describe('appointment overlap', () => {
  it('uses half-open interval semantics at exact boundaries', () => {
    expect(isOverlapping(range('09:00', '09:30'), range('09:30', '10:00'))).toBe(false)
    expect(isOverlapping(range('09:00', '09:40'), range('09:30', '10:00'))).toBe(true)
    expect(isOverlapping(range('09:00', '11:00'), range('09:30', '10:00'))).toBe(true)
    expect(isOverlapping(range('09:30', '10:00'), range('09:00', '11:00'))).toBe(true)
  })

  it('applies lifecycle capacity rules', () => {
    expect(blocksCapacity({ status: 'new', slotReleasedAt: null })).toBe(true)
    expect(blocksCapacity({ status: 'confirmed', slotReleasedAt: null })).toBe(true)
    expect(blocksCapacity({ status: 'in_progress', slotReleasedAt: null })).toBe(true)
    expect(blocksCapacity({ status: 'cancelled', slotReleasedAt: null })).toBe(false)
    expect(blocksCapacity({ status: 'completed', slotReleasedAt: null })).toBe(false)
    expect(blocksCapacity({ status: 'no_show', slotReleasedAt: null })).toBe(true)
    expect(blocksCapacity({ status: 'no_show', slotReleasedAt: new Date() })).toBe(false)
  })

  it('centralizes the per-barber advisory lock key', () => {
    expect(getAppointmentLockKey('staff-1')).toBe('appointment:staff-1')
    expect(getAppointmentLockKey('staff-1')).toBe(getAppointmentLockKey('staff-1'))
    expect(getAppointmentLockKey('staff-1')).not.toBe(getAppointmentLockKey('staff-2'))
  })
})
