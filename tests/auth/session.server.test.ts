import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/db/client.server', () => ({ db: {} }))

import { generateSessionToken, hashSessionToken, toSafeUser } from '../../src/auth/session.server'

describe('session helpers', () => {
  it('generates URL-safe random tokens with the expected entropy length', () => {
    const token = generateSessionToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token).toHaveLength(43)
    expect(generateSessionToken()).not.toBe(token)
  })

  it('hashes the same token deterministically and distinguishes tokens', () => {
    expect(hashSessionToken('token')).toBe(hashSessionToken('token'))
    expect(hashSessionToken('token')).toMatch(/^[a-f0-9]{64}$/)
    expect(hashSessionToken('token')).not.toBe(hashSessionToken('other-token'))
  })

  it('returns only the safe customer profile data', () => {
    const safeUser = toSafeUser({
      user: { id: 'user-1', email: 'alex@example.com', passwordHash: 'secret', role: 'customer', createdAt: new Date(), updatedAt: new Date() },
      customerProfile: { userId: 'user-1', fullName: 'Alex Barber', phone: '0612345678', createdAt: new Date(), updatedAt: new Date() },
      ownerProfile: null,
    })
    expect(safeUser).toEqual({ id: 'user-1', email: 'alex@example.com', role: 'customer', name: 'Alex Barber', phone: '0612345678' })
    expect(safeUser).not.toHaveProperty('passwordHash')
  })

  it('returns safe owner profile data and rejects a missing profile', () => {
    const ownerUser = toSafeUser({
      user: { id: 'owner-1', email: 'owner@example.com', passwordHash: 'secret', role: 'owner', createdAt: new Date(), updatedAt: new Date() },
      customerProfile: null,
      ownerProfile: { userId: 'owner-1', displayName: 'Sam', phone: '0612345678', active: true, createdAt: new Date(), updatedAt: new Date() },
    })
    expect(ownerUser).toEqual({ id: 'owner-1', email: 'owner@example.com', role: 'owner', name: 'Sam', phone: '0612345678' })
    expect(toSafeUser({ user: { id: 'user-1', email: 'alex@example.com', passwordHash: null, role: 'customer', createdAt: new Date(), updatedAt: new Date() }, customerProfile: null, ownerProfile: null })).toBeNull()
  })

  it('never maps a legacy staff role to a session user', () => {
    const legacy = toSafeUser({
      user: { id: 'legacy-1', email: 'legacy@example.com', passwordHash: 'secret', role: 'staff', createdAt: new Date(), updatedAt: new Date() },
      customerProfile: null,
      ownerProfile: { userId: 'legacy-1', displayName: 'Legacy', phone: '0612345678', active: true, createdAt: new Date(), updatedAt: new Date() },
    })
    expect(legacy).toBeNull()
  })
})
