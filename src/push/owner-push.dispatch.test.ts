import { describe, expect, it, vi } from 'vitest'

// De dispatch-module importeert de server-only databaseclient. Die mag deze
// unit-test niet nodig hebben: de test dekt alleen de pure payloadbouw.
vi.mock('../db/client.server', () => ({ db: {} }))

import { buildOwnerPushPayload } from './owner-push.dispatch.server'

// Zelfde patroon als de service worker hanteert voor de notification-tag.
const TAG_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

describe('owner push payload', () => {
  it('bevat uitsluitend een technische tag en het soort gebeurtenis', () => {
    const payload = buildOwnerPushPayload({
      event: 'queue_joined',
      dedupKey: 'queue_joined:123e4567-e89b-12d3-a456-426614174000',
    })
    const parsed = JSON.parse(payload.body) as Record<string, unknown>
    expect(Object.keys(parsed).sort()).toEqual(['kind', 'tag'])
    expect(parsed.kind).toBe('queue_joined')
    expect(parsed.tag).toBe(payload.tag)
  })

  it('gebruikt een stabiele tag die door de service worker geaccepteerd wordt', () => {
    const event = { event: 'appointment_booked', dedupKey: 'appointment_booked:abc' }
    const first = buildOwnerPushPayload(event)
    const second = buildOwnerPushPayload(event)
    expect(first.tag).toBe(second.tag)
    expect(first.tag).toMatch(TAG_PATTERN)
    expect(first.tag).toContain('appointment_booked')
  })

  it('lekt geen klantgegevens of entiteitsverwijzingen', () => {
    const payload = buildOwnerPushPayload({
      event: 'queue_joined',
      dedupKey: 'queue_joined:123e4567-e89b-12d3-a456-426614174000',
    })
    expect(payload.body).not.toContain('123e4567-e89b-12d3-a456-426614174000')
    expect(payload.body).not.toContain('queue_joined:')
  })

  it('maakt verschillende taggen voor verschillende gebeurtenissen', () => {
    const first = buildOwnerPushPayload({ event: 'queue_joined', dedupKey: 'queue_joined:a' })
    const second = buildOwnerPushPayload({ event: 'queue_joined', dedupKey: 'queue_joined:b' })
    const third = buildOwnerPushPayload({ event: 'queue_left', dedupKey: 'queue_joined:a' })
    expect(first.tag).not.toBe(second.tag)
    expect(first.tag).not.toBe(third.tag)
  })
})
