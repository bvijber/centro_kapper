import { describe, expect, it } from 'vitest'

import { AuthError, isAuthError } from '../../src/auth/auth.errors'

describe('auth errors', () => {
  it('constructs an AuthError with its relevant properties', () => {
    const error = new AuthError('No access', 'FORBIDDEN')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('AuthError')
    expect(error.message).toBe('No access')
    expect(error.code).toBe('FORBIDDEN')
  })

  it('identifies AuthError values only', () => {
    expect(isAuthError(new AuthError('No access', 'UNAUTHORIZED'))).toBe(true)
    expect(isAuthError(new Error('No access'))).toBe(false)
    expect(isAuthError(null)).toBe(false)
    expect(isAuthError({ name: 'AuthError', code: 'FORBIDDEN' })).toBe(false)
  })
})
