import { sql } from 'drizzle-orm'

import type { Database } from '../db/client.server'

export type AppointmentTimeRange = {
  startsAt: Date
  endsAt: Date
}

export type BlockingAppointment = {
  status: 'new' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
  slotReleasedAt: Date | null
}

type AppointmentTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export function isOverlapping(existing: AppointmentTimeRange, requested: AppointmentTimeRange): boolean {
  return existing.startsAt < requested.endsAt && existing.endsAt > requested.startsAt
}

export function blocksCapacity(appointment: BlockingAppointment): boolean {
  return appointment.status === 'new'
    || appointment.status === 'confirmed'
    || appointment.status === 'in_progress'
    || (appointment.status === 'no_show' && appointment.slotReleasedAt === null)
}

export function getAppointmentLockKey(barberUserId: string): string {
  return `appointment:${barberUserId}`
}

export async function acquireAppointmentLock(tx: AppointmentTransaction, barberUserId: string): Promise<void> {
  const lockKey = getAppointmentLockKey(barberUserId)
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`)
}
