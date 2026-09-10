import { z } from 'zod'

const optionalText = (max: number) => z.string().trim().min(1).max(max).optional()

export const queueJoinSchema = z.object({
  serviceId: z.string().uuid(),
  customerUserId: z.string().uuid().optional(),
  guestName: optionalText(200),
  guestPhone: optionalText(50),
  note: z.string().trim().max(1000).optional(),
}).superRefine((value, context) => {
  const hasGuestName = value.guestName !== undefined
  const hasGuestPhone = value.guestPhone !== undefined

  if (hasGuestName !== hasGuestPhone) {
    context.addIssue({ code: 'custom', message: 'Gastnaam en gasttelefoon zijn samen verplicht.', path: ['guestName'] })
  }
  if (value.customerUserId !== undefined && (hasGuestName || hasGuestPhone)) {
    context.addIssue({ code: 'custom', message: 'Een queue-entry kan niet tegelijk een customer en gast zijn.', path: ['customerUserId'] })
  }
})

export const queueEntryIdSchema = z.object({ id: z.string().uuid() })

export const queueDateSchema = z.object({
  queueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const queueStatusUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['called', 'in_service', 'completed', 'cancelled', 'skipped']),
  appointmentId: z.string().uuid().optional(),
})

export type QueueJoinInput = z.infer<typeof queueJoinSchema>
export type QueueStatusUpdateInput = z.infer<typeof queueStatusUpdateSchema>
