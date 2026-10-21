import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { users } from './users'
import { waitingListEntries } from './waiting-list'

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    queueEntryId: uuid('queue_entry_id')
      .notNull()
      .references(() => waitingListEntries.id, { onDelete: 'cascade' }),
    customerUserId: uuid('customer_user_id').references(() => users.id, { onDelete: 'set null' }),
    endpoint: text('endpoint').notNull(),
    p256dhKey: text('p256dh_key').notNull(),
    authKey: text('auth_key').notNull(),
    active: boolean('active').default(true).notNull(),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    deactivateReason: text('deactivate_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    endpointUnique: uniqueIndex('push_subscriptions_endpoint_unique').on(table.endpoint),
    entryActiveIndex: index('push_subscriptions_entry_active_idx').on(table.queueEntryId, table.active),
    deactivateReasonCheck: check(
      'push_subscriptions_deactivate_reason_check',
      sql`${table.deactivateReason} IS NULL OR ${table.deactivateReason} IN ('entry_ended', 'opt_out', 'invalid', 'expired', 'replaced')`,
    ),
  }),
)

export const pushNotifications = pgTable(
  'push_notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    queueEntryId: uuid('queue_entry_id')
      .notNull()
      .references(() => waitingListEntries.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idempotencyUnique: uniqueIndex('push_notifications_idempotency_unique').on(table.idempotencyKey),
    statusIndex: index('push_notifications_status_created_at_idx').on(table.status, table.createdAt),
    eventCheck: check(
      'push_notifications_event_check',
      sql`${table.event} IN ('called')`,
    ),
    statusCheck: check(
      'push_notifications_status_check',
      sql`${table.status} IN ('pending', 'sending', 'sent', 'failed', 'expired', 'invalid')`,
    ),
  }),
)

export const pushNotificationDeliveries = pgTable(
  'push_notification_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => pushNotifications.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => pushSubscriptions.id, { onDelete: 'cascade' }),
    status: text('status').default('pending').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    lastErrorCategory: text('last_error_category'),
    claimToken: uuid('claim_token'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    notificationSubscriptionUnique: uniqueIndex('push_notification_deliveries_notification_subscription_unique').on(
      table.notificationId,
      table.subscriptionId,
    ),
    dispatchIndex: index('push_notification_deliveries_status_next_attempt_idx').on(
      table.status,
      table.nextAttemptAt,
    ),
    statusCheck: check(
      'push_notification_deliveries_status_check',
      sql`${table.status} IN ('pending', 'sending', 'sent', 'failed', 'expired', 'invalid')`,
    ),
    attemptsCheck: check(
      'push_notification_deliveries_attempts_check',
      sql`${table.attempts} >= 0 AND ${table.attempts} <= 3`,
    ),
    lastErrorCategoryCheck: check(
      'push_notification_deliveries_last_error_category_check',
      sql`${table.lastErrorCategory} IS NULL OR ${table.lastErrorCategory} IN ('transient', 'permanent', 'invalid', 'config', 'unknown')`,
    ),
  }),
)

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one, many }) => ({
  queueEntry: one(waitingListEntries, {
    fields: [pushSubscriptions.queueEntryId],
    references: [waitingListEntries.id],
  }),
  customer: one(users, {
    fields: [pushSubscriptions.customerUserId],
    references: [users.id],
    relationName: 'pushSubscriptionCustomer',
  }),
  deliveries: many(pushNotificationDeliveries),
}))

export const pushNotificationsRelations = relations(pushNotifications, ({ one, many }) => ({
  queueEntry: one(waitingListEntries, {
    fields: [pushNotifications.queueEntryId],
    references: [waitingListEntries.id],
  }),
  deliveries: many(pushNotificationDeliveries),
}))

export const pushNotificationDeliveriesRelations = relations(pushNotificationDeliveries, ({ one }) => ({
  notification: one(pushNotifications, {
    fields: [pushNotificationDeliveries.notificationId],
    references: [pushNotifications.id],
  }),
  subscription: one(pushSubscriptions, {
    fields: [pushNotificationDeliveries.subscriptionId],
    references: [pushSubscriptions.id],
  }),
}))
