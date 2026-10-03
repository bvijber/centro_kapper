import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

const databaseAvailable = Boolean(process.env.DATABASE_URL)

describe.skipIf(!databaseAvailable)('queue foundation integration', () => {
  it('has the Phase 7 enum, appointment relation and no pre-existing queue rows', async () => {
    const { db } = await import('../db/client.server')
    const { sql } = await import('drizzle-orm')
    const { waitingListEntries } = await import('../db/schema')

    const enumRows = await db.execute(sql`SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'waiting_list_status' ORDER BY e.enumsortorder`)
    expect(enumRows.rows.map((row) => row.enumlabel)).toEqual(['waiting', 'called', 'in_service', 'completed', 'cancelled', 'skipped'])

    const columns = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'waiting_list_entries'`)
    expect(columns.rows.map((row) => row.column_name)).toContain('appointment_id')
    expect(columns.rows.map((row) => row.column_name)).not.toContain('accepted_at')
    expect(columns.rows.map((row) => row.column_name)).not.toContain('rejected_at')

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(waitingListEntries)
    expect(count).toBe(0)
  })

  it('persists lifecycle states and nullable appointment links', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray } = await import('drizzle-orm')
    const { appointments, auditLogs, services, users, waitingListEntries } = await import('../db/schema')
    const { joinQueue, callQueueEntry, startQueueService, completeQueueEntry } = await import('./queue.service.server')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    const serviceId = randomUUID()
    const appointmentId = randomUUID()
    const startsAt = new Date('2099-01-01T09:00:00.000Z')
    const createdIds: string[] = []
    const ownerFixture = await ensureActiveOwnerFixture('queue-foundation')

    await db.insert(services).values({ id: serviceId, name: 'Queue Foundation Service', description: 'Queue integration fixture', durationMinutes: 30, priceCents: 1000, active: true })
    await db.insert(appointments).values({
      id: appointmentId,
      guestName: 'Queue Guest',
      guestPhone: '0612345678',
      serviceId,
      serviceNameAtBooking: 'Queue Foundation Service',
      servicePriceCentsAtBooking: 1000,
      serviceDurationMinutesAtBooking: 30,
      bufferMinutesAtBooking: 0,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      status: 'new',
    })

    try {
      const entry = await joinQueue({ serviceId, guestName: 'Queue Guest', guestPhone: '0612345678' }, { kind: 'guest' })
      createdIds.push(entry.id)
      expect(entry.status).toBe('waiting')

      const ownerActor = { kind: 'owner' as const, userId: ownerFixture.userId }
      expect((await callQueueEntry(entry.id, ownerActor)).status).toBe('called')
      expect((await startQueueService(entry.id, ownerActor, appointmentId)).appointmentId).toBe(appointmentId)
      expect((await completeQueueEntry(entry.id, ownerActor)).status).toBe('completed')

      const stored = await db.select({ status: waitingListEntries.status, appointmentId: waitingListEntries.appointmentId }).from(waitingListEntries).where(eq(waitingListEntries.id, entry.id))
      expect(stored[0]).toEqual({ status: 'completed', appointmentId })
    } finally {
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdIds))
      await db.delete(waitingListEntries).where(inArray(waitingListEntries.id, createdIds))
      await db.delete(appointments).where(eq(appointments.id, appointmentId))
      await db.delete(services).where(eq(services.id, serviceId))
      await removeOwnerFixture(ownerFixture)
    }
  })

  it('allows multiple authenticated customer entries and preserves distinct rows', async () => {
    const { db } = await import('../db/client.server')
    const { and, eq, inArray } = await import('drizzle-orm')
    const { auditLogs, customerProfiles, services, users, waitingListEntries } = await import('../db/schema')
    const { joinQueue } = await import('./queue.service.server')

    const serviceId = randomUUID()
    const customerId = randomUUID()
    const email = `queue-${randomUUID()}@example.com`
    await db.insert(services).values({ id: serviceId, name: 'Queue Duplicate Service', description: 'Queue duplicate fixture', durationMinutes: 20, priceCents: 1000, active: true })
    await db.insert(users).values({ id: customerId, email, role: 'customer' })

    let results: PromiseSettledResult<Awaited<ReturnType<typeof joinQueue>>>[] = []
    try {
      results = await Promise.allSettled([
        joinQueue({ serviceId }, { kind: 'customer', userId: customerId }),
        joinQueue({ serviceId }, { kind: 'customer', userId: customerId }),
      ])
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2)
      const ids = results.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof joinQueue>>> => result.status === 'fulfilled').map((result) => result.value.id)
      expect(new Set(ids).size).toBe(2)
    } finally {
      const ids = results.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof joinQueue>>> => result.status === 'fulfilled').map((result) => result.value.id)
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, ids))
      await db.delete(waitingListEntries).where(inArray(waitingListEntries.id, ids))
      await db.delete(customerProfiles).where(eq(customerProfiles.userId, customerId))
      await db.delete(users).where(and(eq(users.id, customerId), eq(users.email, email)))
      await db.delete(services).where(eq(services.id, serviceId))
    }
  })
})
