import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

import {
  pushSubscriptionRegisterSchema,
  pushSubscriptionStatusSchema,
  pushSubscriptionUnregisterSchema,
} from './push.schemas'

const endpoint = 'https://push.example.test/endpoint/abc123'
const keys = {
  p256dh: 'BL7ELU24fJTAlH5Kyl8N6BDCac8u8li_U5PIwG963MOvdYs9s7LSzj8x_7v7RFdLZ9Eap50PiiyF5K0TDAis7t0',
  auth: 'juarI8x__VnHvsOgfeAPHg',
}

describe('push subscription schemas', () => {
  it('accepts a complete registration', () => {
    expect(
      pushSubscriptionRegisterSchema.safeParse({
        queueEntryId: randomUUID(),
        endpoint,
        ...keys,
        capability: 'a'.repeat(64),
      }).success,
    ).toBe(true)
  })

  it('rejects invalid endpoints, keys and entry ids', () => {
    expect(pushSubscriptionRegisterSchema.safeParse({ queueEntryId: 'geen-uuid', endpoint, ...keys }).success).toBe(false)
    expect(pushSubscriptionRegisterSchema.safeParse({ queueEntryId: randomUUID(), endpoint: 'http://onveilig.example.test/x', ...keys }).success).toBe(false)
    expect(pushSubscriptionRegisterSchema.safeParse({ queueEntryId: randomUUID(), endpoint, p256dh: '', auth: keys.auth }).success).toBe(false)
    expect(pushSubscriptionRegisterSchema.safeParse({ queueEntryId: randomUUID(), endpoint, p256dh: keys.p256dh, auth: 'met spatie' }).success).toBe(false)
  })

  it('accepts status and unregister shapes with optional capability', () => {
    expect(pushSubscriptionStatusSchema.safeParse({ queueEntryId: randomUUID() }).success).toBe(true)
    expect(pushSubscriptionStatusSchema.safeParse({ queueEntryId: randomUUID(), capability: 'b'.repeat(32) }).success).toBe(true)
    expect(pushSubscriptionUnregisterSchema.safeParse({ queueEntryId: randomUUID(), endpoint }).success).toBe(true)
    expect(pushSubscriptionStatusSchema.safeParse({ queueEntryId: randomUUID(), capability: 'te-kort' }).success).toBe(false)
  })
})
