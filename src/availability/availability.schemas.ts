import { z } from 'zod'

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

export const availabilitySchema = z.object({
  serviceId: z.string().uuid(),
  date: z.string().regex(datePattern, 'Gebruik een geldige datum.'),
})

export const appointmentLocalDateTimeSchema = z.object({
  date: z.string().regex(datePattern, 'Gebruik een geldige datum.'),
  time: z.string().regex(timePattern, 'Gebruik een geldige tijd.'),
})

export type AvailabilityInput = z.infer<typeof availabilitySchema>
