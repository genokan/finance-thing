import type { Debt, Account } from '../generated/prisma/client'

/** Standard amortized monthly payment. APR 0 → straight principal / term. */
export function minimumPayment(principal: number, aprPercent: number, termMonths: number | null): number {
  if (!termMonths || termMonths <= 0 || principal <= 0) return 0
  const r = aprPercent / 100 / 12
  if (r === 0) return principal / termMonths
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths))
}

export type DebtWithAccount = Debt & { account?: Account | null }

/**
 * Resolve a debt's principal (linked account balance wins), its amortized
 * minimum payment, the user's actual override, and the effective payment used
 * everywhere (actual if set, otherwise the minimum).
 */
export function debtPaymentInfo(debt: DebtWithAccount) {
  // Current amount owed: a linked account's balance wins, else the debt's own balance.
  const balance = debt.account ? Number(debt.account.balance) : Number(debt.principal)
  // Amortize from the original loan amount when recorded; fall back to the current
  // balance for informal/older debts without an original principal. balance ≠ principal.
  const amortBasis = debt.originalPrincipal != null ? Number(debt.originalPrincipal) : balance
  const minimum = minimumPayment(amortBasis, Number(debt.apr), debt.termMonths)
  const actual = Number(debt.monthlyPayment)
  const effective = actual > 0 ? actual : minimum
  const round2 = (n: number) => Math.round(n * 100) / 100
  // `principalValue` (not `principal`) so spreading this onto a Debt doesn't clobber the raw column.
  return { principalValue: round2(balance), minimumPayment: round2(minimum), actualPayment: round2(actual), effectivePayment: round2(effective) }
}
