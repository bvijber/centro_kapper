import { db } from '../db/client.server'
import {
  ownerNotificationDedupKey,
  type OwnerNotificationEntityType,
  type OwnerNotificationEvent,
} from './owner-notification.events'
import {
  appointmentBookedNotificationText,
  appointmentCancelledNotificationText,
  queueJoinedNotificationText,
  queueLeftNotificationText,
} from './owner-notification.presentation'
import {
  countUnreadOwnerNotifications,
  deleteExpiredOwnerNotifications,
  findActiveOwnerId,
  findAppointmentIdentity,
  findCustomerProfileName,
  findQueueEntryIdentity,
  insertOwnerNotification,
  insertOwnerNotificationEvent,
  listOwnerNotifications as listOwnerNotificationRows,
  listPendingOwnerNotificationEvents,
  markAllOwnerNotificationsRead as markAllOwnerNotificationRows,
  markOwnerNotificationRead as markOwnerNotificationReadRow,
  watchOwnerNotifications,
  type OwnerNotificationExecutor,
  type OwnerNotificationTransaction,
  type OwnerNotificationWatchState,
} from './owner-notification.repository.server'

/**
 * Bewaartermijn van interne eigenaar-notificaties: 30 dagen, ongeacht of een
 * melding gelezen is (BUSINESS_RULES.md §29). De termijn is vast en er bestaat
 * geen instelling voor onbeperkte bewaring.
 */
export const OWNER_NOTIFICATION_RETENTION_DAYS = 30
export const OWNER_NOTIFICATION_RETENTION_MS =
  OWNER_NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000

export const OWNER_NOTIFICATION_LIST_LIMIT = 50
export const OWNER_NOTIFICATION_REPAIR_LIMIT = 50

export type OwnerNotificationDTO = {
  id: string
  event: OwnerNotificationEvent
  entityType: OwnerNotificationEntityType
  entityId: string | null
  title: string
  body: string
  read: boolean
  createdAt: Date
}

export type RecordOwnerNotificationInput = {
  event: OwnerNotificationEvent
  entityType: OwnerNotificationEntityType
  entityId: string
  title: string
  body: string
}

export type RecordOwnerNotificationResult = {
  /** Het duurzame gebeurtenis is nieuw geregistreerd. */
  eventCreated: boolean
  /** De melding staat nu in de bel. */
  notificationCreated: boolean
  notificationId: string | null
}

function toDTO(row: {
  id: string
  event: string
  entityType: string
  entityId: string | null
  title: string
  body: string
  readAt: Date | null
  createdAt: Date
}): OwnerNotificationDTO {
  return {
    id: row.id,
    event: row.event as OwnerNotificationEvent,
    entityType: row.entityType as OwnerNotificationEntityType,
    entityId: row.entityId,
    title: row.title,
    body: row.body,
    read: row.readAt !== null,
    createdAt: row.createdAt,
  }
}

/**
 * Maakt de melding aan in de bell.
 *
 * De insert draait binnen een savepoint van de lopende transactie. Een fout
 * in de meldingsopslag raakt daardoor alleen de savepoint en niet de
 * omhullende transactie: de kernactie blijft slagen. Het duurzame
 * gebeurtenisrecord dat in de omhullende transactie is vastgelegd blijft
 * bestaan, zodat de melding later alsnog kan worden hersteld.
 */
async function materializeOwnerNotificationSafely(
  transaction: OwnerNotificationTransaction,
  values: { eventId: string; recipientUserId: string; title: string; body: string },
): Promise<boolean> {
  try {
    await transaction.transaction(async (savepoint) => {
      await insertOwnerNotification(savepoint, values)
    })
    return true
  } catch {
    // Het gebeurtenis is duurzaam vastgelegd; de herstelpas maakt de melding
    // alsnog aan. De kernactie hoeft daar niet op te wachten.
    return false
  }
}

