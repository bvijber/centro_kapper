import { createHash } from 'node:crypto'

import { and, eq } from 'drizzle-orm'

import { recordAuditEvent } from '../auth/audit.server'
import { AuthError } from '../auth/auth.errors'
import { db } from '../db/client.server'
import type { Database } from '../db/client.server'
import { ownerPushSubscriptions } from '../db/schema/owner-push-subscriptions'
import type { OwnerPushRegisterInput } from './owner-push.schemas'
import { getVapidPublicKey } from './push.service.server'

/**
 * Abonnementbeheer voor de pushmeldingen van de **eigenaar**
 * (BUSINESS_RULES.md §29 "Eigenaarpush").
 *
 * Dit module is volledig gescheiden van de klantenpush
 * (`push.service.server.ts`): eigen tabel, eigen abonnementsidentiteit
 * (het apparaat = het endpoint) en eigen foutafhandeling. Alleen de publieke
 * VAPID-sleutel wordt uit het bestaande pushmodule hergebruikt; daarmee
 * verandert er niets aan het klantgedrag.
 *
 * De serverfuncties (`owner-push.functions.ts`) dwingen `requireOwner()` af;
 * de functies hieronder nemen de eigenaar-id expliciet over, zodat de
 * autorisatie niet in de UI maar server-side ligt.
 */
export class OwnerPushError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'FAILED',
  ) {
    super(message)
    this.name = 'OwnerPushError'
  }
}

export type OwnerPushConfigDTO = {
  publicKey: string | null
}

export type OwnerPushSubscriptionDTO = {
  id: string
  active: boolean
  /** ISO-8601; een `Date` wordt door de Server Function als string overgedragen. */
  createdAt: string
}

export type OwnerPushDeviceDTO = {
  id: string
  label: string
  active: boolean
  createdAt: string
}

export type OwnerPushStatusDTO = {
  subscribed: boolean
  id: string | null
  label: string
}

type OwnerPushExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * Een herkenbaar, niet-herleidbaar etiket voor een apparaat. Het endpoint zelf
 * is een geheim en wordt nooit naar de client gegeven.
 */
export function ownerPushDeviceLabel(endpoint: string): string {
  const fingerprint = createHash('sha256').update(endpoint).digest('hex').slice(0, 6).toUpperCase()
  return `Apparaat ${fingerprint}`
}

/** Leest uitsluitend de publieke VAPID-sleutel; de private key blijft server-side. */
export function getOwnerPushConfig(): OwnerPushConfigDTO {
  return { publicKey: getVapidPublicKey() }
}

function mapOwnerPushError(error: unknown, fallback: string): never {
  if (error instanceof OwnerPushError) throw error
  if (error instanceof AuthError) throw error
  throw new OwnerPushError(fallback, 'FAILED')
}

/**
 * Registreert (of heractiveert) het pushabonnement van één apparaat van de
 * eigenaar. Het endpoint is de apparaatidentiteit: een tweede registratie
 * van hetzelfde endpoint bijwerkt de bestaande rij in plaats van een tweede
 * rij aan te maken.
 */
export async function registerOwnerPushSubscription(
  input: OwnerPushRegisterInput,
  ownerUserId: string,
): Promise<OwnerPushSubscriptionDTO> {
  if (!getVapidPublicKey()) throw new OwnerPushError('Push is nog niet beschikbaar.', 'FAILED')
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(ownerPushSubscriptions)
        .values({
          ownerUserId,
          endpoint: input.endpoint,
          p256dhKey: input.p256dh,
          authKey: input.auth,
          active: true,
        })
        .onConflictDoUpdate({
          target: ownerPushSubscriptions.endpoint,
          set: {
            ownerUserId,
            p256dhKey: input.p256dh,
            authKey: input.auth,
            active: true,
            deactivatedAt: null,
            deactivateReason: null,
            updatedAt: new Date(),
          },
        })
        .returning({
          id: ownerPushSubscriptions.id,
          active: ownerPushSubscriptions.active,
          createdAt: ownerPushSubscriptions.createdAt,
        })
      if (!row) throw new OwnerPushError('Het apparaat kon niet worden geregistreerd.', 'FAILED')
      await recordAuditEvent(
        {
          action: 'owner_push.subscribe',
          actorUserId: ownerUserId,
          entityType: 'owner_push_subscription',
          entityId: row.id,
        },
        tx,
      )
      return { id: row.id, active: row.active, createdAt: row.createdAt.toISOString() }
    })
  } catch (error) {
    return mapOwnerPushError(error, 'Het apparaat kon niet worden geregistreerd.')
  }
}

/**
 * Schakelt push voor één apparaat uit. Andere apparaten van de eigenaar
 * blijven ongewijzigd (BUSINESS_RULES.md §29).
 */
