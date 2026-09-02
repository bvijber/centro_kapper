import { createHash, randomBytes } from 'node:crypto'

import { and, eq, gt, isNull } from 'drizzle-orm'
import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server'

import { db } from '../db/client.server'
import { customerProfiles, staffProfiles } from '../db/schema/profiles'
import { sessions, users } from '../db/schema/users'
import type { SafeUser } from './auth.schemas'

export const SESSION_COOKIE = 'ck_session'
const CUSTOMER_SESSION_DAYS = 30
const STAFF_SESSION_DAYS = 7
const MAX_SESSION_DAYS = 90

type SessionUserRow = {
  user: typeof users.$inferSelect
  customerProfile: typeof customerProfiles.$inferSelect | null
  staffProfile: typeof staffProfiles.$inferSelect | null
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function sessionLifetimeDays(role: 'customer' | 'staff'): number {
  return role === 'staff' ? STAFF_SESSION_DAYS : CUSTOMER_SESSION_DAYS
}

function setSessionCookie(token: string, expiresAt: Date): void {
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export function clearSessionCookie(): void {
  deleteCookie(SESSION_COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' })
}

export function toSafeUser(row: SessionUserRow): SafeUser | null {
  const profile = row.user.role === 'customer' ? row.customerProfile : row.staffProfile
  if (!profile) return null
  return {
    id: row.user.id,
    email: row.user.email,
    role: row.user.role,
    name: row.user.role === 'customer' ? row.customerProfile!.fullName : row.staffProfile!.displayName,
    phone: profile.phone,
  }
}

async function loadSessionUser(tokenHash: string): Promise<{ session: typeof sessions.$inferSelect; safeUser: SafeUser } | null> {
  const now = new Date()
  const [row] = await db
    .select({
      session: sessions,
      user: users,
      customerProfile: customerProfiles,
      staffProfile: staffProfiles,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .leftJoin(customerProfiles, eq(customerProfiles.userId, users.id))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
    .limit(1)

  if (!row) return null
  const safeUser = toSafeUser(row)
  return safeUser ? { session: row.session, safeUser } : null
}

export async function createSession(userId: string, role: 'customer' | 'staff'): Promise<string> {
  const token = generateSessionToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + sessionLifetimeDays(role) * 24 * 60 * 60 * 1000)
  await db.insert(sessions).values({ userId, tokenHash: hashSessionToken(token), expiresAt, createdAt: now, lastSeenAt: now })
  setSessionCookie(token, expiresAt)
  return token
}

export async function getCurrentSessionUser(): Promise<{ session: typeof sessions.$inferSelect; user: SafeUser } | null> {
  const token = getCookie(SESSION_COOKIE)
  if (!token) return null
  return loadSessionUser(hashSessionToken(token)).then((result) => result && { session: result.session, user: result.safeUser })
}

export async function revokeCurrentSession(): Promise<string | null> {
  const token = getCookie(SESSION_COOKIE)
  clearSessionCookie()
  if (!token) return null
  const tokenHash = hashSessionToken(token)
  await db.update(sessions).set({ revokedAt: new Date(), lastSeenAt: new Date() }).where(eq(sessions.tokenHash, tokenHash))
  return tokenHash
}

export async function refreshCurrentSession(): Promise<SafeUser | null> {
  const token = getCookie(SESSION_COOKIE)
  if (!token) return null
  const current = await loadSessionUser(hashSessionToken(token))
  if (!current) {
    clearSessionCookie()
    return null
  }

  const now = new Date()
  const maximumExpiry = new Date(current.session.createdAt.getTime() + MAX_SESSION_DAYS * 24 * 60 * 60 * 1000)
  const requestedExpiry = new Date(now.getTime() + sessionLifetimeDays(current.safeUser.role) * 24 * 60 * 60 * 1000)
  const expiresAt = requestedExpiry < maximumExpiry ? requestedExpiry : maximumExpiry
  const nextToken = generateSessionToken()
  await db.update(sessions).set({ revokedAt: now, lastSeenAt: now }).where(eq(sessions.id, current.session.id))
  await db.insert(sessions).values({ userId: current.safeUser.id, tokenHash: hashSessionToken(nextToken), expiresAt, createdAt: now, lastSeenAt: now })
  setSessionCookie(nextToken, expiresAt)
  return current.safeUser
}
