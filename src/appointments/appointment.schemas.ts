import { z } from 'zod'

const optionalText = z.string().trim().min(1).optional()

export const appointmentCreateSchema = z.object({
  serviceId: z.string().uuid(),
  startsAt: z.coerce.date(),
  customerUserId: z.string().uuid().optional(),
  guestName: optionalText,
  guestPhone: optionalText,
  guestEmail: z.string().trim().email().max(320).optional(),
  note: z.string().trim().optional(),
  overrideOpeningHours: z.boolean().default(false),
  overrideBreak: z.boolean().default(false),
  overrideWholeDayBlock: z.boolean().default(false),
}).superRefine((value, context) => {
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

export type AppointmentCreateInput = z.infer<typeof appointmentCreateSchema>
export type AppointmentListInput = z.infer<typeof appointmentListSchema>
export type AppointmentSnapshot = z.infer<typeof appointmentSnapshotSchema>
