import { relations, sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { appointmentStatusEnum } from './enums'
import { services } from './services'
import { users } from './users'
import { cancellationRequests } from './cancellation-requests'

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerUserId: uuid('customer_user_id').references(() => users.id, { onDelete: 'set null' }),
    guestName: text('guest_name'),
    guestPhone: text('guest_phone'),
    guestEmail: text('guest_email'),
    barberUserId: uuid('barber_user_id').references(() => users.id, { onDelete: 'set null' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    serviceNameAtBooking: text('service_name_snapshot').notNull(),
    servicePriceCentsAtBooking: integer('price_cents_snapshot').notNull(),
    serviceDurationMinutesAtBooking: integer('duration_minutes_snapshot').notNull(),
    bufferMinutesAtBooking: integer('buffer_minutes_at_booking').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: appointmentStatusEnum('status').notNull().default('new'),
    note: text('note'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    slotReleasedAt: timestamp('slot_released_at', { withTimezone: true }),
    overrideOpeningHours: boolean('override_opening_hours').notNull().default(false),
    overrideBreak: boolean('override_break').notNull().default(false),
    overrideWholeDayBlock: boolean('override_whole_day_block').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    startsStatusIndex: index('appointments_starts_at_status_idx').on(table.startsAt, table.status),
    serviceStartsIndex: index('appointments_service_id_starts_at_idx').on(table.serviceId, table.startsAt),
    customerStartsIndex: index('appointments_customer_user_id_starts_at_idx').on(table.customerUserId, table.startsAt),
    endsAtIndex: index('appointments_ends_at_idx').on(table.endsAt),
    priceCheck: check('appointments_price_cents_snapshot_check', sql`${table.servicePriceCentsAtBooking} >= 0`),
    durationCheck: check('appointments_duration_minutes_snapshot_check', sql`${table.serviceDurationMinutesAtBooking} > 0`),
    bufferCheck: check('appointments_buffer_minutes_at_booking_check', sql`${table.bufferMinutesAtBooking} >= 0`),
    rangeCheck: check('appointments_time_range_check', sql`${table.startsAt} < ${table.endsAt}`),
    partyCheck: check(
      'appointments_party_check',
      sql`(${table.customerUserId} IS NOT NULL AND ${table.guestName} IS NULL AND ${table.guestPhone} IS NULL AND ${table.guestEmail} IS NULL) OR (${table.customerUserId} IS NULL AND ${table.guestName} IS NOT NULL AND ${table.guestPhone} IS NOT NULL)`,
    ),
    slotReleaseCheck: check(
      'appointments_slot_release_check',
      sql`${table.slotReleasedAt} IS NULL OR ${table.status} = 'no_show'`,
    ),
  }),
)

// Overlap prevention is enforced by the appointment service transaction and its
// per-barber PostgreSQL advisory lock; these indexes support the overlap query.

export const appointmentsRelations = relations(appointments, ({ one, many }) => ({
  customer: one(users, { fields: [appointments.customerUserId], references: [users.id], relationName: 'customerAppointments' }),
  barber: one(users, { fields: [appointments.barberUserId], references: [users.id], relationName: 'barberAppointments' }),
  creator: one(users, { fields: [appointments.createdByUserId], references: [users.id], relationName: 'createdAppointments' }),
  service: one(services, { fields: [appointments.serviceId], references: [services.id] }),
  cancellationRequests: many(cancellationRequests),
}))
