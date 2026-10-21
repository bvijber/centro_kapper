import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./queue.functions', () => ({
  listOwnerQueueFn: vi.fn(),
}))

import { listOwnerQueueFn } from './queue.functions'
import { OWNER_QUEUE_POLL_INTERVAL_MS, fetchOwnerQueueSnapshot } from './owner-queue.polling'
import { POLL_BASE_INTERVAL_MS } from '../polling/poll-scheduler'

const mockedOwnerList = vi.mocked(listOwnerQueueFn)

describe('fetchOwnerQueueSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedOwnerList.mockResolvedValue([{ id: 'entry-1' }] as unknown as Awaited<ReturnType<typeof listOwnerQueueFn>>)
  })

  it('haalt de wachtrij van vandaag op via de bestaande Server Function', async () => {
    const snapshot = await fetchOwnerQueueSnapshot()

    expect(mockedOwnerList).toHaveBeenCalledTimes(1)
    expect(mockedOwnerList.mock.calls[0]?.[0]).toEqual({ data: { queueDate: snapshot.queueDate } })
    expect(snapshot.entries).toHaveLength(1)
  })

  it('gebruikt hetzelfde basisinterval als de klantwachtrij', () => {
    expect(OWNER_QUEUE_POLL_INTERVAL_MS).toBe(POLL_BASE_INTERVAL_MS)
  })

  it('propageert een fout zodat de scheduler een back-off kan toepassen', async () => {
    mockedOwnerList.mockRejectedValueOnce(new Error('netwerkfout'))
    await expect(fetchOwnerQueueSnapshot()).rejects.toThrow('netwerkfout')
  })
})
