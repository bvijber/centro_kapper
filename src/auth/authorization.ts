import { AuthError } from './auth.errors'
import { getCurrentUser } from './auth.service.server'
import type { SafeUser } from './auth.schemas'

export async function requireAuthenticatedUser(): Promise<SafeUser> {
  const user = await getCurrentUser()
  if (!user) throw new AuthError('Je moet ingelogd zijn.', 'UNAUTHORIZED')
  return user
}

export async function requireCustomer(): Promise<SafeUser> {
  const user = await requireAuthenticatedUser()
  if (user.role !== 'customer') throw new AuthError('Geen toegang.', 'FORBIDDEN')
  return user
}

export async function requireStaff(): Promise<SafeUser> {
  const user = await requireAuthenticatedUser()
  if (user.role !== 'staff') throw new AuthError('Geen toegang.', 'FORBIDDEN')
  return user
}

export async function requireOwnership(ownerUserId: string): Promise<SafeUser> {
  const user = await requireAuthenticatedUser()
  if (user.id !== ownerUserId) throw new AuthError('Geen toegang.', 'FORBIDDEN')
  return user
}
