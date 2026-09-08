import { describe, expect, it } from 'vitest'

import { addCalendarDays, formatAmsterdamDateKey, getAmsterdamDayBounds, getAmsterdamDateTimeParts, parseAmsterdamLocal } from './timezone'

describe('Europe/Amsterdam timezone utilities', () => {
  it('formats absolute instants using the Amsterdam calendar date', () => {
    expect(formatAmsterdamDateKey(new Date('2026-10-13T22:30:00.000Z'))).toBe('2026-10-14')
    expect(formatAmsterdamDateKey(new Date('2026-10-14T21:59:59.000Z'))).toBe('2026-10-14')
  })

  it('uses half-open Amsterdam day bounds across DST', () => {
    const spring = getAmsterdamDayBounds('2026-03-29')
    const fall = getAmsterdamDayBounds('2026-10-25')
    expect(spring?.start.toISOString()).toBe('2026-03-28T23:00:00.000Z')
    expect(spring?.end.toISOString()).toBe('2026-03-29T22:00:00.000Z')
    expect(fall?.start.toISOString()).toBe('2026-10-24T22:00:00.000Z')
    expect(fall?.end.toISOString()).toBe('2026-10-25T23:00:00.000Z')
  })

  it('rejects nonexistent spring-forward local times and resolves fall-back ambiguity', () => {
    expect(parseAmsterdamLocal('2026-03-29', '02:30')).toBeNull()
    const fallBack = parseAmsterdamLocal('2026-10-25', '02:30')
    expect(fallBack?.toISOString()).toBe('2026-10-25T00:30:00.000Z')
    expect(getAmsterdamDateTimeParts(fallBack as Date)).toMatchObject({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 })
  })

  it('adds calendar days without using server or browser timezone', () => {
    expect(addCalendarDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(addCalendarDays('2026-10-25', -1)).toBe('2026-10-24')
  })
})
