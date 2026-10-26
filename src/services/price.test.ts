import { describe, expect, it } from 'vitest'

import { formatCentsAsEuro, parseEuroToCents } from './price'

describe('parseEuroToCents', () => {
  it('accepts whole euro amounts', () => {
    expect(parseEuroToCents('35')).toBe(3500)
    expect(parseEuroToCents('0')).toBe(0)
    expect(parseEuroToCents('  10 ')).toBe(1000)
  })

  it('accepts Dutch comma notation', () => {
    expect(parseEuroToCents('35,00')).toBe(3500)
    expect(parseEuroToCents('35,5')).toBe(3550)
    expect(parseEuroToCents('35,50')).toBe(3550)
    expect(parseEuroToCents('0,01')).toBe(1)
  })

  it('accepts dot notation', () => {
    expect(parseEuroToCents('35.50')).toBe(3550)
    expect(parseEuroToCents('35.')).toBeNull()
  })

  it('rejects empty, negative, invalid and too-precise input', () => {
    expect(parseEuroToCents('')).toBeNull()
    expect(parseEuroToCents('   ')).toBeNull()
    expect(parseEuroToCents('-5')).toBeNull()
    expect(parseEuroToCents('abc')).toBeNull()
    expect(parseEuroToCents('35,500')).toBeNull()
    expect(parseEuroToCents('35.123')).toBeNull()
    expect(parseEuroToCents('35,')).toBeNull()
    expect(parseEuroToCents('1,2,3')).toBeNull()
    expect(parseEuroToCents('1.2.3')).toBeNull()
  })
})

describe('formatCentsAsEuro', () => {
  it('formats cents as Dutch euro string', () => {
    expect(formatCentsAsEuro(3500)).toBe('35,00')
    expect(formatCentsAsEuro(3550)).toBe('35,50')
    expect(formatCentsAsEuro(0)).toBe('0,00')
    expect(formatCentsAsEuro(1)).toBe('0,01')
  })
})