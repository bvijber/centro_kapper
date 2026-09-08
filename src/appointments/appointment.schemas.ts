import { z } from 'zod'

const optionalText = z.string().trim().min(1).optional()

export const appointmentCreateSchema = z.object({
  serviceId: z.string().uuid(),
  startsAt: z.coerce.date().optional(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  customerUserId: z.string().uuid().optional(),
  guestName: optionalText,
  guestPhone: optionalText,
  guestEmail: z.string().trim().email().max(320).optional(),
  note: z.string().trim().optional(),
  overrideOpeningHours: z.boolean().default(false),
  overrideBreak: z.boolean().default(false),
  overrideWholeDayBlock: z.boolean().default(false),
}).superRefine((value, context) => {
  if (!value.startsAt && (!value.localDate || !value.localTime)) {
    context.addIssue({ code: 'custom', message: 'Een lokale datum en tijd zijn verplicht.', path: ['localDate'] })
  }
  if (value.startsAt && (value.localDate || value.localTime) && (!value.localDate || !value.localTime)) {
    context.addIssue({ code: 'custom', message: 'Lokale datum en tijd zijn samen verplicht.', path: ['localDate'] })
  }
  const hasGuestName = value.guestName !== undefined
  const hasGuestPhone = value.guestPhone !== undefined
  const hasGuestIdentity = hasGuestName || hasGuestPhone || value.guestEmail !== undefined

  if (hasGuestName !== hasGuestPhone) {
    context.addIssue({ code: 'custom', message: 'Gastnaam en gasttelefoon zijn samen verplicht.', path: ['guestName'] })
  }
  if (value.guestEmail !== undefined && (!hasGuestName || !hasGuestPhone)) {
    context.addIssue({ code: 'custom', message: 'Gastgegevens zijn verplicht wanneer een gast-e-mail wordt gebruikt.', path: ['guestEmail'] })
  }
  if (value.customerUserId !== undefined && hasGuestIdentity) {
    context.addIssue({ code: 'custom', message: 'Een afspraak kan niet tegelijk een customer en gast zijn.', path: ['customerUserId'] })
  }
})

export const appointmentIdSchema = z.object({ id: z.string().uuid() })

export const appointmentSnapshotSchema = z.object({
  serviceNameAtBooking: z.string().min(1),
  servicePriceCentsAtBooking: z.number().int().min(0),
  serviceDurationMinutesAtBooking: z.number().int().min(1),
  bufferMinutesAtBooking: z.number().int().min(0),
})

export const appointmentListSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).superRefine((value, context) => {
  if (value.from && value.to && value.from >= value.to) {
    context.addIssue({ code: 'custom', message: 'De eindtijd moet na de starttijd liggen.', path: ['to'] })
  }
})

export const appointmentStatusUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['confirmed', 'in_progress', 'completed', 'no_show']),
})

export const appointmentModifySchema = z.object({
  id: z.string().uuid(),
  serviceId: z.string().uuid().optional(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  customerUserId: z.string().uuid().optional(),
  overrideOpeningHours: z.boolean().default(false),
  overrideBreak: z.boolean().default(false),
  overrideWholeDayBlock: z.boolean().default(false),
  confirmOverlap: z.boolean().default(false),
}).superRefine((value, context) => {
  const hasDateTime = value.localDate !== undefined || value.localTime !== undefined
  if (hasDateTime && (!value.localDate || !value.localTime)) {
    context.addIssue({ code: 'custom', message: 'Lokale datum en tijd zijn samen verplicht.', path: ['localDate'] })
  }
  if (value.serviceId === undefined && !hasDateTime && value.customerUserId === undefined) {
    context.addIssue({ code: 'custom', message: 'Geef een wijziging op voor dienst, datum/tijd of customer.', path: ['serviceId'] })
  }
})

export const appointmentCancelSchema = z.object({ id: z.string().uuid() })

export const cancellationRequestCreateSchema = z.object({
  appointmentId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
})

export const cancellationRequestIdSchema = z.object({ id: z.string().uuid() })

export const cancellationRequestListSchema = z.object({
  appointmentId: z.string().uuid().optional(),
})

export type AppointmentStatusUpdateInput = z.infer<typeof appointmentStatusUpdateSchema>
export type AppointmentModifyInput = z.infer<typeof appointmentModifySchema>
export type CancellationRequestCreateInput = z.infer<typeof cancellationRequestCreateSchema>
export type CancellationRequestListInput = z.infer<typeof cancellationRequestListSchema>

export type AppointmentCreateInput = z.infer<typeof appointmentCreateSchema>
export type AppointmentListInput = z.infer<typeof appointmentListSchema>
export type AppointmentSnapshot = z.infer<typeof appointmentSnapshotSchema>