/**
 * Legt een gebeurtenis vast in het duurzame gebeurtenisregister en maakt
 * aansluitend de melding aan.
 *
 * Het gebeurtenisrecord wordt binnen dezelfde transactie als de hoofdactie
 * opgeslagen. Daardoor kan een geslaagde hoofdactie nooit stilzwijgend een
 * gebeurtenis verliezen: valt de registratie weg, dan komt de hoofdactie ook
 * niet tot stand. De gebeurtenis wordt met `ON CONFLICT DO NOTHING`
 * geregistreerd, zodat herhaalde verwerking van dezelfde gebeurtenis geen
 * tweede melding oplevert. Het gebeurtenisregister blijft bestaan nadat de
 * melding na 30 dagen is opgeruimd.
 */
export async function recordOwnerNotification(
  transaction: OwnerNotificationTransaction,
  input: RecordOwnerNotificationInput,
): Promise<RecordOwnerNotificationResult> {
  const recipientUserId = await findActiveOwnerId(transaction)
  if (!recipientUserId) return { eventCreated: false, notificationCreated: false, notificationId: null }

  const dedupKey = ownerNotificationDedupKey(input.event, input.entityId)
  const event = await insertOwnerNotificationEvent(transaction, {
    dedupKey,
    event: input.event,
    recipientUserId,
    entityType: input.entityType,
    entityId: input.entityId,
  })
  if (!event.id) {
    // Het gebeurtenis bestaat al; er komt geen tweede melding.
    return { eventCreated: false, notificationCreated: false, notificationId: null }
  }

  const notificationCreated = await materializeOwnerNotificationSafely(transaction, {
    eventId: event.id,
    recipientUserId,
    title: input.title,
    body: input.body,
  })
  return {
    eventCreated: event.created,
    notificationCreated,
    notificationId: notificationCreated ? event.id : null,
  }
}

/**
 * Haalt de klantnaam op voor de weergavetekst. De naam is niet altijd
 * bekend; in dat geval volstaat een algemene melding.
 */
export async function resolveCustomerName(
  executor: OwnerNotificationExecutor,
  customerUserId: string | null,
  guestName: string | null,
): Promise<string | null> {
  if (guestName && guestName.trim().length > 0) return guestName.trim()
  if (!customerUserId) return null
  return findCustomerProfileName(executor, customerUserId)
}

/**
 * Bepaalt de weergavetekst van een geregistreerd gebeurtenis op basis van de
 * bijbehorende wachtrij-entry of afspraak. Wordt gebruikt om een mislukte
 * materialisatie te herstellen.
 */
async function resolveEventText(
  executor: OwnerNotificationExecutor,
  event: { event: string; entityType: string; entityId: string | null },
): Promise<{ title: string; body: string } | null> {
  if (!event.entityId) return null
  const identity =
    event.entityType === 'queue_entry'
      ? await findQueueEntryIdentity(executor, event.entityId)
      : await findAppointmentIdentity(executor, event.entityId)
  if (!identity) return null
  const name = await resolveCustomerName(executor, identity.customerUserId, identity.guestName)
  switch (event.event) {
    case 'queue_joined':
      return queueJoinedNotificationText(name)
    case 'queue_left':
      return queueLeftNotificationText(name)
    case 'appointment_booked':
      return appointmentBookedNotificationText(name)
    case 'appointment_cancelled':
      return appointmentCancelledNotificationText(name)
    default:
      return null
  }
}

/**
 * Herstelpas: maakt de melding aan voor gebeurtenissen die duurzaam zijn
 * vastgelegd maar nog niet in de bell staan. De herstelactie is idempotent:
 * een tweede run levert geen tweede melding op.
 */
export async function repairMissingOwnerNotifications(
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - OWNER_NOTIFICATION_RETENTION_MS)
  return db.transaction(async (transaction) => {
    const pending = await listPendingOwnerNotificationEvents(
      transaction,
      cutoff,
      OWNER_NOTIFICATION_REPAIR_LIMIT,
    )
    let repaired = 0
    for (const event of pending) {
      const text = await resolveEventText(transaction, event)
      if (!text) continue
      const materialized = await materializeOwnerNotificationSafely(transaction, {
        eventId: event.id,
        recipientUserId: event.recipientUserId,
        title: text.title,
        body: text.body,
      })
      if (materialized) repaired += 1
    }
    return repaired
  })
}

