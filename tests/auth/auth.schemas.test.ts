import { describe, expect, it } from 'vitest'

import { loginSchema, registerCustomerSchema } from '../../src/auth/auth.schemas'

describe('auth schemas', () => {
  it('accepts valid registration input', () => {
    expect(registerCustomerSchema.safeParse({ name: 'Alex Barber', email: ' alex@example.com ', phone: '0612345678', password: 'correct horse battery staple' }).success).toBe(true)
  })

  it('rejects invalid registration input and enforced boundaries', () => {
    expect(registerCustomerSchema.safeParse({ name: 'A', email: 'not-an-email', phone: '12345', password: 'short' }).success).toBe(false)
    expect(registerCustomerSchema.safeParse({ name: 'Valid Name', email: `${'a'.repeat(321)}@example.com`, phone: '0612345678', password: 'correct horse battery staple' }).success).toBe(false)
  })

  it('accepts valid login input', () => {
    expect(loginSchema.safeParse({ email: 'alex@example.com', password: 'x' }).success).toBe(true)
  })

  it('rejects invalid login input and enforced boundaries', () => {
    expect(loginSchema.safeParse({ email: 'bad', password: '' }).success).toBe(false)
    expect(loginSchema.safeParse({ email: 'alex@example.com', password: 'a'.repeat(257) }).success).toBe(false)
  })
})
