/**
 * Gebeurtenissen voor interne eigenaar-notificaties (BUSINESS_RULES.md §29).
 *
 * Dit module bevat uitsluitend pure, database-onafhankelijke logica zodat de
 * beslissingen over *wanneer* een melding ontstaat en *met welke
 * idempotentiesleutel* rechtstreeks te testen zijn zonder database.
 */

export const ownerNotificationEvents = [
  'queue_joined',
  'queue_left',
  'appointment_booked',
  'appointment_cancelled',
] as const

export type OwnerNotificationEvent = (typeof ownerNotificationEvents)[number]

export type OwnerNotificationEntityType = 'queue_entry' | 'appointment'

/** Actor-soorten die in de wachtrij- en afspraakdomeinen voorkomen. */
export type OwnerNotificationActorKind = 'owner' | 'customer' | 'guest'

/**
 * Stabiele idempotentiesleutels. De sleutel is afgeleid van de identiteit van
 * de gebeurtenis, niet van een tijdstip of een willekeurige id. Daardoor blijft
 * een dubbele gebeurtenis herkenbaar, ook nadat oude notificaties zijn
 * opgeruimd.
 */
export function ownerNotificationDedupKey(
  event: OwnerNotificationEvent,
  entityId: string,
): string {
  return `${event}:${entityId}`
}

/**
 * De eigenaar maakt zelf walk-ins aan; die leveren geen melding op
 * (BUSINESS_RULES.md §29 "Geen melding bij walk-in door de eigenaar zelf").
 */
export function shouldNotifyQueueJoined(actorKind: OwnerNotificationActorKind): boolean {
  return actorKind !== 'owner'
}

/**
 * Alleen een klant of gast die de wachtrij zelf verlaat levert een melding
 * op. Eigenaarsacties (annuleren, overslaan, afronden) doen dat niet.
 */
export function shouldNotifyQueueLeft(actorKind: OwnerNotificationActorKind): boolean {
  return actorKind !== 'owner'
}

/**
 * Elke aangemaakte afspraak levert een melding op, ook wanneer de eigenaar
 * de afspraak zelf aanmaakt (BUSINESS_RULES.md §29).
 */
export function shouldNotifyAppointmentBooked(): boolean {
  return true
}

/**
 * Alleen een daadwerkelijke statusovergang naar `cancelled` levert een
 * annuleringsmelding op. Een verzoek of een herhaalde verwerking die geen
 * nieuwe overgang veroorzaakt, levert geen tweede melding op.
 */
export function shouldNotifyAppointmentCancelled(
  previousStatus: string,
  nextStatus: string,
): boolean {
  return previousStatus !== 'cancelled' && nextStatus === 'cancelled'
}
