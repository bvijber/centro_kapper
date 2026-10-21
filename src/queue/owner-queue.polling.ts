import { listOwnerQueueFn } from './queue.functions'
import type { QueueEntryDTO } from './queue.service.server'
import { formatAmsterdamDateKey } from '../timezone'

/**
 * Snapshot van de kapperswachtrij voor de automatische verversing.
 *
 * Alleen de wachtrijvermeldingen worden opgehaald: de dienstenlijst is een
 * statische referentie die alleen bij een gebruikersactie verandert en
 * daarom niet wordt gepolld.
 */
export type OwnerQueueSnapshot = {
  entries: QueueEntryDTO[]
  queueDate: string
}

/**
 * Interval van de automatische verversing van de kapperswachtrij. Zelfde
 * basisinterval als de klantwachtrij: de wachtrij verandert tijdens de dag
 * en de lijst is klein.
 */
export const OWNER_QUEUE_POLL_INTERVAL_MS = 12_000

/**
 * Haalt de wachtrijvermeldingen van vandaag op via de bestaande Server
 * Function. Alleen-lezen datapad voor de initiële load, de handmatige
 * refresh en de stille achtergrondverversing; de autorisatie loopt via de
 * bestaande `requireOwner()` in de Server Function.
 */
export async function fetchOwnerQueueSnapshot(): Promise<OwnerQueueSnapshot> {
  const queueDate = formatAmsterdamDateKey(new Date())
  const entries = await listOwnerQueueFn({ data: { queueDate } })
  return { entries, queueDate }
}
