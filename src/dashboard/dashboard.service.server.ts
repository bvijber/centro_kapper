import { and, count, eq, gte, lt, sql } from 'drizzle-orm'

import { db } from '../db/client.server'
import { appointments } from '../db/schema/appointments'
import { cancellationRequests } from '../db/schema/cancellation-requests'
import { staffProfiles } from '../db/schema/profiles'
import { formatAmsterdamDateKey, getAmsterdamDayBounds, getAmsterdamDateParts, parseAmsterdamLocal } from '../timezone'

export type StaffDashboardDTO = {
  revenueThisMonthCents: number
  revenueDeltaPercent: number | null
  appointmentsToday: number
  completedToday: number
  activeStaff: number
  pendingCancellationRequests: number
}

export class DashboardError extends Error {
  constructor(message: string, readonly code: 'FAILED') {
    super(message)
    this.name = 'DashboardError'
  }
}

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

function monthBounds(offsetMonths: number): { start: Date; end: Date } {
  const now = new Date()
  const parts = getAmsterdamDateParts(now)
  const total = parts.year * 12 + (parts.month - 1) + offsetMonths
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  const start = parseAmsterdamLocal(`${year}-${pad(month)}-01`, '00:00')
  const end = month === 12
    ? parseAmsterdamLocal(`${year + 1}-01-01`, '00:00')
    : parseAmsterdamLocal(`${year}-${pad(month + 1)}-01`, '00:00')
  return { start: start ?? new Date(0), end: end ?? new Date(0) }
}

async function revenueBetween(start: Date, end: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${appointments.servicePriceCentsAtBooking}), 0)` })
    .from(appointments)
    .where(and(eq(appointments.status, 'completed'), gte(appointments.completedAt, start), lt(appointments.completedAt, end)))
  return Number(row?.total ?? 0)
}

export async function getStaffDashboard(): Promise<StaffDashboardDTO> {
  try {
    const current = monthBounds(0)
    const previous = monthBounds(-1)
    const todayBounds = getAmsterdamDayBounds(formatAmsterdamDateKey(new Date()))

    const [revenueThisMonthCents, revenueLastMonthCents, appointmentsToday, completedToday, activeStaff, pendingCancellationRequests] = await Promise.all([
      revenueBetween(current.start, current.end),
      revenueBetween(previous.start, previous.end),
      todayBounds
        ? db.select({ value: count() }).from(appointments).where(and(gte(appointments.startsAt, todayBounds.start), lt(appointments.startsAt, todayBounds.end))).then((rows) => rows[0]?.value ?? 0)
        : Promise.resolve(0),
      todayBounds
        ? db.select({ value: count() }).from(appointments).where(and(eq(appointments.status, 'completed'), gte(appointments.completedAt, todayBounds.start), lt(appointments.completedAt, todayBounds.end))).then((rows) => rows[0]?.value ?? 0)
        : Promise.resolve(0),
      db.select({ value: count() }).from(staffProfiles).where(eq(staffProfiles.active, true)).then((rows) => rows[0]?.value ?? 0),
      db.select({ value: count() }).from(cancellationRequests).where(eq(cancellationRequests.status, 'pending')).then((rows) => rows[0]?.value ?? 0),
    ])

    const revenueDeltaPercent = revenueLastMonthCents > 0
      ? Math.round(((revenueThisMonthCents - revenueLastMonthCents) / revenueLastMonthCents) * 100)
      : null

    return {
      revenueThisMonthCents,
      revenueDeltaPercent,
      appointmentsToday,
      completedToday,
      activeStaff,
      pendingCancellationRequests,
    }
  } catch {
    throw new DashboardError('Dashboardgegevens konden niet worden geladen.', 'FAILED')
  }
}