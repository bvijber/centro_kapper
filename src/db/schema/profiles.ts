import { relations } from 'drizzle-orm'
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { users } from './users'

export const customerProfiles = pgTable('customer_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  phone: text('phone').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const ownerProfiles = pgTable('owner_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  phone: text('phone').notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const customerProfilesRelations = relations(customerProfiles, ({ one }) => ({
  user: one(users, { fields: [customerProfiles.userId], references: [users.id] }),
}))

export const ownerProfilesRelations = relations(ownerProfiles, ({ one }) => ({
  user: one(users, { fields: [ownerProfiles.userId], references: [users.id] }),
}))
