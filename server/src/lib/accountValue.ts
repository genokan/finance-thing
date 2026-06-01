import type { Account, Holding, AccountKind } from '../generated/prisma/client'

export type AccountWithHoldings = Account & { holdings?: Holding[] }

const CASH_KINDS: AccountKind[] = ['CHECKING', 'SAVINGS', 'MONEY_MARKET']
const LIABILITY_KINDS: AccountKind[] = ['CREDIT_CARD', 'LOAN', 'LINE_OF_CREDIT', 'MORTGAGE']

/** Current value of an account: its balance, or the sum of active holdings. */
export function accountValue(account: AccountWithHoldings): number {
  if (account.trackingMode === 'HOLDINGS') {
    return (account.holdings ?? [])
      .filter((h) => h.isActive)
      .reduce((sum, h) => sum + Number(h.value), 0)
  }
  return Number(account.balance)
}

/** Unvested (e.g. RSU) value held in the account — excluded from liquid net worth. */
export function accountUnvested(account: AccountWithHoldings): number {
  return (account.holdings ?? [])
    .filter((h) => h.isActive)
    .reduce((sum, h) => sum + Number(h.unvestedValue ?? 0), 0)
}

export function isCashKind(kind: AccountKind): boolean {
  return CASH_KINDS.includes(kind)
}

export function isLiabilityKind(kind: AccountKind): boolean {
  return LIABILITY_KINDS.includes(kind)
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Attach a computed `value`/`unvestedValue` to an account for API responses. */
export function withValue<T extends AccountWithHoldings>(account: T) {
  return { ...account, value: round2(accountValue(account)), unvestedValue: round2(accountUnvested(account)) }
}
