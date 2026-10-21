import { relations, sql } from 'drizzle-orm'
import {
  check,
  index,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  pgTable,
} from 'drizzle-orm/pg-core'

import { users } from './users'

/**
 * Interne eigenaar-notificaties (BUSINESS_RULES.md §29).
 *
 * `owner_notification_events` is het duurzame gebeurtenisregister: de
 * `dedup_key` is de primaire identificatie van een gebeurtenis en blijft
 * bestaan nadat de notificatie na 30 dagen is opgeruimd. Daardoor kan een
 * herhaalde verwerking van dezelfde gebeurtenis nooit een tweede notificatie
 * opleveren.
 *
 * `owner_notifications` is de bell-readmodel: gelezenstatus en weergavetekst.
 * Deze rijen worden na 30 dagen verwijderd, ongeacht of ze gelezen zijn.
 */
export const ownerNotificationEvents = pgTable(
  'owner_notification_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dedupKey: text('dedup_key').notNull(),
    event: text('event').notNull(),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    dedupKeyUnique: uniqueIndex('owner_notification_events_dedup_key_unique').on(table.dedupKey),
    recipientIndex: index('owner_notification_events_recipient_idx').on(table.recipientUserId),
    eventCheck: check(
      'owner_notification_events_event_check',
      sql`${table.event} IN ('queue_joined', 'queue_left', 'appointment_booked', 'appointment_cancelled')`,
    ),
    entityTypeCheck: check(
      'owner_notification_events_entity_type_check',
      sql`${table.entityType} IN ('queue_entry', 'appointment')`,
    ),
  }),
)

export const ownerNotifications = pgTable(
  'owner_notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => ownerNotificationEvents.id, { onDelete: 'cascade' }),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    eventUnique: uniqueIndex('owner_notifications_event_unique').on(table.eventId),
    recipientUnreadIndex: index('owner_notifications_recipient_read_created_idx').on(
      table.recipientUserId,
      table.readAt,
      table.createdAt,
    ),
    createdAtIndex: index('owner_notifications_created_at_idx').on(table.createdAt),
  }),
)

export const ownerNotificationEventsRelations = relations(ownerNotificationEvents, ({ one, many }) => ({
  recipient: one(users, { fields: [ownerNotificationEvents.recipientUserId], references: [users.id] }),
  notification: many(ownerNotifications),
}))

export const ownerNotificationsRelations = relations(ownerNotifications, ({ one }) => ({
  event: one(ownerNotificationEvents, {
    fields: [ownerNotifications.eventId],
    references: [ownerNotificationEvents.id],
  }),
  recipient: one(users, { fields: [ownerNotifications.recipientUserId], references: [users.id] }),
}))
