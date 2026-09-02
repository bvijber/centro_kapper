import { sql } from 'drizzle-orm'

import { db } from '../db/client.server'
import { rateLimits } from '../db/schema/rate-limits'

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const now = new Date()
  const windowStart = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000)
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count })

  return (row?.count ?? limit + 1) <= limit
}

export async function cleanupRateLimits(before: Date = new Date(Date.now() - 24 * 60 * 60 * 1000)): Promise<void> {
  await db.delete(rateLimits).where(sql`${rateLimits.windowStart} < ${before}`)
}
