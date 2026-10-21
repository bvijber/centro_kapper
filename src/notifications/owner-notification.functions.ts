import { createServerFn } from '@tanstack/react-start'

import { requireOwner } from '../auth/authorization'
import { ownerNotificationIdSchema } from './owner-notification.schemas'
import {
  cleanupExpiredOwnerNotifications,
  getOwnerUnreadCount,
  listOwnerNotifications,
  markAllOwnerNotificationsRead,
  markOwnerNotificationRead,
  repairMissingOwnerNotifications,
} from './owner-notification.service.server'

/**
 * Opruiming van verouderde meldingen loopt mee met het ophalen van de lijst.
 * Een korte tussenpoort voorkomt dat elke pollling een verwijderopdracht
 * veroorzaakt. Het opruimen is niet kritiek: een fout hierin mag het ophalen
 * van de meldingen niet blokkeren.
 */
const CLEANUP_MIN_INTERVAL_MS = 5 * 60 * 1000
let lastCleanupAt = 0

async function runExpiredNotificationCleanup(): Promise<void> {
  const now = Date.now()
  if (now - lastCleanupAt < CLEANUP_MIN_INTERVAL_MS) return
  lastCleanupAt = now
  try {
    await cleanupExpiredOwnerNotifications()
  } catch {
    // Opruimen is best-effort; de meldingenlijst blijft bruikbaar.
  }
}

/**
 * Herstelpas voor gebeurtenissen die duurzaam zijn vastgelegd maar waarbij de
 * melding niet kon worden aangemaakt. Ook deze pass is best-effort en
 * begrensd in frequentie.
 */
const REPAIR_MIN_INTERVAL_MS = 60 * 1000
let lastRepairAt = 0

async function runMissingNotificationRepair(): Promise<void> {
  const now = Date.now()
  if (now - lastRepairAt < REPAIR_MIN_INTERVAL_MS) return
  lastRepairAt = now
  try {
    await repairMissingOwnerNotifications()
  } catch {
    // Herstellen is best-effort; de meldingenlijst blijft bruikbaar.
  }
}

export const getOwnerNotificationsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const owner = await requireOwner()
  await runMissingNotificationRepair()
  await runExpiredNotificationCleanup()
  const items = await listOwnerNotifications(owner.id)
  const unread = await getOwnerUnreadCount(owner.id)
  return { items, unread }
})

export const markOwnerNotificationReadFn = createServerFn({ method: 'POST' })
  .validator(ownerNotificationIdSchema)
  .handler(async ({ data }) => {
    const owner = await requireOwner()
    const updated = await markOwnerNotificationRead(owner.id, data.id)
    const unread = await getOwnerUnreadCount(owner.id)
    return { updated, unread }
  })

export const markAllOwnerNotificationsReadFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    const owner = await requireOwner()
    const updated = await markAllOwnerNotificationsRead(owner.id)
    return { updated, unread: 0 }
  },
)
