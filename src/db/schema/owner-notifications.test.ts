import { describe, expect, it } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  ownerNotificationEvents,
  ownerNotifications,
} from './owner-notifications'

function columnNames(table: Parameters<typeof getTableConfig>[0]): (string | undefined)[] {
  return getTableConfig(table).columns.map((column) => column.name)
}

function indexNames(table: Parameters<typeof getTableConfig>[0]): (string | undefined)[] {
  return getTableConfig(table).indexes.map((index) => index.config.name)
}

function foreignKeys(table: Parameters<typeof getTableConfig>[0]): Array<{ table: unknown; onDelete: unknown }> {
  return getTableConfig(table).foreignKeys.map((key) => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table: (key.reference() as any).foreignTable[Symbol.for('drizzle:Name')] as unknown,
    onDelete: key.onDelete as unknown,
  }))
}

describe('owner notification schema', () => {
  it('defines the durable event register with a unique dedup key', () => {
    const config = getTableConfig(ownerNotificationEvents)
    expect(config.name).toBe('owner_notification_events')

    for (const column of ['id', 'dedup_key', 'event', 'recipient_user_id', 'entity_type', 'entity_id', 'created_at']) {
      expect(columnNames(ownerNotificationEvents)).toContain(column)
    }

    expect(indexNames(ownerNotificationEvents)).toContain('owner_notification_events_dedup_key_unique')
    expect(foreignKeys(ownerNotificationEvents)).toContainEqual({ table: 'users', onDelete: 'cascade' })
  })

  it('defines the bell read model with read state and one notification per event', () => {
    const config = getTableConfig(ownerNotifications)
    expect(config.name).toBe('owner_notifications')

    for (const column of ['id', 'event_id', 'recipient_user_id', 'title', 'body', 'read_at', 'created_at', 'updated_at']) {
      expect(columnNames(ownerNotifications)).toContain(column)
    }

    expect(indexNames(ownerNotifications)).toContain('owner_notifications_event_unique')
    expect(indexNames(ownerNotifications)).toContain('owner_notifications_recipient_read_created_idx')
    expect(indexNames(ownerNotifications)).toContain('owner_notifications_created_at_idx')
    expect(foreignKeys(ownerNotifications)).toContainEqual({ table: 'users', onDelete: 'cascade' })
    expect(foreignKeys(ownerNotifications)).toContainEqual({
      table: 'owner_notification_events',
      onDelete: 'cascade',
    })
  })

  it('stores no payload, capability or push secret in the owner notification tables', () => {
    const columns = [
      ...columnNames(ownerNotificationEvents),
      ...columnNames(ownerNotifications),
    ]
    for (const forbidden of ['payload', 'guest_phone', 'guest_email', 'capability', 'private_key', 'vapid', 'password', 'token', 'session']) {
      expect(columns).not.toContain(forbidden)
    }
  })
})
