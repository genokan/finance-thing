import { z } from 'zod'

// Shared password policy. Mirrored on the client for UX, enforced here as the
// source of truth on every create / change / reset.
export const PASSWORD_RULES = 'At least 8 characters with an uppercase letter, a lowercase letter, and a number.'

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number')
