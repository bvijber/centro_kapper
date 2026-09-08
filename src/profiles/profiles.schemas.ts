import { z } from 'zod'

const phoneSchema = z.string().trim().min(6).max(32)

export const customerProfileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: phoneSchema,
})

export const staffProfileUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  phone: phoneSchema,
})

export type CustomerProfileUpdateInput = z.infer<typeof customerProfileUpdateSchema>
export type StaffProfileUpdateInput = z.infer<typeof staffProfileUpdateSchema>