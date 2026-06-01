import { describe, it, expect } from 'vitest'
import { minimumPayment, debtPaymentInfo, type DebtWithAccount } from './debtPayment'

describe('minimumPayment', () => {
  it('returns 0 when there is no term', () => {
    expect(minimumPayment(1000, 5, null)).toBe(0)
    expect(minimumPayment(1000, 5, 0)).toBe(0)
  })

  it('splits principal evenly for a 0% APR loan', () => {
    expect(minimumPayment(1200, 0, 12)).toBeCloseTo(100, 5)
  })

  it('amortizes an interest-bearing loan (car loan @ 2.74%/60mo)', () => {
    const pmt = minimumPayment(24282, 2.74, 60)
    expect(pmt).toBeGreaterThan(24282 / 60) // more than straight-line because of interest
    expect(pmt).toBeCloseTo(433.4, 0)
  })
})

const baseDebt = (over: Record<string, unknown>): DebtWithAccount =>
  ({ principal: '0', apr: '0', termMonths: null, monthlyPayment: '0', account: null, ...over }) as unknown as DebtWithAccount

describe('debtPaymentInfo', () => {
  it('prefers a linked account balance over the raw principal', () => {
    const info = debtPaymentInfo(baseDebt({ principal: '5000', account: { balance: '8000' } as never }))
    expect(info.principalValue).toBe(8000)
  })

  it('uses the actual payment when set, else the amortized minimum', () => {
    const withActual = debtPaymentInfo(baseDebt({ principal: '1200', termMonths: 12, monthlyPayment: '150' }))
    expect(withActual.actualPayment).toBe(150)
    expect(withActual.effectivePayment).toBe(150)

    const noActual = debtPaymentInfo(baseDebt({ principal: '1200', termMonths: 12, monthlyPayment: '0' }))
    expect(noActual.effectivePayment).toBeCloseTo(100, 2)
  })
})
