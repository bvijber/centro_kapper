import { z } from 'zod'

export const serviceCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  durationMinutes: z.number().int().min(1),
  priceCents: z.number().int().min(0),
})

export const serviceUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  durationMinutes: z.number().int().min(1).optional(),
  priceCents: z.number().int().min(0).optional(),
})

export const serviceIdSchema = z.object({ id: z.string().uuid() })

export const serviceUpdateRequestSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  durationMinutes: z.number().int().min(1).optional(),
  priceCents: z.number().int().min(0).optional(),
}).superRefine((value, context) => {
  if (value.name === undefined && value.description === undefined && value.durationMinutes === undefined && value.priceCents === undefined) {
    context.addIssue({ code: 'custom', message: 'Geef ten minste één veld op om te wijzigen.', path: ['name'] })
  }
})

export type ServiceCreateInput = z.infer<typeof serviceCreateSchema>
export type ServiceUpdateInput = z.infer<typeof serviceUpdateSchema>
export type ServiceUpdateRequestInput = z.infer<typeof serviceUpdateRequestSchema>