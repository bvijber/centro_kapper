import { describe, expect, it } from 'vitest'

import { AuthError } from '../../src/auth/auth.errors'
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_MESSAGE,
  loginSchema,
  parseRegisterCustomerInput,
  registerCustomerSchema,
} from '../../src/auth/auth.schemas'

const registrationInput = (password: string) => ({
  name: 'Alex Barber',
  email: 'alex@example.com',
  phone: '0612345678',
  password,
})

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

describe('registration password policy', () => {
  it('uses a minimum length of 8 characters with the Dutch message', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8)
    expect(PASSWORD_MIN_MESSAGE).toBe('Je wachtwoord moet minimaal 8 tekens bevatten.')
  })

  it('rejects a password with 7 characters', () => {
    const result = registerCustomerSchema.safeParse(registrationInput('abcdefg'))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['password'])
    expect(result.error?.issues[0]?.message).toBe(PASSWORD_MIN_MESSAGE)
  })

  it('accepts a password with 8 characters', () => {
    expect(registerCustomerSchema.safeParse(registrationInput('abcdefgh')).success).toBe(true)
  })

  it('reports validation failures as an AuthError instead of a raw Zod error', () => {
    let thrown: unknown
    try {
      parseRegisterCustomerInput(registrationInput('abcdefg'))
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(AuthError)
    expect((thrown as AuthError).code).toBe('VALIDATION_FAILED')
    expect((thrown as AuthError).message).toBe(PASSWORD_MIN_MESSAGE)
    expect((thrown as AuthError).message.startsWith('[')).toBe(false)
  })

  it('keeps login validation unchanged for existing accounts', () => {
    expect(loginSchema.safeParse({ email: 'alex@example.com', password: 'abcdefgh' }).success).toBe(true)
    expect(loginSchema.safeParse({ email: 'alex@example.com', password: 'x' }).success).toBe(true)
  })
})
