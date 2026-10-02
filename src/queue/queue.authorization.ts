import { AuthError } from '../auth/auth.errors'
import type { SafeUser } from '../auth/auth.schemas'
import type { QueueJoinInput } from './queue.schemas'

export type QueueActor =
  | { kind: 'customer'; userId: string }
  | { kind: 'staff'; userId: string }
  | { kind: 'guest'; capability?: string }

export type QueueMutationActor = Exclude<QueueActor, { kind: 'guest' }>

export function resolveQueueActor(user: SafeUser): QueueMutationActor {
  return user.role === 'owner' || user.role === 'staff' ? { kind: 'staff', userId: user.id } : { kind: 'customer', userId: user.id }
}

export function authorizeQueueJoin(input: QueueJoinInput, user: SafeUser | null): QueueActor {
  const hasGuestIdentity = input.guestName !== undefined || input.guestPhone !== undefined

  if (user?.role === 'owner' || user?.role === 'staff') {
    if (!input.customerUserId && !hasGuestIdentity) {
      throw new AuthError('Een customer of gast is verplicht.', 'FORBIDDEN')
    }
    return { kind: 'staff', userId: user.id }
  }

  if (user?.role === 'customer') {
    if (input.customerUserId !== undefined) {
      throw new AuthError('Customer identity wordt server-side bepaald.', 'FORBIDDEN')
    }
    if (hasGuestIdentity) {
      throw new AuthError('Een ingelogde customer kan geen gastidentiteit gebruiken.', 'FORBIDDEN')
    }
    return { kind: 'customer', userId: user.id }
  }

  if (input.customerUserId !== undefined || !hasGuestIdentity) {
    throw new AuthError('Log in of vul geldige gastgegevens in.', 'UNAUTHORIZED')
  }
  return { kind: 'guest' }
}

export function requireStaffQueueActor(actor: QueueMutationActor): void {
  if (actor.kind !== 'staff') throw new AuthError('Alleen de barber kan deze actie uitvoeren.', 'FORBIDDEN')
}

export function requireQueueEntryAccess(
  actor: QueueActor | null,
  entry: { customerUserId: string | null; guestAccessTokenHash?: string | null },
): void {
  if (actor?.kind === 'staff') return
  if (actor?.kind === 'customer') {
    if (entry.customerUserId !== actor.userId) throw new AuthError('Geen toegang.', 'FORBIDDEN')
    return
  }
  if (entry.customerUserId !== null || !actor?.capability || !entry.guestAccessTokenHash) throw new AuthError('Geen toegang.', 'FORBIDDEN')
}

export function requireQueueMutationOwnership(
  actor: QueueActor,
  entry: { customerUserId: string | null },
): void {
  requireQueueEntryAccess(actor, entry)
}
