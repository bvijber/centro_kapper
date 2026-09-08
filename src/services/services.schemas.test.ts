import { describe, expect, it } from 'vitest'

import { serviceCreateSchema, serviceUpdateRequestSchema, serviceIdSchema } from './services.schemas'

describe('services schemas', () => {
  it('accepts a valid service create input', () => {
    const valid = { name: 'Knippen', description: 'Knippen & styling', durationMinutes: 30, priceCents: 2500 }
    expect(serviceCreateSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects invalid service create input', () => {
    expect(serviceCreateSchema.safeParse({ name: ' ', description: 'x', durationMinutes: 30, priceCents: 2500 }).success).toBe(false)
    expect(serviceCreateSchema.safeParse({ name: 'Knippen', description: ' ', durationMinutes: 30, priceCents: 2500 }).success).toBe(false)
    expect(serviceCreateSchema.safeParse({ name: 'Knippen', description: 'x', durationMinutes: 0, priceCents: 2500 }).success).toBe(false)
    expect(serviceCreateSchema.safeParse({ name: 'Knippen', description: 'x', durationMinutes: 30, priceCents: -1 }).success).toBe(false)
    expect(serviceCreateSchema.safeParse({ name: 'Knippen', description: 'x', durationMinutes: 30.5, priceCents: 2500 }).success).toBe(false)
  })

  it('accepts partial service updates but requires at least one field', () => {
    expect(serviceUpdateRequestSchema.safeParse({ id: crypto.randomUUID(), priceCents: 3000 }).success).toBe(true)
    expect(serviceUpdateRequestSchema.safeParse({ id: crypto.randomUUID(), name: 'Baard trimmen' }).success).toBe(true)
    expect(serviceUpdateRequestSchema.safeParse({ id: crypto.randomUUID() }).success).toBe(false)
  })

  it('rejects invalid ids', () => {
    expect(serviceIdSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false)
    expect(serviceIdSchema.safeParse({ id: crypto.randomUUID() }).success).toBe(true)
  })
})