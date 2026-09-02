import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const rateLimits = pgTable(
  'rate_limits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: text('key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    keyWindowUnique: uniqueIndex('rate_limits_key_window_unique').on(table.key, table.windowStart),
    windowIndex: index('rate_limits_window_start_idx').on(table.windowStart),
  }),
)
