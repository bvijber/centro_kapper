import { describe, expect, it } from 'vitest'

import { calculateEstimatedWaitMinutes, calculateQueuePosition, canTransitionQueueStatus, compareQueueOrder, isTerminalQueueStatus } from './queue.domain'

describe('queue domain', () => {
  it('enforces the queue transition matrix and terminal states', () => {
    expect(canTransitionQueueStatus('waiting', 'called')).toBe(true)
    expect(canTransitionQueueStatus('waiting', 'cancelled')).toBe(true)
    expect(canTransitionQueueStatus('called', 'in_service')).toBe(true)
    expect(canTransitionQueueStatus('in_service', 'completed')).toBe(true)
    expect(canTransitionQueueStatus('skipped', 'waiting')).toBe(true)
    expect(canTransitionQueueStatus('waiting', 'completed')).toBe(false)
    expect(canTransitionQueueStatus('completed', 'waiting')).toBe(false)
    expect(canTransitionQueueStatus('cancelled', 'called')).toBe(false)
    expect(isTerminalQueueStatus('completed')).toBe(true)
    expect(isTerminalQueueStatus('cancelled')).toBe(true)
    expect(isTerminalQueueStatus('skipped')).toBe(false)
  })

  it('orders FIFO deterministically when joinedAt values tie', () => {
    const joinedAt = new Date('2026-09-10T10:00:00.000Z')
    const entries = [
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', joinedAt },
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', joinedAt },
    ]
    expect([...entries].sort(compareQueueOrder)[0].id).toBe(entries[1].id)
    expect(calculateQueuePosition(entries, entries[1].id)).toBe(1)
  })

  it('calculates wait time from active entries ahead only', () => {
    expect(calculateEstimatedWaitMinutes([
      { status: 'waiting', serviceDurationMinutes: 30 },
      { status: 'called', serviceDurationMinutes: 20 },
      { status: 'in_service', serviceDurationMinutes: 40 },
      { status: 'completed', serviceDurationMinutes: 90 },
    ], 10)).toBe(120)
  })
})
