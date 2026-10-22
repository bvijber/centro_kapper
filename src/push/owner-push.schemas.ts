import { z } from 'zod'

/**
 * Validaties voor de pushabonnementen van de **eigenaar**
 * (BUSINESS_RULES.md §29 "Eigenaarpush").
 *
 * De patronen zijn bewust een eigen kopie van de klantenpush-validatie
 * (`push.schemas.ts`): de klantenpush blijft daardoor onaangeroerd en beide
 * kanalen delen geen logica.
 */
const base64UrlValue = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .regex(/^[A-Za-z0-9\-_]+={0,2}$/, 'Ongeldige subscriptiongegevens.')

const httpsEndpoint = z
  .string()
  .trim()
  .url('Ongeldig push-endpoint.')
  .max(2000)
  .refine(
    (value) => value.startsWith('https://') || value.startsWith('http://localhost'),
    'Ongeldig push-endpoint.',
  )

export const ownerPushRegisterSchema = z.object({
  endpoint: httpsEndpoint,
  p256dh: base64UrlValue,
  auth: base64UrlValue,
})

export const ownerPushStatusSchema = z.object({
  endpoint: httpsEndpoint,
})

export const ownerPushSubscriptionIdSchema = z.object({
  id: z.string().uuid(),
})

export type OwnerPushRegisterInput = z.infer<typeof ownerPushRegisterSchema>
export type OwnerPushStatusInput = z.infer<typeof ownerPushStatusSchema>
export type OwnerPushSubscriptionIdInput = z.infer<typeof ownerPushSubscriptionIdSchema>
