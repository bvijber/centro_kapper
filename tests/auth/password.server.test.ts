import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword } from '../../src/auth/password.server'

describe('password helpers', () => {
  const password = 'correct horse battery staple'

  it('hashes without plaintext and verifies correct and incorrect passwords', async () => {
    const passwordHash = await hashPassword(password)
    expect(passwordHash).not.toBe(password)
    expect(passwordHash).toContain('$argon2')
    await expect(verifyPassword(password, passwordHash)).resolves.toBe(true)
    await expect(verifyPassword('wrong password', passwordHash)).resolves.toBe(false)
  })

  it('generates different hashes for the same password', async () => {
    const firstHash = await hashPassword(password)
    const secondHash = await hashPassword(password)
    expect(secondHash).not.toBe(firstHash)
    await expect(verifyPassword(password, secondHash)).resolves.toBe(true)
  })

  it('rejects malformed password hashes safely', async () => {
    await expect(verifyPassword(password, 'not-a-password-hash')).resolves.toBe(false)
  })
})
