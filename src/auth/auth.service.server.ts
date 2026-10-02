import { createHash } from 'node:crypto'

import { and, eq } from 'drizzle-orm'

import { db } from '../db/client.server'
import { customerProfiles, staffProfiles } from '../db/schema/profiles'
import { sessions, users } from '../db/schema/users'
import { AuthError } from './auth.errors'
import { recordAuditEvent } from './audit.server'
import { consumeRateLimit } from './rate-limit.server'
import { getRequestAuditContext } from './request-context.server'
import { hashPassword, verifyPassword } from './password.server'
import { createSession, generateSessionToken, getCurrentSessionUser, hashSessionToken, refreshCurrentSession, revokeCurrentSession, setSessionCookie } from './session.server'
import type { LoginInput, RegisterCustomerInput, SafeUser } from './auth.schemas'

const RATE_WINDOW_SECONDS = 15 * 60

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function rateKey(prefix: string, value: string): string {
  return `${prefix}:${createHash('sha256').update(value).digest('hex')}`
}

function requestAuditContext() {
  return getRequestAuditContext()
}

async function audit(action: string, actorUserId?: string, metadata?: Record<string, string | boolean | null>): Promise<void> {
  await recordAuditEvent({ action, actorUserId, entityType: 'user', metadata, ...requestAuditContext() })
}

export async function registerCustomer(input: RegisterCustomerInput): Promise<SafeUser> {
  const email = normalizeEmail(input.email)
  const context = requestAuditContext()
  const ipKey = context.ip ?? 'unknown'
  if (!(await consumeRateLimit(rateKey('register-ip', ipKey), 3, RATE_WINDOW_SECONDS))) {
    throw new AuthError('Registratie tijdelijk niet beschikbaar.', 'RATE_LIMITED')
  }

  const passwordHash = await hashPassword(input.password)
  const sessionToken = generateSessionToken()
  const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  try {
    const safeUser = await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ email, passwordHash, role: 'customer' }).returning()
      if (!user) throw new AuthError('Registratie mislukt.', 'SETUP_FAILED')
      await tx.insert(customerProfiles).values({ userId: user.id, fullName: input.name.trim(), phone: input.phone.trim() })
      const safeUser: SafeUser = { id: user.id, email: user.email, role: 'customer', name: input.name.trim(), phone: input.phone.trim() }
      await tx.insert(sessions).values({ userId: user.id, tokenHash: hashSessionToken(sessionToken), expiresAt: sessionExpiresAt, lastSeenAt: new Date() })
      await recordAuditEvent({ action: 'auth.register', actorUserId: user.id, entityType: 'user', entityId: user.id, ...context }, tx)
      return safeUser
    })
    setSessionCookie(sessionToken, sessionExpiresAt)
    return safeUser
  } catch (error: unknown) {
    if (error instanceof AuthError) throw error
    if (String(error).toLowerCase().includes('unique')) throw new AuthError('Er bestaat al een account met dit e-mailadres.', 'EMAIL_TAKEN')
    throw new AuthError('Registratie mislukt.', 'SETUP_FAILED')
  }
}

