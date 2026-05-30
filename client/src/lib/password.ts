// Mirror of the server password policy (server enforces it authoritatively).
export const PASSWORD_RULES = 'At least 8 characters with an uppercase letter, a lowercase letter, and a number.'

export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters'
  if (!/[a-z]/.test(pw)) return 'Add a lowercase letter'
  if (!/[A-Z]/.test(pw)) return 'Add an uppercase letter'
  if (!/[0-9]/.test(pw)) return 'Add a number'
  return null
}
