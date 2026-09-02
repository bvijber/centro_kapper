import { relations, sql } from 'drizzle-orm'
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { appointmentSourceEnum, appointmentStatusEnum } from './enums'
import { services } from './services'
import { users } from './users'

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerUserId: uuid('customer_user_id').references(() => users.id, { onDelete: 'set null' }),
    guestName: text('guest_name'),
    guestPhone: text('guest_phone'),
    guestEmail: text('guest_email'),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    serviceNameSnapshot: text('service_name_snapshot').notNull(),
    priceCentsSnapshot: integer('price_cents_snapshot').notNull(),
    durationMinutesSnapshot: integer('duration_minutes_snapshot').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: appointmentStatusEnum('status').notNull().default('new'),
    source: appointmentSourceEnum('source').notNull(),
    note: text('note'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    startsStatusIndex: index('appointments_starts_at_status_idx').on(table.startsAt, table.status),
    serviceStartsIndex: index('appointments_service_id_starts_at_idx').on(table.serviceId, table.startsAt),
    customerStartsIndex: index('appointments_customer_user_id_starts_at_idx').on(table.customerUserId, table.startsAt),
    endsAtIndex: index('appointments_ends_at_idx').on(table.endsAt),
    priceCheck: check('appointments_price_cents_snapshot_check', sql`${table.priceCentsSnapshot} >= 0`),
    durationCheck: check('appointments_duration_minutes_snapshot_check', sql`${table.durationMinutesSnapshot} > 0`),
    rangeCheck: check('appointments_time_range_check', sql`${table.startsAt} < ${table.endsAt}`),
    partyCheck: check(
      'appointments_party_check',
      sql`(${table.customerUserId} IS NOT NULL) OR (${table.guestName} IS NOT NULL AND ${table.guestPhone} IS NOT NULL)`,
    ),
  }),
)

// Overlap prevention belongs in the future appointment service: use a transaction
// and a server-side overlap query. The database indexes only support those queries.

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  customer: one(users, { fields: [appointments.customerUserId], references: [users.id], relationName: 'customerAppointments' }),
  creator: one(users, { fields: [appointments.createdByUserId], references: [users.id], relationName: 'createdAppointments' }),
  service: one(services, { fields: [appointments.serviceId], references: [services.id] }),
}))
