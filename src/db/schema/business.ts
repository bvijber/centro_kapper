import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
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

export const bookingSettings = pgTable(
  'booking_settings',
  {
    id: integer('id').primaryKey().default(1),
    bufferMinutes: integer('buffer_minutes').default(0).notNull(),
    cancellationDeadlineMinutes: integer('cancellation_deadline_minutes').default(1440).notNull(),
    overlapBehavior: text('overlap_behavior').default('block').notNull(),
    confirmationBehavior: text('confirmation_behavior').default('manual').notNull(),
    noShowReleaseBehavior: text('no_show_release_behavior').default('manual').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    singletonCheck: check('booking_settings_singleton_check', sql`${table.id} = 1`),
    bufferCheck: check('booking_settings_buffer_check', sql`${table.bufferMinutes} >= 0`),
    cancellationCheck: check(
      'booking_settings_cancellation_check',
      sql`${table.cancellationDeadlineMinutes} >= 0`,
    ),
    overlapCheck: check(
      'booking_settings_overlap_check',
      sql`${table.overlapBehavior} IN ('block', 'allow_with_warning')`,
    ),
    confirmationCheck: check(
      'booking_settings_confirmation_check',
      sql`${table.confirmationBehavior} IN ('manual')`,
    ),
    noShowCheck: check(
      'booking_settings_no_show_check',
      sql`${table.noShowReleaseBehavior} IN ('automatic', 'manual')`,
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

export const wholeDayBlocks = pgTable(
  'whole_day_blocks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    blockDate: date('block_date').notNull(),
    note: text('note'),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    activeDateUnique: uniqueIndex('whole_day_blocks_active_date_unique')
      .on(table.blockDate)
      .where(sql`${table.active} = true`),
    blockDateIndex: index('whole_day_blocks_block_date_idx').on(table.blockDate),
  }),
)

export const openingHoursRelations = relations(openingHours, () => ({}))