export async function unregisterOwnerPushSubscription(
  id: string,
  ownerUserId: string,
): Promise<OwnerPushSubscriptionDTO> {
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: ownerPushSubscriptions.id, active: ownerPushSubscriptions.active })
        .from(ownerPushSubscriptions)
        .where(
          and(
            eq(ownerPushSubscriptions.id, id),
            eq(ownerPushSubscriptions.ownerUserId, ownerUserId),
          ),
        )
        .limit(1)
      if (!existing) throw new OwnerPushError('Apparaat niet gevonden.', 'NOT_FOUND')
      if (!existing.active) {
        const [inactive] = await tx
          .select({
            id: ownerPushSubscriptions.id,
            active: ownerPushSubscriptions.active,
            createdAt: ownerPushSubscriptions.createdAt,
          })
          .from(ownerPushSubscriptions)
          .where(eq(ownerPushSubscriptions.id, existing.id))
          .limit(1)
        return inactive
          ? { id: inactive.id, active: inactive.active, createdAt: inactive.createdAt.toISOString() }
          : { id: existing.id, active: false, createdAt: new Date().toISOString() }
      }
      const [updated] = await tx
        .update(ownerPushSubscriptions)
        .set({
          active: false,
          deactivatedAt: new Date(),
          deactivateReason: 'opt_out',
          updatedAt: new Date(),
        })
        .where(eq(ownerPushSubscriptions.id, existing.id))
        .returning({
          id: ownerPushSubscriptions.id,
          active: ownerPushSubscriptions.active,
          createdAt: ownerPushSubscriptions.createdAt,
        })
      if (!updated) throw new OwnerPushError('Het apparaat kon niet worden uitgeschakeld.', 'FAILED')
      await recordAuditEvent(
        {
          action: 'owner_push.unsubscribe',
          actorUserId: ownerUserId,
          entityType: 'owner_push_subscription',
          entityId: updated.id,
        },
        tx,
      )
      return { id: updated.id, active: updated.active, createdAt: updated.createdAt.toISOString() }
    })
  } catch (error) {
    return mapOwnerPushError(error, 'Het apparaat kon niet worden uitgeschakeld.')
  }
}

/** Geeft de geregistreerde apparaten van de eigenaar terug, zonder endpoints. */
export async function listOwnerPushSubscriptions(
  ownerUserId: string,
): Promise<OwnerPushDeviceDTO[]> {
  try {
    const rows = await db
      .select({
        id: ownerPushSubscriptions.id,
        endpoint: ownerPushSubscriptions.endpoint,
        active: ownerPushSubscriptions.active,
        createdAt: ownerPushSubscriptions.createdAt,
      })
      .from(ownerPushSubscriptions)
      .where(eq(ownerPushSubscriptions.ownerUserId, ownerUserId))
      .orderBy(ownerPushSubscriptions.createdAt)
    return rows.map((row) => ({
      id: row.id,
      label: ownerPushDeviceLabel(row.endpoint),
      active: row.active,
      createdAt: row.createdAt.toISOString(),
    }))
  } catch (error) {
    return mapOwnerPushError(error, 'De apparaten konden niet worden geladen.')
  }
}

/**
 * Geeft aan of het meegegeven endpoint als actief apparaat bekend is. Het
 * endpoint komt van de browser van de eigenaar zelf en wordt uitsluitend op
 * exacte overeenkomst gecontroleerd.
 */
export async function getOwnerPushStatus(
  endpoint: string,
  ownerUserId: string,
): Promise<OwnerPushStatusDTO> {
  try {
    const [row] = await db
      .select({ id: ownerPushSubscriptions.id })
      .from(ownerPushSubscriptions)
      .where(
        and(
          eq(ownerPushSubscriptions.endpoint, endpoint),
          eq(ownerPushSubscriptions.ownerUserId, ownerUserId),
          eq(ownerPushSubscriptions.active, true),
        ),
      )
      .limit(1)
    return {
      subscribed: row !== undefined,
      id: row?.id ?? null,
      label: ownerPushDeviceLabel(endpoint),
    }
  } catch (error) {
    return mapOwnerPushError(error, 'De pushstatus kon niet worden geladen.')
  }
}

/**
 * Deactiveert een abonnement waarvan de endpoint door de pushprovider is
 * afgewezen (404/410). Het apparaat is daarmee onbruikbaar en wordt niet
 * meer aangeboden als geldig apparaat.
 */
export async function deactivateOwnerPushSubscription(
  subscriptionId: string,
  reason: 'invalid' | 'expired' | 'replaced',
  executor: OwnerPushExecutor = db,
): Promise<void> {
  await executor
    .update(ownerPushSubscriptions)
    .set({ active: false, deactivatedAt: new Date(), deactivateReason: reason, updatedAt: new Date() })
    .where(eq(ownerPushSubscriptions.id, subscriptionId))
}
