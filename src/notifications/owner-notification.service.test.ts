import { randomUUID } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  /** Uitgevoerde bewerkingen die in de omhullende transactie zijn blijven staan. */
  committed: [] as Array<{ op: string; scope: 'outer' | 'savepoint'; values?: unknown }>,
  /** Alle pogingen, ook de bewerkingen die door een savepoint zijn teruggedraaid. */
  attempts: [] as Array<{ op: string; scope: 'outer' | 'savepoint' }>,
  failMaterialization: false,
  pendingEvents: [] as unknown[],
  outerExecutor: null as unknown,
  savepointExecutor: null as unknown,
}))

const repositoryMocks = vi.hoisted(() => ({
  findActiveOwnerId: vi.fn(),
  insertOwnerNotificationEvent: vi.fn(),
  insertOwnerNotification: vi.fn(),
  listOwnerNotifications: vi.fn(),
  countUnreadOwnerNotifications: vi.fn(),
  markOwnerNotificationRead: vi.fn(),
  markAllOwnerNotificationsRead: vi.fn(),
  deleteExpiredOwnerNotifications: vi.fn(),
  listPendingOwnerNotificationEvents: vi.fn(),
  findQueueEntryIdentity: vi.fn(),
  findAppointmentIdentity: vi.fn(),
  findCustomerProfileName: vi.fn(),
}))

vi.mock('../db/client.server', () => ({
  db: {
    transaction: async (callback: (tx: unknown) => unknown) => callback(harness.outerExecutor),
  },
}))
vi.mock('./owner-notification.repository.server', () => repositoryMocks)

import {
  OWNER_NOTIFICATION_RETENTION_DAYS,
  cleanupExpiredOwnerNotifications,
  getOwnerUnreadCount,
  listOwnerNotifications,
  markAllOwnerNotificationsRead,
  markOwnerNotificationRead,
  recordAppointmentBookedNotification,
  recordAppointmentCancelledNotification,
  recordOwnerNotification,
  recordQueueJoinedNotification,
  recordQueueLeftNotification,
  repairMissingOwnerNotifications,
} from './owner-notification.service.server'

const ownerId = randomUUID()
const entityId = randomUUID()

function scopeOf(executor: unknown): 'outer' | 'savepoint' {
  return executor === harness.savepointExecutor ? 'savepoint' : 'outer'
}

function resetMocks() {
  harness.committed = []
  harness.attempts = []
  harness.failMaterialization = false
  harness.pendingEvents = []
  Object.values(repositoryMocks).forEach((mock) => mock.mockReset())
  harness.outerExecutor = {
    transaction: async (callback: (tx: unknown) => unknown) => {
      const committedBefore = harness.committed.length
      try {
        return await callback(harness.savepointExecutor)
      } catch (error) {
        // Een savepoint rolt alleen zijn eigen bewerkingen terug.
        harness.committed.length = committedBefore
        throw error
      }
    },
  }
  harness.savepointExecutor = {}

  repositoryMocks.findActiveOwnerId.mockResolvedValue(ownerId)
  repositoryMocks.insertOwnerNotificationEvent.mockImplementation(async (executor: unknown, values: unknown) => {
    harness.attempts.push({ op: 'event', scope: scopeOf(executor) })
    harness.committed.push({ op: 'event', scope: scopeOf(executor), values })
    return { id: 'event-id', created: true }
  })
  repositoryMocks.insertOwnerNotification.mockImplementation(async (executor: unknown, values: unknown) => {
    harness.attempts.push({ op: 'notification', scope: scopeOf(executor) })
    if (harness.failMaterialization) throw new Error('meldingopslag mislukt')
    harness.committed.push({ op: 'notification', scope: scopeOf(executor), values })
    return { id: 'notification-id' }
  })
  repositoryMocks.listOwnerNotifications.mockResolvedValue([])
  repositoryMocks.countUnreadOwnerNotifications.mockResolvedValue(0)
  repositoryMocks.markOwnerNotificationRead.mockResolvedValue(true)
  repositoryMocks.markAllOwnerNotificationsRead.mockResolvedValue(0)
  repositoryMocks.deleteExpiredOwnerNotifications.mockResolvedValue(0)
  repositoryMocks.listPendingOwnerNotificationEvents.mockResolvedValue([])
  repositoryMocks.findQueueEntryIdentity.mockResolvedValue({ customerUserId: null, guestName: 'Jan Jansen' })
  repositoryMocks.findAppointmentIdentity.mockResolvedValue({ customerUserId: null, guestName: 'Jan Jansen' })
  repositoryMocks.findCustomerProfileName.mockResolvedValue('Jan Jansen')
}

