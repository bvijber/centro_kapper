import { describe, expect, it } from 'vitest'

import { calculateAvailableSlots, isSlotAvailable, type AvailabilityInput } from './availability.domain'
import { parseAmsterdamLocal } from '../timezone'

const base = (overrides: Partial<AvailabilityInput> = {}): AvailabilityInput => ({
  date: '2026-09-14',
  serviceDurationMinutes: 60,
  bufferMinutes: 15,
  openingHours: [{ weekday: 1, isOpen: true, openingTime: '09:00', closingTime: '18:00' }],
  breaks: [],
  wholeDayBlocked: false,
  appointments: [],
  ...overrides,
})

describe('availability domain', () => {
  it('requires full duration plus buffer to fit before closing', () => {
    const slots = calculateAvailableSlots(base())
    expect(slots.at(-1)?.time).toBe('16:45')
    expect(isSlotAvailable(base(), parseAmsterdamLocal('2026-09-14', '16:45') as Date)).toBe(true)
    expect(isSlotAvailable(base(), parseAmsterdamLocal('2026-09-14', '17:00') as Date)).toBe(false)
  })

  it('returns only 15-minute booking intervals', () => {
    const slots = calculateAvailableSlots(base({ serviceDurationMinutes: 30, bufferMinutes: 0 }))
    expect(slots.length).toBeGreaterThan(0)
    expect(slots.every((slot) => [0, 15, 30, 45].includes(Number(slot.time.slice(3))))).toBe(true)
  })

  it('returns no slots for closed days and whole-day blocks', () => {
    expect(calculateAvailableSlots(base({ openingHours: [{ weekday: 1, isOpen: false, openingTime: null, closingTime: null }] }))).toEqual([])
    expect(calculateAvailableSlots(base({ wholeDayBlocked: true }))).toEqual([])
    expect(calculateAvailableSlots(base({ wholeDayBlocked: true, overrides: { openingHours: false, break: false, wholeDayBlock: true } }))).not.toEqual([])
  })

  it('only overrides the availability boundary explicitly requested by the owner', () => {
    const input = base({ overrides: { openingHours: true, break: false, wholeDayBlock: false } })
    expect(isSlotAvailable(input, parseAmsterdamLocal('2026-09-14', '18:00') as Date)).toBe(true)
    const breakPeriod = [{ startsAt: parseAmsterdamLocal('2026-09-14', '18:00') as Date, endsAt: parseAmsterdamLocal('2026-09-14', '19:00') as Date }]
    expect(isSlotAvailable({ ...input, breaks: breakPeriod }, parseAmsterdamLocal('2026-09-14', '18:00') as Date)).toBe(false)
    expect(isSlotAvailable({ ...input, breaks: breakPeriod, overrides: { openingHours: true, break: true, wholeDayBlock: false } }, parseAmsterdamLocal('2026-09-14', '18:00') as Date)).toBe(true)
  })

  it('applies breaks and half-open boundaries', () => {
    const breaks = [{ startsAt: parseAmsterdamLocal('2026-09-14', '12:00') as Date, endsAt: parseAmsterdamLocal('2026-09-14', '13:00') as Date }]
    const input = base({ breaks })
    expect(isSlotAvailable(input, parseAmsterdamLocal('2026-09-14', '11:00') as Date)).toBe(false)
    expect(isSlotAvailable(input, parseAmsterdamLocal('2026-09-14', '13:00') as Date)).toBe(true)
    expect(isSlotAvailable({ ...input, overrides: { openingHours: false, break: true, wholeDayBlock: false } }, parseAmsterdamLocal('2026-09-14', '11:00') as Date)).toBe(true)
  })

  it('applies capacity status semantics and exact boundaries', () => {
    const startsAt = parseAmsterdamLocal('2026-09-14', '10:00') as Date
    const endsAt = parseAmsterdamLocal('2026-09-14', '11:15') as Date
    const blocking = { startsAt, endsAt, status: 'confirmed' as const, slotReleasedAt: null }
    expect(isSlotAvailable(base({ appointments: [blocking] }), parseAmsterdamLocal('2026-09-14', '10:00') as Date)).toBe(false)
    expect(isSlotAvailable(base({ appointments: [{ ...blocking, status: 'cancelled' as const }] }), parseAmsterdamLocal('2026-09-14', '11:15') as Date)).toBe(true)
    expect(isSlotAvailable(base({ appointments: [{ ...blocking, status: 'no_show' as const, slotReleasedAt: new Date() }] }), parseAmsterdamLocal('2026-09-14', '10:00') as Date)).toBe(true)
  })

  it('skips nonexistent spring-forward local starts and keeps absolute elapsed duration', () => {
    const input = base({ date: '2026-03-29', openingHours: [{ weekday: 0, isOpen: true, openingTime: '01:00', closingTime: '04:00' }], serviceDurationMinutes: 30, bufferMinutes: 0 })
    const slots = calculateAvailableSlots(input)
    expect(slots.some((slot) => slot.time === '02:30')).toBe(false)
    const three = slots.find((slot) => slot.time === '03:00')
    expect(three?.startsAt.toISOString()).toBe('2026-03-29T01:00:00.000Z')
  })

  it('uses the Amsterdam fall-back day boundary and does not duplicate a local minute', () => {
    const input = base({ date: '2026-10-25', openingHours: [{ weekday: 0, isOpen: true, openingTime: '01:00', closingTime: '04:00' }], serviceDurationMinutes: 30, bufferMinutes: 0 })
    const slots = calculateAvailableSlots(input)
    expect(slots.filter((slot) => slot.time === '02:30')).toHaveLength(1)
    expect(slots.at(-1)?.time).toBe('03:30')
  })
})
