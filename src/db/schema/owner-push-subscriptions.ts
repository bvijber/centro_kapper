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

import { ownerNotificationEvents } from './owner-notifications'
import { users } from './users'

/**
 * Pushabonnementen en verzendregistraties voor de **eigenaar**
 * (BUSINESS_RULES.md §29 "Eigenaarpush").
 *
 * Deze tabellen zijn bewust volledig gescheiden van de klantenpush
 * (`push-subscriptions.ts`): eigen abonnementen, eigen deliveries, eigen
 * retentie en eigen foutafhandeling. Een klantabonnement ontvangt nooit een
 * eigenaarsmelding en een eigenaarabonnement nooit een klantmelding.
 *
 * De pushintentie is het duurzame gebeurtenisregister van de interne
 * eigenaar-notificaties (`owner_notification_events`). Er is daarom geen
 * aparte intent-tabel nodig: de ontdubbeling gebeurt op de unieke
 * combinatie van gebeurtenis en abonnement.
 */
export const ownerPushSubscriptions = pgTable(
  'owner_push_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
    endpointUnique: uniqueIndex('owner_push_subscriptions_endpoint_unique').on(table.endpoint),
    ownerActiveIndex: index('owner_push_subscriptions_owner_active_idx').on(table.ownerUserId, table.active),
    deactivateReasonCheck: check(
      'owner_push_subscriptions_deactivate_reason_check',
      sql`${table.deactivateReason} IS NULL OR ${table.deactivateReason} IN ('opt_out', 'invalid', 'expired', 'replaced')`,
    ),
  }),
)

export const ownerPushDeliveries = pgTable(
  'owner_push_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => ownerNotificationEvents.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => ownerPushSubscriptions.id, { onDelete: 'cascade' }),
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
    eventSubscriptionUnique: uniqueIndex('owner_push_deliveries_event_subscription_unique').on(
      table.eventId,
      table.subscriptionId,
    ),
    dispatchIndex: index('owner_push_deliveries_status_next_attempt_idx').on(
      table.status,
      table.nextAttemptAt,
    ),
    statusCheck: check(
      'owner_push_deliveries_status_check',
      sql`${table.status} IN ('pending', 'sending', 'sent', 'failed', 'expired', 'invalid')`,
    ),
    attemptsCheck: check(
      'owner_push_deliveries_attempts_check',
      sql`${table.attempts} >= 0 AND ${table.attempts} <= 3`,
    ),
    lastErrorCategoryCheck: check(
      'owner_push_deliveries_last_error_category_check',
      sql`${table.lastErrorCategory} IS NULL OR ${table.lastErrorCategory} IN ('transient', 'permanent', 'invalid', 'config', 'unknown')`,
    ),
  }),
)

export const ownerPushSubscriptionsRelations = relations(ownerPushSubscriptions, ({ one, many }) => ({
  owner: one(users, {
    fields: [ownerPushSubscriptions.ownerUserId],
    references: [users.id],
    relationName: 'ownerPushSubscriptionOwner',
  }),
  deliveries: many(ownerPushDeliveries),
}))

export const ownerPushDeliveriesRelations = relations(ownerPushDeliveries, ({ one }) => ({
  event: one(ownerNotificationEvents, {
    fields: [ownerPushDeliveries.eventId],
    references: [ownerNotificationEvents.id],
  }),
  subscription: one(ownerPushSubscriptions, {
    fields: [ownerPushDeliveries.subscriptionId],
    references: [ownerPushSubscriptions.id],
  }),
}))
