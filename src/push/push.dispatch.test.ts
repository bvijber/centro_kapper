import { describe, expect, it, vi } from 'vitest'

// De dispatch-module importeert de server-only databaseclient. Die mag deze
// unit-test niet nodig hebben: de test dekt alleen de pure hulpfuncties.
vi.mock('../db/client.server', () => ({ db: {} }))

import { buildPushPayload, classifyProviderError, computeRetryDelayMs, parseRetryAfterSeconds, PUSH_RETRY_DELAY_MS } from './push.dispatch.server'

describe('push dispatch classification', () => {
  it('deactivates invalid subscriptions on 404 and 410', () => {
    expect(classifyProviderError({ statusCode: 404 })).toMatchObject({ category: 'invalid', statusCode: 404 })
    expect(classifyProviderError({ statusCode: 410 })).toMatchObject({ category: 'invalid', statusCode: 410 })
  })

  it('retries transient provider errors', () => {
    expect(classifyProviderError({ statusCode: 429 })).toMatchObject({ category: 'transient' })
    expect(classifyProviderError({ statusCode: 500 })).toMatchObject({ category: 'transient' })
    expect(classifyProviderError({ statusCode: 503 })).toMatchObject({ category: 'transient' })
    expect(classifyProviderError(new Error('socket hang up'))).toMatchObject({ category: 'transient' })
  })

  it('never retries permanent errors', () => {
    expect(classifyProviderError({ statusCode: 400 })).toMatchObject({ category: 'permanent' })
    expect(classifyProviderError({ statusCode: 401 })).toMatchObject({ category: 'permanent' })
    expect(classifyProviderError({ statusCode: 403 })).toMatchObject({ category: 'permanent' })
  })

  it('parses Retry-After information when available', () => {
    expect(classifyProviderError({ statusCode: 429, headers: { 'retry-after': '120' } })).toMatchObject({
      category: 'transient',
      retryAfterSeconds: 120,
    })
    expect(classifyProviderError({ statusCode: 503, headers: {} }).retryAfterSeconds).toBeUndefined()
    expect(parseRetryAfterSeconds({ 'retry-after': 'onzin' })).toBeUndefined()
    expect(parseRetryAfterSeconds(null)).toBeUndefined()
  })

  it('builds a payload with only the tag', () => {
    const payload = buildPushPayload('called:123e4567-e89b-12d3-a456-426614174000')
    expect(Object.keys(JSON.parse(payload.body))).toEqual(['tag'])
    expect(payload.tag).toBe('called:123e4567-e89b-12d3-a456-426614174000')
  })
})

describe('push retry back-off', () => {
  it('plant een oplopende back-off zonder Retry-After', () => {
    expect(computeRetryDelayMs(1, undefined)).toBe(PUSH_RETRY_DELAY_MS)
    expect(computeRetryDelayMs(2, undefined)).toBe(PUSH_RETRY_DELAY_MS * 2)
    expect(computeRetryDelayMs(3, undefined)).toBe(PUSH_RETRY_DELAY_MS * 3)
  })

  it('plant de volgende poging altijd in de toekomst', () => {
    expect(computeRetryDelayMs(1, undefined)).toBeGreaterThan(0)
    expect(computeRetryDelayMs(0, undefined)).toBeGreaterThan(0)
  })

  it('volgt een geldige Retry-After van de provider', () => {
    expect(computeRetryDelayMs(1, 120)).toBe(120_000)
    expect(computeRetryDelayMs(2, 30)).toBe(30_000)
  })

  it('behandelt een Retry-After van nul als afwezig', () => {
    expect(computeRetryDelayMs(1, 0)).toBe(PUSH_RETRY_DELAY_MS)
  })
})