describe('owner notification service', () => {
  beforeEach(resetMocks)

  it('registers the event in the surrounding transaction and materialises it in a savepoint', async () => {
    const result = await recordOwnerNotification(harness.outerExecutor as never, {
      event: 'queue_joined',
      entityType: 'queue_entry',
      entityId,
      title: 'Nieuwe wachtrij-inschrijving',
      body: 'Jan Jansen is toegevoegd aan de wachtrij.',
    })

    expect(result.eventCreated).toBe(true)
    expect(result.notificationCreated).toBe(true)
    expect(harness.attempts).toEqual([
      { op: 'event', scope: 'outer' },
      { op: 'notification', scope: 'savepoint' },
    ])
    expect(repositoryMocks.insertOwnerNotificationEvent).toHaveBeenCalledWith(harness.outerExecutor, {
      dedupKey: `queue_joined:${entityId}`,
      event: 'queue_joined',
      recipientUserId: ownerId,
      entityType: 'queue_entry',
      entityId,
    })
  })

  it('keeps the core action intact when the notification cannot be stored', async () => {
    harness.failMaterialization = true

    const result = await recordOwnerNotification(harness.outerExecutor as never, {
      event: 'queue_joined',
      entityType: 'queue_entry',
      entityId,
      title: 'Nieuwe wachtrij-inschrijving',
      body: 'Jan Jansen is toegevoegd aan de wachtrij.',
    })

    // De meldingsfout mag de kernactie niet laten mislukken.
    expect(result.eventCreated).toBe(true)
    expect(result.notificationCreated).toBe(false)
    expect(result.notificationId).toBeNull()
    // Het duurzame gebeurtenisrecord blijft in de omhullende transactie staan;
    // alleen de mislukte meldingsinsert is door de savepoint teruggedraaid.
    expect(harness.committed.map((call) => call.op)).toEqual(['event'])
    expect(harness.attempts.map((call) => call.op)).toEqual(['event', 'notification'])
  })

  it('creates no second notification when the event was already registered', async () => {
    repositoryMocks.insertOwnerNotificationEvent.mockResolvedValue({ id: null, created: false })

    const result = await recordOwnerNotification(harness.outerExecutor as never, {
      event: 'appointment_cancelled',
      entityType: 'appointment',
      entityId,
      title: 'Afspraak geannuleerd',
      body: 'Een afspraak is geannuleerd.',
    })

    expect(result.eventCreated).toBe(false)
    expect(result.notificationCreated).toBe(false)
    expect(repositoryMocks.insertOwnerNotification).not.toHaveBeenCalled()
  })

  it('creates no notification when there is no active owner', async () => {
    repositoryMocks.findActiveOwnerId.mockResolvedValue(null)

    const result = await recordOwnerNotification(harness.outerExecutor as never, {
      event: 'queue_joined',
      entityType: 'queue_entry',
      entityId,
      title: 'Titel',
      body: 'Tekst',
    })

    expect(result.eventCreated).toBe(false)
    expect(repositoryMocks.insertOwnerNotificationEvent).not.toHaveBeenCalled()
    expect(repositoryMocks.insertOwnerNotification).not.toHaveBeenCalled()
  })

  it('uses the matching event and entity type per business event', async () => {
    await recordQueueJoinedNotification(harness.outerExecutor as never, { id: entityId, customerUserId: null, guestName: 'Jan Jansen' })
    expect(repositoryMocks.insertOwnerNotificationEvent).toHaveBeenLastCalledWith(
      harness.outerExecutor,
      expect.objectContaining({ event: 'queue_joined', entityType: 'queue_entry', entityId }),
    )
    expect(repositoryMocks.insertOwnerNotification).toHaveBeenLastCalledWith(
      harness.savepointExecutor,
      expect.objectContaining({ body: 'Jan Jansen is toegevoegd aan de wachtrij.' }),
    )

    await recordQueueLeftNotification(harness.outerExecutor as never, { id: entityId, customerUserId: null, guestName: 'Jan Jansen' })
    expect(repositoryMocks.insertOwnerNotificationEvent).toHaveBeenLastCalledWith(
      harness.outerExecutor,
      expect.objectContaining({ event: 'queue_left', entityType: 'queue_entry', entityId }),
    )

    await recordAppointmentBookedNotification(harness.outerExecutor as never, { id: entityId, customerUserId: null, guestName: null })
    expect(repositoryMocks.insertOwnerNotificationEvent).toHaveBeenLastCalledWith(
      harness.outerExecutor,
      expect.objectContaining({ event: 'appointment_booked', entityType: 'appointment', entityId }),
    )
    expect(repositoryMocks.insertOwnerNotification).toHaveBeenLastCalledWith(
      harness.savepointExecutor,
      expect.objectContaining({ body: 'Er is een nieuwe afspraak geboekt.' }),
    )

    await recordAppointmentCancelledNotification(harness.outerExecutor as never, { id: entityId, customerUserId: null, guestName: null })
    expect(repositoryMocks.insertOwnerNotificationEvent).toHaveBeenLastCalledWith(
      harness.outerExecutor,
      expect.objectContaining({ event: 'appointment_cancelled', entityType: 'appointment', entityId }),
    )
  })

  it('repairs a durably recorded event that never reached the bell', async () => {
    repositoryMocks.listPendingOwnerNotificationEvents.mockResolvedValue([
      {
        id: 'event-id',
        event: 'queue_joined',
        entityType: 'queue_entry',
        entityId,
        recipientUserId: ownerId,
        createdAt: new Date('2026-10-21T10:00:00.000Z'),
      },
    ])

    const repaired = await repairMissingOwnerNotifications(new Date('2026-10-21T12:00:00.000Z'))

    expect(repaired).toBe(1)
    expect(repositoryMocks.listPendingOwnerNotificationEvents).toHaveBeenCalledWith(
      harness.outerExecutor,
      new Date('2026-09-21T12:00:00.000Z'),
      50,
    )
    expect(repositoryMocks.insertOwnerNotification).toHaveBeenCalledWith(
      harness.savepointExecutor,
      expect.objectContaining({
        eventId: 'event-id',
        recipientUserId: ownerId,
        body: 'Jan Jansen is toegevoegd aan de wachtrij.',
      }),
    )
  })

  it('repairs an appointment event with the customer name of the appointment', async () => {
    repositoryMocks.listPendingOwnerNotificationEvents.mockResolvedValue([
      {
        id: 'event-id',
        event: 'appointment_cancelled',
        entityType: 'appointment',
        entityId,
        recipientUserId: ownerId,
        createdAt: new Date('2026-10-21T10:00:00.000Z'),
      },
    ])
    repositoryMocks.findAppointmentIdentity.mockResolvedValue({ customerUserId: null, guestName: 'Jan Jansen' })

    const repaired = await repairMissingOwnerNotifications(new Date('2026-10-21T12:00:00.000Z'))

    expect(repaired).toBe(1)
    expect(repositoryMocks.insertOwnerNotification).toHaveBeenCalledWith(
      harness.savepointExecutor,
      expect.objectContaining({ body: 'De afspraak van Jan Jansen is geannuleerd.' }),
    )
  })

  it('keeps a failing repair from blocking the remaining events', async () => {
    repositoryMocks.listPendingOwnerNotificationEvents.mockResolvedValue([
      {
        id: 'event-id',
        event: 'queue_joined',
        entityType: 'queue_entry',
        entityId,
        recipientUserId: ownerId,
        createdAt: new Date('2026-10-21T10:00:00.000Z'),
      },
    ])
    harness.failMaterialization = true

    await expect(repairMissingOwnerNotifications(new Date('2026-10-21T12:00:00.000Z'))).resolves.toBe(0)
  })

  it('scopes every read and mutation to the authenticated owner', async () => {
    repositoryMocks.listOwnerNotifications.mockResolvedValue([
      {
        id: randomUUID(),
        event: 'queue_joined',
        entityType: 'queue_entry',
        entityId,
        title: 'Titel',
        body: 'Tekst',
        readAt: null,
        createdAt: new Date('2026-10-21T10:00:00.000Z'),
      },
    ])

    const items = await listOwnerNotifications(ownerId)
    expect(repositoryMocks.listOwnerNotifications).toHaveBeenCalledWith(expect.anything(), ownerId, 50)
    expect(items[0]?.read).toBe(false)
    expect(items[0]?.event).toBe('queue_joined')

    await getOwnerUnreadCount(ownerId)
    expect(repositoryMocks.countUnreadOwnerNotifications).toHaveBeenCalledWith(expect.anything(), ownerId)

    const notificationId = randomUUID()
    await markOwnerNotificationRead(ownerId, notificationId)
    expect(repositoryMocks.markOwnerNotificationRead).toHaveBeenCalledWith(
      expect.anything(),
      ownerId,
      notificationId,
    )

    await markAllOwnerNotificationsRead(ownerId)
    expect(repositoryMocks.markAllOwnerNotificationsRead).toHaveBeenCalledWith(expect.anything(), ownerId)
  })

  it('removes notifications older than the 30 day retention period', async () => {
    const now = new Date('2026-10-21T12:00:00.000Z')

    await cleanupExpiredOwnerNotifications(now)

    expect(OWNER_NOTIFICATION_RETENTION_DAYS).toBe(30)
    expect(repositoryMocks.deleteExpiredOwnerNotifications).toHaveBeenCalledWith(
      expect.anything(),
      new Date('2026-09-21T12:00:00.000Z'),
    )
  })
})
