import { z } from 'zod'

import { AuthError } from './auth.errors'

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MIN_MESSAGE = 'Je wachtwoord moet minimaal 8 tekens bevatten.'
export const INVALID_INPUT_MESSAGE = 'Controleer de ingevulde gegevens.'

const emailSchema = z.string().trim().email('Voer een geldig e-mailadres in.').max(320, 'Je e-mailadres is te lang.')

export const registerCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Je naam moet minimaal 2 tekens bevatten.').max(100, 'Je naam is te lang.'),
  email: emailSchema,
  phone: z.string().trim().min(6, 'Vul een geldig telefoonnummer in.').max(32, 'Je telefoonnummer is te lang.'),
  password: z.string().min(PASSWORD_MIN_LENGTH, PASSWORD_MIN_MESSAGE).max(256, 'Je wachtwoord is te lang.'),
})

export function parseRegisterCustomerInput(input: RegisterCustomerInput): RegisterCustomerInput {
  const result = registerCustomerSchema.safeParse(input)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  throw new AuthError(issue && issue.code !== 'invalid_type' ? issue.message : INVALID_INPUT_MESSAGE, 'VALIDATION_FAILED')
}

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
  role: 'customer' | 'owner'
  name: string
  phone: string
}
