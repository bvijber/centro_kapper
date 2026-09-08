import { describe, expect, it } from 'vitest'

import { computeOpenStatus, summarizeOpeningHours, type HomeOpeningHour } from './home.domain'

function hours(entries: Array<Partial<HomeOpeningHour> & { weekday: number; isOpen?: boolean; openingTime?: string | null; closingTime?: string | null }>): HomeOpeningHour[] {
  return entries.map((entry) => ({ weekday: entry.weekday, isOpen: entry.isOpen ?? false, openingTime: entry.openingTime ?? null, closingTime: entry.closingTime ?? null }))
}

describe('summarizeOpeningHours', () => {
  it('returns Gesloten when no days are open', () => {
    const allClosed = Array.from({ length: 7 }, (_, weekday) => ({ weekday, isOpen: false, openingTime: null, closingTime: null }))
    expect(summarizeOpeningHours(allClosed)).toBe('Gesloten')
  })

  it('summarizes a Monday-Saturday 09:00-18:00 schedule', () => {
    const input = hours([
      { weekday: 0, isOpen: false },
      { weekday: 1, isOpen: true, openingTime: '09:00', closingTime: '18:00' },
      { weekday: 2, isOpen: true, openingTime: '09:00', closingTime: '18:00' },
      { weekday: 3, isOpen: true, openingTime: '09:00', closingTime: '18:00' },
      { weekday: 4, isOpen: true, openingTime: '09:00', closingTime: '18:00' },
      { weekday: 5, isOpen: true, openingTime: '09:00', closingTime: '18:00' },
      { weekday: 6, isOpen: true, openingTime: '09:00', closingTime: '18:00' },
    ])
    expect(summarizeOpeningHours(input)).toBe('Ma–Za · 09:00–18:00')
  })

  it('handles a single open day and mixed schedules', () => {
    const onlySaturday = hours([
      { weekday: 6, isOpen: true, openingTime: '10:00', closingTime: '14:00' },
      { weekday: 0, isOpen: false },
      { weekday: 1, isOpen: false },
      { weekday: 2, isOpen: false },
      { weekday: 3, isOpen: false },
      { weekday: 4, isOpen: false },
      { weekday: 5, isOpen: false },
    ])
    expect(summarizeOpeningHours(onlySaturday)).toBe('Za · 10:00–14:00')
  })

  it('returns Ma-Zo for a full open week', () => {
    const full = hours(Array.from({ length: 7 }, (_, weekday) => ({ weekday, isOpen: true, openingTime: '09:00', closingTime: '17:00' })))
    expect(summarizeOpeningHours(full)).toBe('Ma–Zo · 09:00–17:00')
  })
})

describe('computeOpenStatus', () => {
  const mondayHours = hours([
    { weekday: 1, isOpen: true, openingTime: '09:00', closingTime: '18:00' },
    { weekday: 2, isOpen: true, openingTime: '09:00', closingTime: '18:00' },
  ])

  it('reports open during business hours', () => {
    const now = new Date('2026-09-07T10:00:00.000Z') // Monday 12:00 Europe/Amsterdam (CEST)
    expect(computeOpenStatus(mondayHours, now)).toEqual({ label: 'Nu open', detail: 'Sluit vandaag om 18:00' })
  })

  it('reports closed before opening time', () => {
    const now = new Date('2026-09-07T06:00:00.000Z') // Monday 08:00 Europe/Amsterdam
    expect(computeOpenStatus(mondayHours, now)).toEqual({ label: 'Gesloten', detail: 'Opent vandaag om 09:00' })
  })

  it('reports closed after closing time', () => {
    const now = new Date('2026-09-07T17:00:00.000Z') // Monday 19:00 Europe/Amsterdam
    expect(computeOpenStatus(mondayHours, now)).toEqual({ label: 'Gesloten', detail: 'Vandaag gesloten' })
  })

  it('reports closed on a closed day', () => {
    const now = new Date('2026-09-06T12:00:00.000Z') // Sunday
    expect(computeOpenStatus(mondayHours, now)).toEqual({ label: 'Gesloten', detail: 'Vandaag gesloten' })
  })
})