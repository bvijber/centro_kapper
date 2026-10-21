import { describe, expect, it } from 'vitest'

import {
  ownerNotificationDedupKey,
  shouldNotifyAppointmentBooked,
  shouldNotifyAppointmentCancelled,
  shouldNotifyQueueJoined,
  shouldNotifyQueueLeft,
} from './owner-notification.events'

describe('owner notification event decisions', () => {
  it('does not notify the owner about a walk-in the owner created', () => {
    expect(shouldNotifyQueueJoined('owner')).toBe(false)
    expect(shouldNotifyQueueJoined('customer')).toBe(true)
    expect(shouldNotifyQueueJoined('guest')).toBe(true)
  })

  it('only notifies when a customer or guest leaves the queue themselves', () => {
    expect(shouldNotifyQueueLeft('owner')).toBe(false)
    expect(shouldNotifyQueueLeft('customer')).toBe(true)
    expect(shouldNotifyQueueLeft('guest')).toBe(true)
  })

  it('notifies for every created appointment, including owner-created ones', () => {
    expect(shouldNotifyAppointmentBooked()).toBe(true)
  })

  it('only notifies on a real transition towards cancelled', () => {
    expect(shouldNotifyAppointmentCancelled('new', 'cancelled')).toBe(true)
    expect(shouldNotifyAppointmentCancelled('confirmed', 'cancelled')).toBe(true)
    expect(shouldNotifyAppointmentCancelled('cancelled', 'cancelled')).toBe(false)
    expect(shouldNotifyAppointmentCancelled('new', 'confirmed')).toBe(false)
    expect(shouldNotifyAppointmentCancelled('new', 'no_show')).toBe(false)
    expect(shouldNotifyAppointmentCancelled('in_progress', 'completed')).toBe(false)
  })

  it('derives stable dedup keys from the event and the entity identity', () => {
    const entityId = '11111111-1111-1111-1111-111111111111'
    expect(ownerNotificationDedupKey('appointment_cancelled', entityId)).toBe(
      `appointment_cancelled:${entityId}`,
    )
    // Dezelfde gebeurtenis levert altijd dezelfde sleutel, ook wanneer de
    // eerder opgeslagen notificatie al is opgeruimd.
    expect(ownerNotificationDedupKey('appointment_cancelled', entityId)).toBe(
      ownerNotificationDedupKey('appointment_cancelled', entityId),
    )
    expect(ownerNotificationDedupKey('queue_joined', entityId)).not.toBe(
      ownerNotificationDedupKey('queue_left', entityId),
    )
    expect(ownerNotificationDedupKey('queue_joined', entityId)).not.toBe(
      ownerNotificationDedupKey('queue_joined', '22222222-2222-2222-2222-222222222222'),
    )
  })
})
