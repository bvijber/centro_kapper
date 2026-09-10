export const queueStatuses = ['waiting', 'called', 'in_service', 'completed', 'cancelled', 'skipped'] as const
export type QueueStatus = (typeof queueStatuses)[number]

export const activeQueueStatuses = ['waiting', 'called', 'in_service'] as const

const transitions: Record<QueueStatus, readonly QueueStatus[]> = {
  waiting: ['called', 'cancelled', 'skipped'],
  called: ['in_service', 'cancelled', 'skipped'],
  in_service: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  skipped: ['waiting'],
}

export function canTransitionQueueStatus(from: QueueStatus, to: QueueStatus): boolean {
  return transitions[from].includes(to)
}

export function isActiveQueueStatus(status: QueueStatus): boolean {
  return (activeQueueStatuses as readonly string[]).includes(status)
}

export function isTerminalQueueStatus(status: QueueStatus): boolean {
  return status === 'completed' || status === 'cancelled'
}

export type QueueOrderItem = { id: string; joinedAt: Date }

export function compareQueueOrder(left: QueueOrderItem, right: QueueOrderItem): number {
  const joinedAtDifference = left.joinedAt.getTime() - right.joinedAt.getTime()
  if (joinedAtDifference !== 0) return joinedAtDifference
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

export function calculateQueuePosition(entries: readonly QueueOrderItem[], entryId: string): number | null {
  const ordered = [...entries].sort(compareQueueOrder)
  const index = ordered.findIndex((entry) => entry.id === entryId)
  return index === -1 ? null : index + 1
}

export function calculateEstimatedWaitMinutes(
  entriesAhead: readonly { status: QueueStatus; serviceDurationMinutes: number }[],
  bufferMinutes: number,
): number {
  return entriesAhead
    .filter((entry) => isActiveQueueStatus(entry.status))
    .reduce((total, entry) => total + entry.serviceDurationMinutes + bufferMinutes, 0)
}
