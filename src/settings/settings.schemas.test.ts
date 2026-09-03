import { describe, expect, it } from 'vitest'

import {
  breakPeriodCreateSchema,
  businessProfileUpdateSchema,
  openingHoursUpdateSchema,
  wholeDayBlockCreateSchema,
} from './settings.schemas'

const openMonday = { weekday: 0, isOpen: true, openingTime: '09:00', closingTime: '18:00' }

describe('settings schemas', () => {
  it('accepts and rejects business profile input at its boundaries', () => {
    expect(businessProfileUpdateSchema.safeParse({ name: 'Centro Kapper', address: 'Kerkstraat 1', phone: '+31 6 12345678' }).success).toBe(true)
    expect(businessProfileUpdateSchema.safeParse({ name: ' ', address: 'Kerkstraat 1', phone: '+31 6 12345678' }).success).toBe(false)
    expect(businessProfileUpdateSchema.safeParse({ name: 'Centro Kapper', address: 'Kerkstraat 1', phone: 'x'.repeat(33) }).success).toBe(false)
  })

  it('accepts open and closed days and requires all unique weekdays', () => {
    const days = [openMonday, ...Array.from({ length: 6 }, (_, index) => ({ weekday: index + 1, isOpen: false, openingTime: null, closingTime: null }))]
    expect(openingHoursUpdateSchema.safeParse({ openingHours: days }).success).toBe(true)
    expect(openingHoursUpdateSchema.safeParse({ openingHours: [{ ...openMonday, openingTime: null }, ...days.slice(1)] }).success).toBe(false)
    expect(openingHoursUpdateSchema.safeParse({ openingHours: [{ ...openMonday, closingTime: '08:59' }, ...days.slice(1)] }).success).toBe(false)
    expect(openingHoursUpdateSchema.safeParse({ openingHours: days.map((day) => ({ ...day, weekday: 1 })) }).success).toBe(false)
    expect(openingHoursUpdateSchema.safeParse({ openingHours: days.map((day) => ({ ...day, weekday: 7 })) }).success).toBe(false)
  })

  it('validates break period intervals and input', () => {
    expect(breakPeriodCreateSchema.safeParse({ startsAt: '2026-09-03T12:00:00+02:00', endsAt: '2026-09-03T13:00:00+02:00' }).success).toBe(true)
    expect(breakPeriodCreateSchema.safeParse({ startsAt: '2026-09-03T13:00:00+02:00', endsAt: '2026-09-03T12:00:00+02:00' }).success).toBe(false)
    expect(breakPeriodCreateSchema.safeParse({ startsAt: 'not-a-date', endsAt: '2026-09-03T13:00:00+02:00' }).success).toBe(false)
  })

  it('validates whole-day block dates and defaults active blocks', () => {
    expect(wholeDayBlockCreateSchema.parse({ blockDate: '2026-09-03' })).toMatchObject({ blockDate: '2026-09-03', active: true })
    expect(wholeDayBlockCreateSchema.safeParse({ blockDate: '2026-02-30' }).success).toBe(false)
    expect(wholeDayBlockCreateSchema.safeParse({ blockDate: 'tomorrow' }).success).toBe(false)
  })
})
