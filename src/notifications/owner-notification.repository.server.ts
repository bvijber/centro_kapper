import { and, asc, count, desc, eq, gte, isNull, lt } from 'drizzle-orm'

import type { Database } from '../db/client.server'
import { appointments } from '../db/schema/appointments'
import { ownerNotificationEvents, ownerNotifications } from '../db/schema/owner-notifications'
import { customerProfiles, ownerProfiles } from '../db/schema/profiles'
import { users } from '../db/schema/users'
import { waitingListEntries } from '../db/schema/waiting-list'

export type OwnerNotificationExecutor =
  | Database
  | Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * Een lopende transactie. Binnen zo'n transactie is `transaction()` een
 * savepoint: een fout daarbinnen rolt alleen de savepoint terug en niet de
 * omhullende transactie.
 */
export type OwnerNotificationTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export type OwnerNotificationRow = {
  id: string
  event: string
  entityType: string
  entityId: string | null
  title: string
  body: string
  readAt: Date | null
  createdAt: Date
}

export type OwnerNotificationEventRow = {
  id: string
  event: string
  entityType: string
  entityId: string | null
  recipientUserId: string
  createdAt: Date
}

export type OwnerNotificationWatchState = {
  latestId: string | null
  unread: number
}

/**
 * De applicatie kent precies één actieve eigenaar. De ontvanger van een
 * interne melding wordt daarom server-side opgelost; een client kan nooit
 * zelf een ontvanger kiezen.
 */
export async function findActiveOwnerId(
  executor: OwnerNotificationExecutor,
): Promise<string | null> {
  const [owner] = await executor
    .select({ id: users.id })
    .from(users)
    .innerJoin(ownerProfiles, eq(ownerProfiles.userId, users.id))
    .where(eq(ownerProfiles.active, true))
    .orderBy(users.id)
    .limit(1)
  return owner?.id ?? null
}

/**
 * Registreert een gebeurtenis in het duurzame gebeurtenisregister. Geeft
 * `created: false` terug wanneer de gebeurtenis al eerder is geregistreerd;
 * dat is de idempotentiegrens die herhaalde verwerking tegenhoudt.
 */
export async function insertOwnerNotificationEvent(
  executor: OwnerNotificationExecutor,
  values: {
    dedupKey: string
    event: string
    recipientUserId: string
    entityType: string
    entityId: string | null
  },
): Promise<{ id: string | null; created: boolean }> {
  const [row] = await executor
    .insert(ownerNotificationEvents)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: ownerNotificationEvents.id })
  if (!row) return { id: null, created: false }
  return { id: row.id, created: true }
}

export async function insertOwnerNotification(
  executor: OwnerNotificationExecutor,
  values: {
    eventId: string
    recipientUserId: string
    title: string
    body: string
  },
): Promise<{ id: string } | null> {
  const [row] = await executor
    .insert(ownerNotifications)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: ownerNotifications.id })
  return row ?? null
}

export async function listOwnerNotifications(
  executor: OwnerNotificationExecutor,
  ownerUserId: string,
  limit: number,
): Promise<OwnerNotificationRow[]> {
  return executor
    .select({
      id: ownerNotifications.id,
      event: ownerNotificationEvents.event,
      entityType: ownerNotificationEvents.entityType,
      entityId: ownerNotificationEvents.entityId,
      title: ownerNotifications.title,
      body: ownerNotifications.body,
      readAt: ownerNotifications.readAt,
      createdAt: ownerNotifications.createdAt,
    })
    .from(ownerNotifications)
    .innerJoin(ownerNotificationEvents, eq(ownerNotificationEvents.id, ownerNotifications.eventId))
    .where(eq(ownerNotifications.recipientUserId, ownerUserId))
    .orderBy(desc(ownerNotifications.createdAt), desc(ownerNotifications.id))
    .limit(limit)
}

export async function countUnreadOwnerNotifications(
  executor: OwnerNotificationExecutor,
  ownerUserId: string,
): Promise<number> {
  const [row] = await executor
    .select({ value: count() })
    .from(ownerNotifications)
    .where(
      and(
        eq(ownerNotifications.recipientUserId, ownerUserId),
        isNull(ownerNotifications.readAt),
      ),
    )
  return Number(row?.value ?? 0)
}

/**
 * Compacte toestand voor de SSE-stroom: de identiteit van de nieuwste melding
 * en het aantal ongelezen meldingen. De stroom gebruikt dit alleen als signaal
 * dat er iets nieuws is; de meldingen zelf worden via de beveiligde Server
 * Functions opgehaald.
 */
