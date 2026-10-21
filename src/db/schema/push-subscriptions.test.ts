import { describe, expect, it } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  pushNotificationDeliveries,
  pushNotifications,
  pushSubscriptions,
} from './push-subscriptions'

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

describe('push subscription schema', () => {
  it('defines the push_subscriptions table with entry link and unique endpoint', () => {
    const config = getTableConfig(pushSubscriptions)
    expect(config.name).toBe('push_subscriptions')

    for (const column of ['id', 'queue_entry_id', 'customer_user_id', 'endpoint', 'p256dh_key', 'auth_key', 'active', 'deactivated_at', 'deactivate_reason', 'created_at', 'updated_at']) {
      expect(columnNames(pushSubscriptions)).toContain(column)
    }

    expect(indexNames(pushSubscriptions)).toContain('push_subscriptions_endpoint_unique')
    expect(foreignKeys(pushSubscriptions)).toContainEqual({ table: 'waiting_list_entries', onDelete: 'cascade' })
    expect(foreignKeys(pushSubscriptions)).toContainEqual({ table: 'users', onDelete: 'set null' })
  })

  it('defines the push_notifications table with a unique idempotency key', () => {
    const config = getTableConfig(pushNotifications)
    expect(config.name).toBe('push_notifications')

    for (const column of ['id', 'queue_entry_id', 'event', 'idempotency_key', 'status', 'created_at', 'updated_at']) {
      expect(columnNames(pushNotifications)).toContain(column)
    }

    expect(indexNames(pushNotifications)).toContain('push_notifications_idempotency_unique')
    expect(foreignKeys(pushNotifications)).toContainEqual({ table: 'waiting_list_entries', onDelete: 'cascade' })
  })

  it('defines deliveries with a bounded attempt counter and claim metadata', () => {
    const config = getTableConfig(pushNotificationDeliveries)
    expect(config.name).toBe('push_notification_deliveries')

    for (const column of ['id', 'notification_id', 'subscription_id', 'status', 'attempts', 'next_attempt_at', 'last_error_category', 'claim_token', 'claimed_at', 'created_at', 'updated_at']) {
      expect(columnNames(pushNotificationDeliveries)).toContain(column)
    }

    expect(indexNames(pushNotificationDeliveries)).toContain('push_notification_deliveries_notification_subscription_unique')
    expect(indexNames(pushNotificationDeliveries)).toContain('push_notification_deliveries_status_next_attempt_idx')
  })

  it('stores no payload, personal data, capabilities or VAPID secrets in the push tables', () => {
    // Bewust toegestaan en uitsluitend server-side: p256dh_key en auth_key
    // zijn het noodzakelijke Web Push-sleutelmateriaal voor verzending.
    const columns = [
      ...columnNames(pushSubscriptions),
      ...columnNames(pushNotifications),
      ...columnNames(pushNotificationDeliveries),
    ]
    for (const forbidden of ['payload', 'guest_name', 'guest_phone', 'guest_email', 'capability', 'private_key', 'vapid', 'password', 'token', 'session']) {
      expect(columns).not.toContain(forbidden)
    }
  })
})
