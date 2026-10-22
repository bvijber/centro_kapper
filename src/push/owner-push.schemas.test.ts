import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

import {
  ownerPushRegisterSchema,
  ownerPushStatusSchema,
  ownerPushSubscriptionIdSchema,
} from './owner-push.schemas'

const endpoint = 'https://push.example.test/owner/abc123'
const keys = {
  p256dh: 'BL7ELU24fJTAlH5Kyl8N6BDCac8u8li_U5PIwG963MOvdYs9s7LSzj8x_7v7RFdLZ9Eap50PiiyF5K0TDAis7t0',
  auth: 'juarI8x__VnHvsOgfeAPHg',
}

describe('owner push schemas', () => {
  it('accepts a complete registration', () => {
    expect(ownerPushRegisterSchema.safeParse({ endpoint, ...keys }).success).toBe(true)
  })

  it('rejects invalid endpoints and keys', () => {
    expect(ownerPushRegisterSchema.safeParse({ endpoint: 'geen-url', ...keys }).success).toBe(false)
    expect(ownerPushRegisterSchema.safeParse({ endpoint: 'http://onveilig.example.test/x', ...keys }).success).toBe(false)
    expect(ownerPushRegisterSchema.safeParse({ endpoint, p256dh: '', auth: keys.auth }).success).toBe(false)
    expect(ownerPushRegisterSchema.safeParse({ endpoint, p256dh: keys.p256dh, auth: 'met spatie' }).success).toBe(false)
  })

  it('validates the status endpoint and the subscription id', () => {
    expect(ownerPushStatusSchema.safeParse({ endpoint }).success).toBe(true)
    expect(ownerPushStatusSchema.safeParse({ endpoint: 'niet-http' }).success).toBe(false)
    expect(ownerPushSubscriptionIdSchema.safeParse({ id: randomUUID() }).success).toBe(true)
    expect(ownerPushSubscriptionIdSchema.safeParse({ id: 'geen-uuid' }).success).toBe(false)
  })
})
