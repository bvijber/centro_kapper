import { z } from 'zod'

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Gebruik een geldige tijd.')
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Gebruik een geldige datum.').refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}, 'Gebruik een geldige datum.')

export const businessProfileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(500),
  phone: z.string().trim().min(1).max(32),
})

export const openingHourSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  isOpen: z.boolean(),
  openingTime: timeSchema.nullable(),
  closingTime: timeSchema.nullable(),
}).superRefine((value, context) => {
  if (!value.isOpen) return
  if (!value.openingTime || !value.closingTime) {
    context.addIssue({ code: 'custom', message: 'Openingstijden zijn verplicht op open dagen.', path: ['openingTime'] })
    return
  }
  if (value.openingTime >= value.closingTime) {
    context.addIssue({ code: 'custom', message: 'De sluitingstijd moet na de openingstijd liggen.', path: ['closingTime'] })
  }
})

export const openingHoursUpdateSchema = z.object({
  openingHours: z.array(openingHourSchema).length(7),
}).superRefine(({ openingHours }, context) => {
  const weekdays = new Set(openingHours.map((entry) => entry.weekday))
  if (weekdays.size !== 7 || [...weekdays].some((weekday) => weekday < 0 || weekday > 6)) {
    context.addIssue({ code: 'custom', message: 'Alle zeven unieke weekdagen zijn verplicht.', path: ['openingHours'] })
  }
})

export const breakPeriodCreateSchema = z.object({
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  note: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().optional().default(true),
}).superRefine((value, context) => {
  if (value.startsAt >= value.endsAt) {
    context.addIssue({ code: 'custom', message: 'Het einde moet na het begin liggen.', path: ['endsAt'] })
  }
})

export const breakPeriodDeleteSchema = z.object({ id: z.string().uuid() })

export const wholeDayBlockCreateSchema = z.object({
  blockDate: dateSchema,
  note: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().optional().default(true),
})

export const wholeDayBlockDeleteSchema = z.object({ id: z.string().uuid() })

export type BusinessProfileUpdate = z.infer<typeof businessProfileUpdateSchema>
export type OpeningHoursUpdate = z.infer<typeof openingHoursUpdateSchema>
export type BreakPeriodCreate = z.infer<typeof breakPeriodCreateSchema>
export type WholeDayBlockCreate = z.infer<typeof wholeDayBlockCreateSchema>
