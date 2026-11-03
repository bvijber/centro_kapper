import { describe, expect, it, vi } from 'vitest'

vi.mock('../db/client.server', () => ({ db: {} }))

import { normalizeOpeningHourTime } from './settings.service.server'

describe('opening hour time normalization', () => {
  it('normaliseert databasewaarden met seconden naar HH:MM', () => {
    expect(normalizeOpeningHourTime('09:00:00')).toBe('09:00')
    expect(normalizeOpeningHourTime('18:00:00')).toBe('18:00')
  })

  it('behoudt null voor gesloten of ontbrekende tijden', () => {
    expect(normalizeOpeningHourTime(null)).toBeNull()
  })
})
