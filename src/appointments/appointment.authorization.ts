import { AuthError } from '../auth/auth.errors'
import type { SafeUser } from '../auth/auth.schemas'
import type { AppointmentCreateInput } from './appointment.schemas'

export type AppointmentActor =
  | { kind: 'customer'; userId: string }
  | { kind: 'owner'; userId: string }
  | { kind: 'guest' }

export type AppointmentMutationActor = { kind: 'customer'; userId: string } | { kind: 'owner'; userId: string }

export function resolveMutationActor(user: SafeUser): AppointmentMutationActor {
  return user.role === 'owner' ? { kind: 'owner', userId: user.id } : { kind: 'customer', userId: user.id }
}

export function requireAppointmentMutationAccess(actor: AppointmentMutationActor, customerUserId: string | null): void {
  if (actor.kind === 'customer' && customerUserId !== actor.userId) {
    throw new AuthError('Geen toegang.', 'FORBIDDEN')
  }
}

export function requireOwnerMutationActor(actor: AppointmentMutationActor): void {
  if (actor.kind !== 'owner') {
    throw new AuthError('Alleen de eigenaar kan deze actie uitvoeren.', 'FORBIDDEN')
  }
}

function hasGuestInput(input: AppointmentCreateInput): boolean {
  return input.guestName !== undefined || input.guestPhone !== undefined || input.guestEmail !== undefined
}

function hasOverrideInput(input: AppointmentCreateInput): boolean {
  return input.overrideOpeningHours || input.overrideBreak || input.overrideWholeDayBlock
}

export function authorizeAppointmentCreate(input: AppointmentCreateInput, user: SafeUser | null): AppointmentActor {
  if (user?.role === 'owner') {
    if (!input.customerUserId && !hasGuestInput(input)) {
      throw new AuthError('Een customer of gast is verplicht.', 'FORBIDDEN')
    }
    return { kind: 'owner', userId: user.id }
  }

  if (user?.role === 'customer') {
    if (input.customerUserId !== undefined) {
      throw new AuthError('Customer identity wordt server-side bepaald.', 'FORBIDDEN')
    }
    if (hasGuestInput(input)) {
      throw new AuthError('Een ingelogde customer kan geen gastidentiteit gebruiken.', 'FORBIDDEN')
    }
    if (hasOverrideInput(input)) {
      throw new AuthError('Alleen de eigenaar mag beschikbaarheid overrulen.', 'FORBIDDEN')
    }
    if (input.confirmOverlap) throw new AuthError('Alleen de eigenaar kan overlap bevestigen.', 'FORBIDDEN')
    return { kind: 'customer', userId: user.id }
  }

  if (user?.role === 'customer' && input.confirmOverlap) throw new AuthError('Alleen de eigenaar kan overlap bevestigen.', 'FORBIDDEN')

  if (input.customerUserId !== undefined || !hasGuestInput(input)) {
    throw new AuthError('Log in of vul geldige gastgegevens in.', 'UNAUTHORIZED')
  }
  if (hasOverrideInput(input)) {
    throw new AuthError('Alleen de eigenaar mag beschikbaarheid overrulen.', 'FORBIDDEN')
  }
  if (input.confirmOverlap) throw new AuthError('Alleen de eigenaar kan overlap bevestigen.', 'FORBIDDEN')
  return { kind: 'guest' }
}

export function authorizeAppointmentRead(user: SafeUser, customerUserId: string | null): void {
  if (user.role === 'customer' && customerUserId !== user.id) {
    throw new AuthError('Geen toegang.', 'FORBIDDEN')
  }
}