export async function listOwnerNotifications(
  ownerUserId: string,
  limit: number = OWNER_NOTIFICATION_LIST_LIMIT,
): Promise<OwnerNotificationDTO[]> {
  const rows = await listOwnerNotificationRows(db, ownerUserId, limit)
  return rows.map(toDTO)
}

export async function getOwnerUnreadCount(ownerUserId: string): Promise<number> {
  return countUnreadOwnerNotifications(db, ownerUserId)
}

/**
 * Toestand voor de SSE-stroom: het signaal dat er iets nieuws is. De
 * notificatiegegevens zelf worden niet via deze weg bezorgd; de client haalt
 * ze op via de beveiligde Server Functions.
 */
export async function getOwnerNotificationWatchState(
  ownerUserId: string,
): Promise<OwnerNotificationWatchState> {
  return watchOwnerNotifications(db, ownerUserId)
}

export async function markOwnerNotificationRead(
  ownerUserId: string,
  notificationId: string,
): Promise<boolean> {
  return markOwnerNotificationReadRow(db, ownerUserId, notificationId)
}

export async function markAllOwnerNotificationsRead(ownerUserId: string): Promise<number> {
  return markAllOwnerNotificationRows(db, ownerUserId)
}

/**
 * Verwijdert meldingen die ouder zijn dan de bewaartermijn. Het duurzame
 * gebeurtenisregister blijft intact, zodat idempotentie behouden blijft.
 */
export async function cleanupExpiredOwnerNotifications(
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - OWNER_NOTIFICATION_RETENTION_MS)
  return deleteExpiredOwnerNotifications(db, cutoff)
}

/** Notificatie op de wachtrij-inschrijving van een klant of gast. */
export async function recordQueueJoinedNotification(
  transaction: OwnerNotificationTransaction,
  entry: { id: string; customerUserId: string | null; guestName: string | null },
): Promise<RecordOwnerNotificationResult> {
  const name = await resolveCustomerName(transaction, entry.customerUserId, entry.guestName)
  const text = queueJoinedNotificationText(name)
  return recordOwnerNotification(transaction, {
    event: 'queue_joined',
    entityType: 'queue_entry',
    entityId: entry.id,
    title: text.title,
    body: text.body,
  })
}

/** Notificatie op het verlaten van de wachtrij door een klant of gast. */
export async function recordQueueLeftNotification(
  transaction: OwnerNotificationTransaction,
  entry: { id: string; customerUserId: string | null; guestName: string | null },
): Promise<RecordOwnerNotificationResult> {
  const name = await resolveCustomerName(transaction, entry.customerUserId, entry.guestName)
  const text = queueLeftNotificationText(name)
  return recordOwnerNotification(transaction, {
    event: 'queue_left',
    entityType: 'queue_entry',
    entityId: entry.id,
    title: text.title,
    body: text.body,
  })
}

/** Notificatie op het aanmaken van een afspraak. */
export async function recordAppointmentBookedNotification(
  transaction: OwnerNotificationTransaction,
  appointment: { id: string; customerUserId: string | null; guestName: string | null },
): Promise<RecordOwnerNotificationResult> {
  const name = await resolveCustomerName(
    transaction,
    appointment.customerUserId,
    appointment.guestName,
  )
  const text = appointmentBookedNotificationText(name)
  return recordOwnerNotification(transaction, {
    event: 'appointment_booked',
    entityType: 'appointment',
    entityId: appointment.id,
    title: text.title,
    body: text.body,
  })
}

/** Notificatie op een daadwerkelijke overgang naar de status `cancelled`. */
export async function recordAppointmentCancelledNotification(
  transaction: OwnerNotificationTransaction,
  appointment: { id: string; customerUserId: string | null; guestName: string | null },
): Promise<RecordOwnerNotificationResult> {
  const name = await resolveCustomerName(
    transaction,
    appointment.customerUserId,
    appointment.guestName,
  )
  const text = appointmentCancelledNotificationText(name)
  return recordOwnerNotification(transaction, {
    event: 'appointment_cancelled',
    entityType: 'appointment',
    entityId: appointment.id,
    title: text.title,
    body: text.body,
  })
}
