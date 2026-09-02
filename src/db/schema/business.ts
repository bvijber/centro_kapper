import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const businessProfile = pgTable(
  'business_profile',
  {
    id: integer('id').primaryKey().default(1),
    name: text('name').notNull(),
    address: text('address').notNull(),
    phone: text('phone').notNull(),
    timezone: text('timezone').notNull().default('Europe/Amsterdam'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    singletonCheck: check('business_profile_singleton_check', sql`${table.id} = 1`),
    timezoneCheck: check(
      'business_profile_timezone_check',
      sql`${table.timezone} = 'Europe/Amsterdam'`,
    ),
  }),
)

export const openingHours = pgTable(
  'opening_hours',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    weekday: smallint('weekday').notNull(),
    isOpen: boolean('is_open').default(false).notNull(),
    openingTime: time('opening_time'),
    closingTime: time('closing_time'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    weekdayUnique: uniqueIndex('opening_hours_weekday_unique').on(table.weekday),
    weekdayCheck: check(
      'opening_hours_weekday_check',
      sql`${table.weekday} BETWEEN 0 AND 6`,
    ),
    timesCheck: check(
      'opening_hours_times_check',
      sql`(${table.isOpen} = false) OR (${table.openingTime} IS NOT NULL AND ${table.closingTime} IS NOT NULL AND ${table.openingTime} < ${table.closingTime})`,
    ),
  }),
)

export const breakPeriods = pgTable(
  'break_periods',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    note: text('note'),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    startsAtIndex: index('break_periods_starts_at_idx').on(table.startsAt),
    rangeCheck: check('break_periods_range_check', sql`${table.startsAt} < ${table.endsAt}`),
  }),
)

export const openingHoursRelations = relations(openingHours, () => ({}))
