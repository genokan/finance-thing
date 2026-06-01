import { describe, it, expect } from 'vitest'
import { toMonthlyEquivalent } from './monthlyEquivalent'

describe('toMonthlyEquivalent', () => {
  it('leaves a monthly amount effectively unchanged', () => {
    expect(toMonthlyEquivalent(100, 1, 'MONTH')).toBeCloseTo(100, 5)
  })

  it('annualizes a yearly amount down to ~1/12', () => {
    expect(toMonthlyEquivalent(1200, 1, 'YEAR')).toBeCloseTo(100, 1)
  })

  it('spreads a semiannual bill across months (CSV car insurance)', () => {
    // $997 every 6 months ≈ $166.17/mo, matching the source spreadsheet.
    expect(toMonthlyEquivalent(997, 6, 'MONTH')).toBeCloseTo(166.17, 1)
  })

  it('scales a weekly amount up to a month', () => {
    expect(toMonthlyEquivalent(10, 1, 'WEEK')).toBeCloseTo(43.49, 1)
  })
})
