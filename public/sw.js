/**
 * Centro Kapper service worker (PWA-basis + Web Push v1, fase 3).
 *
 * Expliciet géén caching of offlinegedrag:
 * - er worden geen Cache Storage-API's geopend;
 * - responses worden nooit onderschept of herschreven;
 * - Server Function-aanroepen, geauthenticeerde pagina's en privédata
 *   gaan altijd rechtstreeks naar het netwerk.
 *
 * De lege fetch-listener bestaat uitsluitend omdat installeerbaarheid
 * een fetch-handler vereist; zonder respondWith valt ieder verzoek
 * terug op het netwerk.
 *
 * Push (Web Push v1, BUSINESS_RULES.md §28):
 * - uitsluitend de vaste titel en het vaste bericht hieronder;
 * - de notification-tag komt van de server en dient alleen voor visuele
 *   deduplicatie; titel, bericht en bestemming komen nooit uit de payload;
 * - onbetrouwbare of ontbrekende payloadvelden veranderen niets.
 *
 * Eigenaarpush (BUSINESS_RULES.md §29) gebruikt hetzelfde kanaal met een
 * `kind`-discriminator. De klanttak is ongewijzigd: payloads zonder herkenbare
 * `kind` blijven klantmeldingen met dezelfde titel, tekst, tag-prefix en
 * bestemming `/queue`. Een eigenaarpayload bevat uitsluitend het soort
 * gebeurtenis en een technische tag; de vaste teksten hieronder bevatten
 * bewust geen klantnaam of andere persoonsgegevens.
 *
 * Notification-click navigeert uitsluitend same-origin naar /queue (klant) of
 * /owner (eigenaar) en verleent zelf geen toegang; autorisatie loopt via de
 * app.
 *
 * Updatebeleid: bewust géén skipWaiting en géén clients.claim. Een nieuwe
 * versie neemt pas controle zodra alle tabs zijn gesloten, zodat een
 * update nooit ongemerkt een lopende boekings- of wachtrijflow afbreekt.
 * Versiebeheer: verhoog SW_VERSION hieronder bij iedere sw.js-wijziging.
 *
 * Huidige versie: centro-kapper-sw-v3
 */
const SW_VERSION = 'centro-kapper-sw-v3'

const NOTIFICATION_TITLE = 'Centro Kapper'
const NOTIFICATION_BODY = 'Je bent aan de beurt. Open de app voor meer informatie.'
const NOTIFICATION_TAG_PREFIX = 'centro-kapper-queue-'
const NOTIFICATION_TAG_FALLBACK = `${NOTIFICATION_TAG_PREFIX}called`
const QUEUE_PATH = '/queue'
const TAG_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

const OWNER_PATH = '/owner'
const OWNER_TAG_PREFIX = 'centro-kapper-owner-'
const OWNER_TAG_FALLBACK = `${OWNER_TAG_PREFIX}owner`
/** Vaste teksten per soort eigenaargebeurtenis; nooit afgeleid van klantdata. */
const OWNER_MESSAGES = {
  queue_joined: 'Iemand is toegevoegd aan de wachtrij.',
  queue_left: 'Iemand heeft de wachtrij verlaten.',
  appointment_booked: 'Er is een nieuwe afspraak geboekt.',
  appointment_cancelled: 'Er is een afspraak geannuleerd.',
}

function resolveNotificationTag(payload) {
  if (payload && typeof payload.tag === 'string' && TAG_PATTERN.test(payload.tag)) {
    return `${NOTIFICATION_TAG_PREFIX}${payload.tag}`
  }
  return NOTIFICATION_TAG_FALLBACK
}

function resolveOwnerKind(payload) {
  if (!payload || typeof payload !== 'object') return null
  const kind = payload.kind
  if (typeof kind !== 'string') return null
  return Object.prototype.hasOwnProperty.call(OWNER_MESSAGES, kind) ? kind : null
}

function resolveOwnerTag(payload) {
  if (payload && typeof payload.tag === 'string' && TAG_PATTERN.test(payload.tag)) {
    return `${OWNER_TAG_PREFIX}${payload.tag}`
  }
  return OWNER_TAG_FALLBACK
}

/** Alleen de vaste bestemmingen zijn toegestaan; geen open redirect. */
function resolveTargetPath(notification) {
  const data = notification && notification.data
  if (data && typeof data === 'object' && data.url === OWNER_PATH) return OWNER_PATH
  return QUEUE_PATH
}

function readPayload(event) {
  if (!event.data) return null
  try {
    const parsed = event.data.json()
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (_) {
    return null
  }
}

self.addEventListener('install', () => {
  // Bewust geen skipWaiting(): zie updatebeleid hierboven.
  void SW_VERSION
})

self.addEventListener('activate', () => {
  // Bewust geen clients.claim(): zie updatebeleid hierboven.
  void SW_VERSION
})

self.addEventListener('fetch', () => {
  // Bewust leeg: ieder verzoek valt terug op het netwerk.
})

self.addEventListener('push', (event) => {
  const payload = readPayload(event)
  const ownerKind = resolveOwnerKind(payload)
  if (ownerKind) {
    const ownerTag = resolveOwnerTag(payload)
    event.waitUntil(
      self.registration.showNotification(NOTIFICATION_TITLE, {
        body: OWNER_MESSAGES[ownerKind],
        tag: ownerTag,
        renotify: false,
        data: { url: OWNER_PATH },
      }),
    )
    return
  }
  const tag = resolveNotificationTag(payload)
  event.waitUntil(
    self.registration.showNotification(NOTIFICATION_TITLE, {
      body: NOTIFICATION_BODY,
      tag,
      renotify: false,
      data: { url: QUEUE_PATH },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const path = resolveTargetPath(event.notification)
      const target = new URL(path, self.location.origin).href
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windowClients) {
        let url = null
        try {
          url = new URL(client.url)
        } catch (_) {
          continue
        }
        if (url.origin === self.location.origin && url.pathname === path && 'focus' in client) {
          await client.focus()
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
