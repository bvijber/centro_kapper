import { relations, sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { appointments } from './appointments'
import { cancellationRequestStatusEnum } from './enums'
import { users } from './users'

export const cancellationRequests = pgTable(
  'cancellation_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'cascade' }),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    status: cancellationRequestStatusEnum('status').notNull().default('pending'),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pendingAppointmentUnique: uniqueIndex('cancellation_requests_pending_appointment_unique')
      .on(table.appointmentId)
      .where(sql`${table.status} = 'pending'`),
    appointmentIndex: index('cancellation_requests_appointment_id_idx').on(table.appointmentId),
    statusIndex: index('cancellation_requests_status_created_at_idx').on(table.status, table.createdAt),
  }),
)

export const cancellationRequestsRelations = relations(cancellationRequests, ({ one }) => ({
  appointment: one(appointments, { fields: [cancellationRequests.appointmentId], references: [appointments.id] }),
  requester: one(users, { fields: [cancellationRequests.requestedByUserId], references: [users.id], relationName: 'requestedCancellations' }),
  reviewer: one(users, { fields: [cancellationRequests.reviewedByUserId], references: [users.id], relationName: 'reviewedCancellations' }),
}))