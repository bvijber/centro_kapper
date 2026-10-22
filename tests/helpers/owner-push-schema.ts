import { sql } from 'drizzle-orm'

/**
 * Read-only controle op de aanwezigheid van de tabellen voor eigenaarpush
 * (`owner_push_subscriptions` en `owner_push_deliveries`, migratie 0013).
 *
 * De integratietests voor eigenaarpush kunnen pas draaien wanneer die
 * migratie is toegepast. Zolang dat niet het geval is, worden de tests
 * expliciet overgeslagen en gemeld als geblokkeerd; er wordt geen guard
 * omzeild en er wordt niet naar een niet-bestaande tabel geschreven.
 */
export async function ownerPushSchemaAvailable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false
  try {
    const { db } = await import('../../src/db/client.server')
    const result = await db.execute(sql`select to_regclass('public.owner_push_subscriptions')::text as subscriptions, to_regclass('public.owner_push_deliveries')::text as deliveries`)
    const row = result.rows[0] as { subscriptions: string | null; deliveries: string | null } | undefined
    return Boolean(row?.subscriptions && row?.deliveries)
  } catch {
    return false
  }
}

/** Meldt expliciet waarom de database-tests voor eigenaarpush niet draaien. */
export function reportOwnerPushSchemaBlocked(): void {
  console.warn(
    '[GEBLOKKEERD] Database-tests voor eigenaarpush zijn overgeslagen: migratie 0013 ' +
      '(drizzle/0013_lyrical_luminals.sql) is nog niet toegepast op de geconfigureerde database. ' +
      'Pas de migratie toe en draai de tests opnieuw.',
  )
}
