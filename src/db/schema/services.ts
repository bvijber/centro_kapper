import { relations, sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const services = pgTable(
  'services',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    priceCents: integer('price_cents').notNull(),
    active: boolean('active').default(true).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    activeIndex: index('services_active_idx').on(table.active, table.archivedAt),
    priceCheck: check('services_price_cents_check', sql`${table.priceCents} >= 0`),
    durationCheck: check('services_duration_minutes_check', sql`${table.durationMinutes} > 0`),
    archiveStateCheck: check(
      'services_archive_state_check',
      sql`${table.archivedAt} IS NULL OR ${table.active} = false`,
    ),
  }),
)

export const servicesRelations = relations(services, () => ({}))
