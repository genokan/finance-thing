import { describe, it, expect } from 'vitest'
import { accountValue, accountUnvested, isCashKind, isLiabilityKind, withValue, type AccountWithHoldings } from './accountValue'

const acct = (over: Record<string, unknown>): AccountWithHoldings =>
  ({ trackingMode: 'BALANCE', balance: '0', holdings: [], ...over }) as unknown as AccountWithHoldings

const holding = (over: Record<string, unknown>) =>
  ({ isActive: true, value: '0', unvestedValue: null, ...over }) as never

describe('accountValue', () => {
  it('returns the balance for balance-tracked accounts', () => {
    expect(accountValue(acct({ trackingMode: 'BALANCE', balance: '425' }))).toBe(425)
  })

  it('sums active holdings for holdings-tracked accounts', () => {
    const a = acct({
      trackingMode: 'HOLDINGS',
      holdings: [holding({ value: '100' }), holding({ value: '50' }), holding({ value: '999', isActive: false })],
    })
    expect(accountValue(a)).toBe(150)
  })
})

describe('accountUnvested', () => {
  it('sums unvested value across holdings', () => {
    const a = acct({ holdings: [holding({ unvestedValue: '1000' }), holding({ unvestedValue: '200' })] })
    expect(accountUnvested(a)).toBe(1200)
  })
})

describe('kind predicates', () => {
  it('classifies cash kinds', () => {
    expect(isCashKind('CHECKING')).toBe(true)
    expect(isCashKind('BROKERAGE')).toBe(false)
  })

  it('classifies liability kinds', () => {
    expect(isLiabilityKind('MORTGAGE')).toBe(true)
    expect(isLiabilityKind('SAVINGS')).toBe(false)
  })
})

describe('withValue', () => {
  it('attaches rounded computed value and unvestedValue', () => {
    const a = withValue(acct({ trackingMode: 'BALANCE', balance: '100.005' }))
    expect(a.value).toBe(100.01)
    expect(a.unvestedValue).toBe(0)
  })
})
