import { z } from 'zod'

const base64UrlValue = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .regex(/^[A-Za-z0-9\-_]+={0,2}$/, 'Ongeldige subscriptiongegevens.')

const capabilityValue = z.string().min(32).max(128)

const httpsEndpoint = z
  .string()
  .trim()
  .url('Ongeldig push-endpoint.')
  .max(2000)
  .refine(
    (value) => value.startsWith('https://') || value.startsWith('http://localhost'),
    'Ongeldig push-endpoint.',
  )

export const pushSubscriptionRegisterSchema = z.object({
  queueEntryId: z.string().uuid(),
  endpoint: httpsEndpoint,
  p256dh: base64UrlValue,
  auth: base64UrlValue,
  capability: capabilityValue.optional(),
})

export const pushSubscriptionStatusSchema = z.object({
  queueEntryId: z.string().uuid(),
  capability: capabilityValue.optional(),
})

export const pushSubscriptionUnregisterSchema = z.object({
  queueEntryId: z.string().uuid(),
  endpoint: httpsEndpoint,
  capability: capabilityValue.optional(),
})

export type PushSubscriptionRegisterInput = z.infer<typeof pushSubscriptionRegisterSchema>
export type PushSubscriptionStatusInput = z.infer<typeof pushSubscriptionStatusSchema>
export type PushSubscriptionUnregisterInput = z.infer<typeof pushSubscriptionUnregisterSchema>
