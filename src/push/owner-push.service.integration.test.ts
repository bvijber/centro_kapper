import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  ownerPushSchemaAvailable,
  reportOwnerPushSchemaBlocked,
} from '../../tests/helpers/owner-push-schema'

/**
 * Integratietests voor het abonnementbeheer van de eigenaarpush.
 *
 * De tests draaien tegen de database die het project voor tests configureert
 * (`DATABASE_URL`, of `TEST_DATABASE_URL` wanneer `vitest.setup.ts` daarheen
 * routeert) en raken uitsluitend de eigen fixtures. De tabellen van
 * eigenaarpush komen uit migratie 0013; zolang die migratie niet is toegepast,
 * worden de tests expliciet overgeslagen en gemeld als geblokkeerd.
 */
const databaseAvailable = Boolean(process.env.DATABASE_URL)
const schemaAvailable = databaseAvailable ? await ownerPushSchemaAvailable() : false
if (databaseAvailable && !schemaAvailable) reportOwnerPushSchemaBlocked()
const suiteTitle = schemaAvailable
  ? 'owner push subscription service'
  : 'owner push subscription service [GEBLOKKEERD: migratie 0013 is nog niet toegepast]'

const ENDPOINT_A = 'https://push.example.test/owner/aaa111'
const ENDPOINT_B = 'https://push.example.test/owner/bbb222'
const KEYS = {
  p256dh: 'BL7ELU24fJTAlH5Kyl8N6BDCac8u8li_U5PIwG963MOvdYs9s7LSzj8x_7v7RFdLZ9Eap50PiiyF5K0TDAis7t0',
  auth: 'juarI8x__VnHvsOgfeAPHg',
}

describe.skipIf(!schemaAvailable)(suiteTitle, () => {
  it('registreert, toont en schakelt apparaten van de eigenaar uit', async () => {
    const { db } = await import('../db/client.server')
    const { inArray, sql } = await import('drizzle-orm')
    const { ownerPushSubscriptions } = await import('../db/schema/owner-push-subscriptions')
    const { auditLogs } = await import('../db/schema/audit-logs')
    const {
      getOwnerPushStatus,
      listOwnerPushSubscriptions,
      registerOwnerPushSubscription,
      unregisterOwnerPushSubscription,
    } = await import('./owner-push.service.server')
    const { ensureActiveOwnerFixture, removeOwnerFixture } = await import('../../tests/helpers/owner-fixture')

    // Zekerheidscontrole: de test raakt alleen eigen fixtures, maar controleer
    // wel welke database verbonden is.
    const expectedDatabase = decodeURIComponent(
      new URL(process.env.DATABASE_URL as string).pathname.replace(/^\//, ''),
    )
    const currentDatabase = await db.execute(sql`select current_database() as name`)
    expect(currentDatabase.rows[0]?.name).toBe(expectedDatabase)

    const previousPublicKey = process.env.VAPID_PUBLIC_KEY
    process.env.VAPID_PUBLIC_KEY = 'test-public-key'
    const ownerFixture = await ensureActiveOwnerFixture('owner-push-subscriptions')
    const ownerId = ownerFixture.userId
    const createdSubscriptionIds: string[] = []
    try {
      const registered = await registerOwnerPushSubscription(
        { endpoint: ENDPOINT_A, ...KEYS },
        ownerId,
      )
      createdSubscriptionIds.push(registered.id)
      expect(registered.active).toBe(true)
      expect(registered).not.toHaveProperty('endpoint')
      expect(registered).not.toHaveProperty('p256dhKey')
      expect(registered).not.toHaveProperty('authKey')

      // Een tweede registratie van hetzelfde endpoint bijwerkt dezelfde rij.
      const again = await registerOwnerPushSubscription({ endpoint: ENDPOINT_A, ...KEYS }, ownerId)
      expect(again.id).toBe(registered.id)
      createdSubscriptionIds.push(again.id)

      const status = await getOwnerPushStatus(ENDPOINT_A, ownerId)
      expect(status.subscribed).toBe(true)
      expect(status.id).toBe(registered.id)
      expect(status.label).not.toContain(ENDPOINT_A)

      const second = await registerOwnerPushSubscription({ endpoint: ENDPOINT_B, ...KEYS }, ownerId)
      createdSubscriptionIds.push(second.id)

      const devices = await listOwnerPushSubscriptions(ownerId)
      expect(devices.length).toBeGreaterThanOrEqual(2)
      const mine = devices.filter((device) => createdSubscriptionIds.includes(device.id))
      expect(mine).toHaveLength(2)
      expect(mine.every((device) => device.active)).toBe(true)
      expect(JSON.stringify(mine)).not.toContain(ENDPOINT_A)
      expect(JSON.stringify(mine)).not.toContain(ENDPOINT_B)

      // Eén apparaat uitschakelen raakt de andere apparaten niet.
      const disabled = await unregisterOwnerPushSubscription(registered.id, ownerId)
      expect(disabled.active).toBe(false)
      await expect(getOwnerPushStatus(ENDPOINT_A, ownerId)).resolves.toMatchObject({ subscribed: false })
      await expect(getOwnerPushStatus(ENDPOINT_B, ownerId)).resolves.toMatchObject({ subscribed: true })

      // Een ander account kan het apparaat niet beheren.
      await expect(unregisterOwnerPushSubscription(second.id, randomUUID())).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
      expect(await listOwnerPushSubscriptions(randomUUID())).toEqual([])

      const actions = await db
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(inArray(auditLogs.entityId, createdSubscriptionIds))
      expect(actions.map((row) => row.action)).toContain('owner_push.subscribe')
      expect(actions.map((row) => row.action)).toContain('owner_push.unsubscribe')
    } finally {
      // Alleen de eigen fixtures opruimen; bestaande abonnementen blijven staan.
      await db.delete(ownerPushSubscriptions).where(inArray(ownerPushSubscriptions.id, createdSubscriptionIds))
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdSubscriptionIds))
      if (previousPublicKey === undefined) delete process.env.VAPID_PUBLIC_KEY
      else process.env.VAPID_PUBLIC_KEY = previousPublicKey
      await removeOwnerFixture(ownerFixture)
    }
  })
})
