import { createFileRoute } from '@tanstack/react-router'

import {
  cleanupOwnerPushData,
  dispatchOwnerPushDeliveries,
  reconcileStaleOwnerPushDeliveries,
} from '../../push/owner-push.dispatch.server'
import { cleanupPushData, dispatchPendingDeliveries, reconcileStaleSending } from '../../push/push.dispatch.server'

/**
 * Dagelijkse Vercel Cron-route voor Web Push-herstel en -opschoning.
 *
 * Uitsluitend recovery en cleanup, nooit onmiddellijke bezorging:
 * - herstelt vastgelopen `sending`-deliveries;
 * - verwerkt achtergebleven `pending`-deliveries;
 * - ruimt technische records op die hun rol hebben vervuld.
 *
 * De klantenpush (§28) en de eigenaarpush (§29) draaien in volledig
 * gescheiden secties: eigen tabellen, eigen dispatch en eigen cleanup. Een
 * fout in de eigenaarsectie raakt de klantensectie niet.
 *
 * Beveiliging: alleen aanroepen met een geldige `Authorization: Bearer
 * <CRON_SECRET>`-header worden verwerkt; alles anders krijgt 401. Er
 * volgen geen redirects; het antwoord is altijd direct JSON.
 */
async function runOwnerPushRecovery(): Promise<{
  stale: { recovered: number; closed: number } | null
  dispatched: unknown
  cleaned: unknown
  error: string | null
}> {
  try {
    const [stale, dispatched, cleaned] = await Promise.all([
      reconcileStaleOwnerPushDeliveries(),
      dispatchOwnerPushDeliveries(),
      cleanupOwnerPushData(),
    ])
    return { stale, dispatched, cleaned, error: null }
  } catch {
    // De klantensectie mag niet door een fout in de eigenaarsectie falen.
    return { stale: null, dispatched: null, cleaned: null, error: 'owner-push-failed' }
  }
}

export async function handlePushDispatchCron(request: Request): Promise<Response> {
  const authorization = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ ok: false }, { status: 401 })
  }
  const [stale, dispatched, cleaned, owner] = await Promise.all([
    reconcileStaleSending(),
    dispatchPendingDeliveries(),
    cleanupPushData(),
    runOwnerPushRecovery(),
  ])
  return Response.json({ ok: true, stale, dispatched, cleaned, owner })
}

export const Route = createFileRoute('/api/cron/push-dispatch')({
  server: {
    handlers: {
      GET: async ({ request }) => handlePushDispatchCron(request),
    },
  },
})
