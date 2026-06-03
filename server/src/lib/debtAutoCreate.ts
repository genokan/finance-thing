import type { AccountKind, DebtKind, DebtTerm, Prisma } from '../generated/prisma/client'
import { prisma } from './prisma'

const LIABILITY_KINDS: AccountKind[] = ['CREDIT_CARD', 'LOAN', 'LINE_OF_CREDIT', 'MORTGAGE']
export const isLiabilityKind = (k: AccountKind): boolean => LIABILITY_KINDS.includes(k)

// Mirror of the client's mapping in client/src/pages/Accounts.tsx so manual and
// Plaid-synced liabilities spawn the same kind of debt.
const ACCOUNT_TO_DEBT_KIND: Partial<Record<AccountKind, DebtKind>> = {
  CREDIT_CARD: 'CREDIT_CARD', MORTGAGE: 'MORTGAGE', LOAN: 'PERSONAL', LINE_OF_CREDIT: 'OTHER',
}

// Loans/mortgages are long-term; revolving credit defaults to short-term.
const LONG_TERM_KINDS: AccountKind[] = ['LOAN', 'MORTGAGE']

export interface LiabilityAccount {
  id: string
  userId: string
  name: string
  kind: AccountKind
  balance: Prisma.Decimal | number | string
  institutionId: string | null
}

/**
 * Pure: the Debt row to create for a liability account, or null if the account
 * isn't a liability. APR/payment/term are left blank for the user to fill in on
 * the Debt page — the linked account's balance is the source of truth for the
 * current amount owed (see debtPaymentInfo).
 */
export function debtDefaultsForAccount(account: LiabilityAccount): Prisma.DebtUncheckedCreateInput | null {
  if (!isLiabilityKind(account.kind)) return null
  return {
    userId: account.userId,
    name: account.name,
    accountId: account.id,
    kind: ACCOUNT_TO_DEBT_KIND[account.kind] ?? 'OTHER',
    term: (LONG_TERM_KINDS.includes(account.kind) ? 'LONG_TERM' : 'SHORT_TERM') as DebtTerm,
    principal: Number(account.balance),
    monthlyPayment: 0,
    apr: 0,
    institutionId: account.institutionId ?? undefined,
  }
}

/**
 * Idempotently ensure a liability account has a linked Debt. The manual "enter
 * once" account form spawns this debt client-side; Plaid-synced liabilities
 * never hit that path, so this backfills them so Credit Card / Loan / Mortgage
 * accounts appear on the Debt page ready for APR & payment entry. No-op for
 * non-liabilities or when an active linked debt already exists.
 */
export async function ensureDebtForAccount(account: LiabilityAccount): Promise<void> {
  const data = debtDefaultsForAccount(account)
  if (!data) return
  const existing = await prisma.debt.findFirst({
    where: { userId: account.userId, accountId: account.id, isActive: true },
    select: { id: true },
  })
  if (existing) return
  await prisma.debt.create({ data })
}
