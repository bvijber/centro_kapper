/**
 * Server-only VAPID-configuratie voor Web Push (fase 5).
 *
 * Regels:
 * - Alleen server-side te gebruiken; de private key mag nooit naar de
 *   client, in responses, logs of VITE_-variabelen lekken.
 * - VAPID_SUBJECT blijft leeg totdat het definitieve zakelijke
 *   e-mailadres bekend is; er wordt geen fictief adres ingevuld.
 * - Ontbrekende of ongeldige configuratie schakelt verzending
 *   fail-closed uit (zie push.dispatch.server.ts).
 */

export type VapidConfig = {
  publicKey: string
  privateKey: string
  subject: string
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

/** Volledige verzendconfiguratie, of null wanneer verzending niet is toegestaan. */
export function getVapidConfig(): VapidConfig | null {
  const publicKey = readEnv('VAPID_PUBLIC_KEY')
  const privateKey = readEnv('VAPID_PRIVATE_KEY')
  const subject = readEnv('VAPID_SUBJECT')
  if (!publicKey || !privateKey || !subject) return null
  return { publicKey, privateKey, subject }
}
