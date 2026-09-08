import { describe, expect, it } from 'vitest'

import { customerProfileUpdateSchema, staffProfileUpdateSchema } from './profiles.schemas'

describe('profiles schemas', () => {
  it('accepts valid customer profile updates', () => {
    expect(customerProfileUpdateSchema.safeParse({ fullName: 'Daan Jansen', phone: '+31 6 12345678' }).success).toBe(true)
  })

  it('rejects invalid customer profile updates', () => {
    expect(customerProfileUpdateSchema.safeParse({ fullName: ' ', phone: '+31 6 12345678' }).success).toBe(false)
    expect(customerProfileUpdateSchema.safeParse({ fullName: 'Daan', phone: '12' }).success).toBe(false)
    expect(customerProfileUpdateSchema.safeParse({ fullName: 'Daan' }).success).toBe(false)
  })

  it('accepts and rejects staff profile updates at its boundaries', () => {
    expect(staffProfileUpdateSchema.safeParse({ displayName: 'Sam Vermeer', phone: '+31 6 12345678' }).success).toBe(true)
    expect(staffProfileUpdateSchema.safeParse({ displayName: '', phone: '+31 6 12345678' }).success).toBe(false)
    expect(staffProfileUpdateSchema.safeParse({ displayName: 'Sam Vermeer', phone: '' }).success).toBe(false)
  })
})