export async function login(input: LoginInput): Promise<SafeUser> {
  const email = normalizeEmail(input.email)
  const context = requestAuditContext()
  const ipKey = context.ip ?? 'unknown'
  const emailAllowed = await consumeRateLimit(rateKey('login-email', email), 5, RATE_WINDOW_SECONDS)
  const ipAllowed = await consumeRateLimit(rateKey('login-ip', ipKey), 20, RATE_WINDOW_SECONDS)
  if (!emailAllowed || !ipAllowed) throw new AuthError('Ongeldige inloggegevens.', 'RATE_LIMITED')

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  const valid = user?.passwordHash ? await verifyPassword(input.password, user.passwordHash) : false
  if (!user || !valid) {
    await recordAuditEvent({ action: 'auth.login.failed', entityType: 'user', metadata: { reason: 'invalid_credentials' }, ...context })
    throw new AuthError('Ongeldige inloggegevens.', 'INVALID_CREDENTIALS')
  }

  const current = await getCurrentSessionUser()
  if (current) await revokeCurrentSession()
  let name: string
  let phone: string
  if (user.role === 'customer') {
    const profile = (await db.select().from(customerProfiles).where(eq(customerProfiles.userId, user.id)).limit(1))[0]
    if (!profile) throw new AuthError('Ongeldige inloggegevens.', 'INVALID_CREDENTIALS')
    name = profile.fullName
    phone = profile.phone
  } else if (user.role === 'owner') {
    const profile = (await db.select().from(staffProfiles).where(and(eq(staffProfiles.userId, user.id), eq(staffProfiles.active, true))).limit(1))[0]
    if (!profile) throw new AuthError('Ongeldige inloggegevens.', 'INVALID_CREDENTIALS')
    name = profile.displayName
    phone = profile.phone
  } else {
    throw new AuthError('Ongeldige inloggegevens.', 'INVALID_CREDENTIALS')
  }
  const safeUser: SafeUser = { id: user.id, email: user.email, role: user.role, name, phone }
  await createSession(user.id, user.role)
  await recordAuditEvent({ action: 'auth.login.success', actorUserId: user.id, entityType: 'user', entityId: user.id, ...context })
  return safeUser
}

export async function logout(): Promise<void> {
  const current = await getCurrentSessionUser()
  await revokeCurrentSession()
  await audit('auth.logout', current?.user.id)
}

export async function getCurrentUser(): Promise<SafeUser | null> {
  return (await getCurrentSessionUser())?.user ?? null
}

export async function refreshSession(): Promise<SafeUser | null> {
  const user = await refreshCurrentSession()
  if (user) await audit('auth.session.refresh', user.id)
  return user
}

export async function createInitialStaffAccount(input: { email: string; password: string; displayName: string; phone: string }): Promise<SafeUser> {
  const email = normalizeEmail(input.email)
  if (!email || !input.password || !input.displayName.trim()) throw new AuthError('Staff setup is ongeldig.', 'SETUP_FAILED')
  const passwordHash = await hashPassword(input.password)
  try {
    const [user] = await db.insert(users).values({ email, passwordHash, role: 'staff' }).returning()
    if (!user) throw new AuthError('Staff setup is mislukt.', 'SETUP_FAILED')
    const [profile] = await db.insert(staffProfiles).values({ userId: user.id, displayName: input.displayName.trim(), phone: input.phone.trim(), active: true }).returning()
    if (!profile) throw new AuthError('Staff setup is mislukt.', 'SETUP_FAILED')
    return { id: user.id, email: user.email, role: 'staff', name: profile.displayName, phone: profile.phone }
  } catch (error: unknown) {
    if (error instanceof AuthError) throw error
    if (String(error).toLowerCase().includes('unique')) throw new AuthError('Er bestaat al een account met dit e-mailadres.', 'EMAIL_TAKEN')
    throw new AuthError('Staff setup is mislukt.', 'SETUP_FAILED')
  }
}

export async function createInitialOwnerAccount(input: { email: string; password: string; displayName: string; phone: string }): Promise<SafeUser> {
  const email = normalizeEmail(input.email)
  if (!email || !input.password || !input.displayName.trim()) throw new AuthError('Owner setup is ongeldig.', 'SETUP_FAILED')
  const passwordHash = await hashPassword(input.password)
  try {
    const [user] = await db.insert(users).values({ email, passwordHash, role: 'owner' }).returning()
    if (!user) throw new AuthError('Owner setup is mislukt.', 'SETUP_FAILED')
    const [profile] = await db.insert(staffProfiles).values({ userId: user.id, displayName: input.displayName.trim(), phone: input.phone.trim(), active: true }).returning()
    if (!profile) throw new AuthError('Owner setup is mislukt.', 'SETUP_FAILED')
    return { id: user.id, email: user.email, role: 'owner', name: profile.displayName, phone: profile.phone }
  } catch (error: unknown) {
    if (error instanceof AuthError) throw error
    if (String(error).toLowerCase().includes('unique')) throw new AuthError('Er bestaat al een account met dit e-mailadres.', 'EMAIL_TAKEN')
    throw new AuthError('Owner setup is mislukt.', 'SETUP_FAILED')
  }
}
