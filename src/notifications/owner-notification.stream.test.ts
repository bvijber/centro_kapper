import { describe, expect, it } from 'vitest'

import {
  OWNER_NOTIFICATION_STREAM_RETRY_BASE_MS,
  OWNER_NOTIFICATION_STREAM_RETRY_MAX_MS,
  OWNER_NOTIFICATION_STREAM_WATCHDOG_MS,
  isStreamStale,
  mergeOwnerNotifications,
  nextStreamRetryDelayMs,
} from './owner-notification.stream'

function notification(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    event: 'queue_joined' as const,
    entityType: 'queue_entry' as const,
    entityId: null,
    title: 'Nieuwe wachtrij-inschrijving',
    body: 'Jan Jansen is toegevoegd aan de wachtrij.',
    read: false,
    createdAt: new Date('2026-10-21T10:00:00.000Z'),
    ...overrides,
  }
}

describe('owner notification stream helpers', () => {
  it('doubles the reconnect delay up to a maximum', () => {
    expect(nextStreamRetryDelayMs(0)).toBe(OWNER_NOTIFICATION_STREAM_RETRY_BASE_MS)
    expect(nextStreamRetryDelayMs(1)).toBe(OWNER_NOTIFICATION_STREAM_RETRY_BASE_MS * 2)
    expect(nextStreamRetryDelayMs(2)).toBe(OWNER_NOTIFICATION_STREAM_RETRY_BASE_MS * 4)
    expect(nextStreamRetryDelayMs(20)).toBe(OWNER_NOTIFICATION_STREAM_RETRY_MAX_MS)
  })

  it('marks a silent stream as stale after the watchdog period', () => {
    const now = 1_000_000
    expect(isStreamStale(now, now)).toBe(false)
    expect(isStreamStale(now - 1_000, now)).toBe(false)
    expect(isStreamStale(now - OWNER_NOTIFICATION_STREAM_WATCHDOG_MS - 1, now)).toBe(true)
  })

  it('never produces duplicate items for repeated updates', () => {
    const first = notification('a')
    const second = notification('b')

    expect(mergeOwnerNotifications([first, second])).toHaveLength(2)
    // Dezelfde melding komt tweemaal binnen (bijvoorbeeld na een reconnect).
    expect(mergeOwnerNotifications([first, second, first])).toHaveLength(2)
    expect(mergeOwnerNotifications([first, first, first]).map((item) => item.id)).toEqual(['a'])
  })

  it('keeps the last known state for an item that is sent twice', () => {
    const updated = notification('a', { read: true })
    const merged = mergeOwnerNotifications([notification('a'), updated])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.read).toBe(true)
  })
})
