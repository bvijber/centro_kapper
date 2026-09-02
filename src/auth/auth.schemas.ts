import { z } from 'zod'

const emailSchema = z.string().trim().email().max(320)

export const registerCustomerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailSchema,
  phone: z.string().trim().min(6).max(32),
  password: z.string().min(12).max(256),
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
})

export const emptyAuthSchema = z.object({}).optional()

export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>
export type LoginInput = z.infer<typeof loginSchema>

export type SafeUser = {
  id: string
  email: string
  role: 'customer' | 'staff'
  name: string
  phone: string
}
