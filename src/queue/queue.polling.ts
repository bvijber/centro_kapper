import { getQueueEntryFn, getQueueEntryPositionFn, listCustomerQueueFn } from './queue.functions'
import type { QueueEntryDTO, QueueEntryMetadata } from './queue.service.server'
import { isActiveQueueStatus } from './queue.domain'
import { formatAmsterdamDateKey } from '../timezone'
import { POLL_BASE_INTERVAL_MS, POLL_MAX_INTERVAL_MS, pollDelayMs } from '../polling/poll-scheduler'
import { createRequestGuard } from '../polling/page-refresh'

export { PollScheduler as QueuePollScheduler } from '../polling/poll-scheduler'
export { createRequestGuard } from '../polling/page-refresh'

export const QUEUE_POLL_BASE_INTERVAL_MS = POLL_BASE_INTERVAL_MS
export const QUEUE_POLL_MAX_INTERVAL_MS = POLL_MAX_INTERVAL_MS
export const GUEST_QUEUE_ENTRY_KEY = 'centro-kapper:queue-entries'

export type QueueSnapshotUser = { id: string; role: string } | null
export type QueueGuestCap = { id: string; capability: string }

export type QueueSnapshot = {
  entries: QueueEntryDTO[]
  entry: QueueEntryDTO | null
  metadata: QueueEntryMetadata | null
  metadataById: Record<string, QueueEntryMetadata>
  storedGuestCaps: QueueGuestCap[] | null
}

export type QueueSnapshotView = {
  entries: Array<{ id: string; status: string; serviceName: string; joinedAt: string }>
  selectedId: string | null
  metadata: QueueEntryMetadata | null
  metadataById: Record<string, QueueEntryMetadata>
}

/** Basisinterval 12s, verdubbelend bij fouten tot maximaal 120s. */
export function nextPollDelayMs(consecutiveFailures: number): number {
  return pollDelayMs(consecutiveFailures)
}

export function hasActiveQueueEntry(statuses: ReadonlyArray<string>): boolean {
  return statuses.some((status) => isActiveQueueStatus(status as Parameters<typeof isActiveQueueStatus>[0]))
}

export function toSnapshotView(snapshot: QueueSnapshot, selectedId: string | null): QueueSnapshotView {
  return {
    entries: snapshot.entries.map((entry) => ({
      id: entry.id,
      status: entry.status,
      serviceName: entry.serviceName,
      joinedAt: entry.joinedAt instanceof Date ? entry.joinedAt.toISOString() : String(entry.joinedAt),
    })),
    selectedId,
    metadata: snapshot.metadata,
    metadataById: snapshot.metadataById,
  }
}

export function isQueueSnapshotEqual(previous: QueueSnapshotView | null, next: QueueSnapshotView): boolean {
  if (!previous) return false
  return JSON.stringify(previous) === JSON.stringify(next)
}

/** Behoudt een handmatig geselecteerde entry zolang die nog in de lijst staat. */
export function resolveSelectedEntry(
  previousSelectedId: string | null,
  entries: QueueEntryDTO[],
  fallback: QueueEntryDTO | null,
): QueueEntryDTO | null {
  if (previousSelectedId) {
    const stillPresent = entries.find((entry) => entry.id === previousSelectedId)
    if (stillPresent) return stillPresent
  }
  return fallback
}

function readStoredGuestCaps(): QueueGuestCap[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(window.localStorage.getItem(GUEST_QUEUE_ENTRY_KEY) ?? '[]') as QueueGuestCap[]
  } catch {
    return []
  }
}

/**
 * Haalt dezelfde wachtrijgegevens op als de paginalading, zonder UI-state
 * aan te raken. Alleen-lezen datapad voor initiële load, handmatige
 * refresh en stille polling; autorisatie loopt via de bestaande
 * Server Functions.
 */
export async function fetchQueueSnapshot(
  currentUser: QueueSnapshotUser,
  guestCaps: QueueGuestCap[] | null,
): Promise<QueueSnapshot> {
  const empty: QueueSnapshot = { entries: [], entry: null, metadata: null, metadataById: {}, storedGuestCaps: null }
  if (currentUser?.role === 'customer') {
    const entries = await listCustomerQueueFn({ data: { queueDate: formatAmsterdamDateKey(new Date()) } })
    const details = await Promise.all(entries.map((item) => getQueueEntryFn({ data: { id: item.id } })))
    const candidate = details.find((item) => isActiveQueueStatus(item.status)) ?? details.find((item) => item.status === 'completed')
    const restored = candidate ?? null
    const metadataEntries = await Promise.all(
      details
        .filter((item) => isActiveQueueStatus(item.status))
        .map(async (item) => [item.id, await getQueueEntryPositionFn({ data: { id: item.id } })] as const),
    )
    const metadataById = Object.fromEntries(metadataEntries)
    return {
      entries: details,
      entry: restored,
      metadata: restored && isActiveQueueStatus(restored.status) ? (metadataById[restored.id] ?? null) : null,
      metadataById,
      storedGuestCaps: null,
    }
  }
  if (!currentUser && typeof window !== 'undefined') {
    const stored = guestCaps ?? readStoredGuestCaps()
    const capabilities = Object.fromEntries(stored.map((item) => [item.id, item.capability]))
    let restored: QueueEntryDTO | null = null
    let restoredCapability: string | undefined
    for (const item of stored) {
      const candidate = await getQueueEntryFn({ data: item })
      if (!restored && isActiveQueueStatus(candidate.status)) {
        restored = candidate
        restoredCapability = item.capability
      }
    }
    const resolvedEntries = stored.length
      ? await Promise.all(stored.map((item) => getQueueEntryFn({ data: item })))
      : []
    const metadataEntries = await Promise.all(
      resolvedEntries
        .filter((item) => isActiveQueueStatus(item.status))
        .map(async (item) => {
          const capability = capabilities[item.id] ?? (item.id === restored?.id ? restoredCapability : undefined)
          return [item.id, await getQueueEntryPositionFn({ data: { id: item.id, ...(capability ? { capability } : {}) } })] as const
        }),
    )
    const metadataById = Object.fromEntries(metadataEntries)
    return {
      entries: resolvedEntries,
      entry: restored,
      metadata: restored && isActiveQueueStatus(restored.status) ? (metadataById[restored.id] ?? null) : null,
      metadataById,
      storedGuestCaps: stored,
    }
  }
  return empty
}

export type { PollSchedulerDeps } from '../polling/poll-scheduler'

