import { createHash } from 'node:crypto'

import { db } from '../db/client.server'
import type { Database } from '../db/client.server'
import { auditLogs, type JsonValue } from '../db/schema/audit-logs'

type AuditEvent = {
  action: string
  actorUserId?: string
  entityType: string
  entityId?: string
  metadata?: JsonValue
  ip?: string
  userAgent?: string
}

function hashNetworkValue(value: string | undefined): string | null {
  return value ? createHash('sha256').update(value).digest('hex') : null
}

type AuditExecutor = Pick<Database, 'insert'>

export async function recordAuditEvent(event: AuditEvent, executor: AuditExecutor = db): Promise<void> {
  await executor.insert(auditLogs).values({
    action: event.action,
    actorUserId: event.actorUserId,
    entityType: event.entityType,
    entityId: event.entityId,
    metadata: event.metadata,
    ipHash: hashNetworkValue(event.ip),
    userAgent: event.userAgent,
  })
}