export async function watchOwnerNotifications(
  executor: OwnerNotificationExecutor,
  ownerUserId: string,
): Promise<OwnerNotificationWatchState> {
  const [latest] = await executor
    .select({ id: ownerNotifications.id })
    .from(ownerNotifications)
    .where(eq(ownerNotifications.recipientUserId, ownerUserId))
    .orderBy(desc(ownerNotifications.createdAt), desc(ownerNotifications.id))
    .limit(1)
  const unread = await countUnreadOwnerNotifications(executor, ownerUserId)
  return { latestId: latest?.id ?? null, unread }
}

/**
 * Markeert één melding als gelezen. De ontvanger zit in de WHERE-clausule, zodat
 * een melding van een andere eigenaar nooit via deze functie wordt geraakt.
 */
export async function markOwnerNotificationRead(
  executor: OwnerNotificationExecutor,
  ownerUserId: string,
  notificationId: string,
): Promise<boolean> {
  const [row] = await executor
    .update(ownerNotifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(ownerNotifications.id, notificationId),
        eq(ownerNotifications.recipientUserId, ownerUserId),
        isNull(ownerNotifications.readAt),
      ),
    )
    .returning({ id: ownerNotifications.id })
  return row !== undefined
}

export async function markAllOwnerNotificationsRead(
  executor: OwnerNotificationExecutor,
  ownerUserId: string,
): Promise<number> {
  const rows = await executor
    .update(ownerNotifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(ownerNotifications.recipientUserId, ownerUserId),
        isNull(ownerNotifications.readAt),
      ),
    )
    .returning({ id: ownerNotifications.id })
  return rows.length
}

/**
 * Verwijdert meldingen die ouder zijn dan de bewaartermijn. Het duurzame
 * gebeurtenisregister blijft bestaan, zodat een herhaalde verwerking van dezelfde
 * gebeurtenis ook na opruiming geen tweede melding kan opleveren.
 */
export async function deleteExpiredOwnerNotifications(
  executor: OwnerNotificationExecutor,
  cutoff: Date,
): Promise<number> {
  const rows = await executor
    .delete(ownerNotifications)
    .where(lt(ownerNotifications.createdAt, cutoff))
    .returning({ id: ownerNotifications.id })
  return rows.length
}

/**
 * Zoekt geregistreerde gebeurtenissen die nog geen melding in de bell hebben.
 * Deze zijn het herstelpad voor een mislukte materialisatie.
 */
export async function listPendingOwnerNotificationEvents(
  executor: OwnerNotificationExecutor,
  cutoff: Date,
  limit: number,
): Promise<OwnerNotificationEventRow[]> {
  return executor
    .select({
      id: ownerNotificationEvents.id,
      event: ownerNotificationEvents.event,
      entityType: ownerNotificationEvents.entityType,
      entityId: ownerNotificationEvents.entityId,
      recipientUserId: ownerNotificationEvents.recipientUserId,
      createdAt: ownerNotificationEvents.createdAt,
    })
    .from(ownerNotificationEvents)
    .leftJoin(ownerNotifications, eq(ownerNotifications.eventId, ownerNotificationEvents.id))
    .where(
      and(
        gte(ownerNotificationEvents.createdAt, cutoff),
        isNull(ownerNotifications.id),
      ),
    )
    .orderBy(asc(ownerNotificationEvents.createdAt))
    .limit(limit)
}

/** Identiteit van een wachtrij-entry, voor de hersteltekst. */
export async function findQueueEntryIdentity(
  executor: OwnerNotificationExecutor,
  entityId: string,
): Promise<{ customerUserId: string | null; guestName: string | null } | null> {
  const [entry] = await executor
    .select({
      customerUserId: waitingListEntries.customerUserId,
      guestName: waitingListEntries.guestName,
    })
    .from(waitingListEntries)
    .where(eq(waitingListEntries.id, entityId))
    .limit(1)
  return entry ?? null
}

/** Identiteit van een afspraak, voor de hersteltekst. */
export async function findAppointmentIdentity(
  executor: OwnerNotificationExecutor,
  entityId: string,
): Promise<{ customerUserId: string | null; guestName: string | null } | null> {
  const [appointment] = await executor
    .select({
      customerUserId: appointments.customerUserId,
      guestName: appointments.guestName,
    })
    .from(appointments)
    .where(eq(appointments.id, entityId))
    .limit(1)
  return appointment ?? null
}

/** Naam van een ingelogde klant, voor de hersteltekst. */
export async function findCustomerProfileName(
  executor: OwnerNotificationExecutor,
  customerUserId: string,
): Promise<string | null> {
  const [profile] = await executor
    .select({ fullName: customerProfiles.fullName })
    .from(customerProfiles)
    .where(eq(customerProfiles.userId, customerUserId))
    .limit(1)
  return profile?.fullName ?? null
}
