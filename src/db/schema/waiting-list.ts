import { relations, sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid, date } from 'drizzle-orm/pg-core'

import { waitingListStatusEnum } from './enums'
import { services } from './services'
import { users } from './users'

export const waitingListEntries = pgTable(
  'waiting_list_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerUserId: uuid('customer_user_id').references(() => users.id, { onDelete: 'set null' }),
    guestName: text('guest_name'),
    guestPhone: text('guest_phone'),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    queueDate: date('queue_date').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    status: waitingListStatusEnum('status').notNull().default('waiting'),
    note: text('note'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    calledAt: timestamp('called_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectedReason: text('rejected_reason'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    activeCustomerDateUnique: uniqueIndex('waiting_list_active_customer_date_unique')
      .on(table.customerUserId, table.queueDate)
      .where(sql`${table.customerUserId} IS NOT NULL AND ${table.status} IN ('waiting', 'accepted', 'called')`),
    queueOrderIndex: index('waiting_list_queue_date_joined_at_idx').on(table.queueDate, table.joinedAt),
    statusIndex: index('waiting_list_queue_date_status_idx').on(table.queueDate, table.status),
    partyCheck: check(
      'waiting_list_party_check',
      sql`(${table.customerUserId} IS NOT NULL) OR (${table.guestName} IS NOT NULL AND ${table.guestPhone} IS NOT NULL)`,
    ),
  }),
)

export const waitingListEntriesRelations = relations(waitingListEntries, ({ one }) => ({
  customer: one(users, { fields: [waitingListEntries.customerUserId], references: [users.id], relationName: 'customerWaitingEntries' }),
  creator: one(users, { fields: [waitingListEntries.createdByUserId], references: [users.id], relationName: 'createdWaitingEntries' }),
  service: one(services, { fields: [waitingListEntries.serviceId], references: [services.id] }),
}))
