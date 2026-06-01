import { describe, it, expect } from 'vitest'
import { federalTax } from '../lib/tax/2026'
import { annualGross, estimateTax } from './tax'

const NO_DEFAULTS = { filingStatus: null, stateRate: null }

describe('federalTax (progressive brackets)', () => {
  it('is zero at or below zero taxable income', () => {
    expect(federalTax(0, 'SINGLE')).toBe(0)
    expect(federalTax(-100, 'SINGLE')).toBe(0)
  })

  it('computes bracketed tax for a single filer at $50k taxable', () => {
    // 10% to 11,925 + 12% to 48,475 + 22% on the remainder = 5,914.00
    expect(federalTax(50000, 'SINGLE')).toBeCloseTo(5914, 0)
  })

  it('only taxes within the first bracket for low income', () => {
    expect(federalTax(10000, 'SINGLE')).toBeCloseTo(1000, 2)
  })
})

describe('annualGross', () => {
  it('uses the annual figure directly', () => {
    expect(annualGross({ grossAnnual: '159000', payFrequency: 'BIWEEKLY' } as never)).toBe(159000)
  })

  it('annualizes a per-paycheck amount by frequency', () => {
    expect(annualGross({ grossAnnual: null, grossPerPaycheck: '1000', payFrequency: 'BIWEEKLY' } as never)).toBe(26000)
  })
})

describe('estimateTax', () => {
  it('FLAT mode applies a single effective rate with no FICA', () => {
    const b = estimateTax(
      { grossAnnual: '100000', payFrequency: 'ANNUAL', taxMode: 'FLAT', flatEffectiveRate: '0.2' } as never,
      NO_DEFAULTS,
    )
    expect(b.federal).toBe(20000)
    expect(b.socialSecurity).toBe(0)
    expect(b.netAnnual).toBe(80000)
    expect(b.netMonthly).toBeCloseTo(6666.67, 1)
  })

  it('BRACKET mode includes federal + FICA + state and nets out positive', () => {
    const b = estimateTax(
      { grossAnnual: '159000', payFrequency: 'ANNUAL', taxMode: 'BRACKET', filingStatus: 'SINGLE', stateRate: '0.05' } as never,
      NO_DEFAULTS,
    )
    expect(b.federal).toBeGreaterThan(0)
    expect(b.socialSecurity).toBeCloseTo(159000 * 0.062, 0)
    expect(b.state).toBeCloseTo(159000 * 0.05, 0)
    expect(b.netAnnual).toBeLessThan(159000)
    expect(b.netMonthly).toBeGreaterThan(0)
  })

  it('pre-tax deductions reduce taxable income and take-home', () => {
    const withDeduction = estimateTax(
      {
        grossAnnual: '100000', payFrequency: 'MONTHLY', taxMode: 'BRACKET', filingStatus: 'SINGLE', stateRate: '0',
        deductions: [{ amount: '500', preTax: true }],
      } as never,
      NO_DEFAULTS,
    )
    expect(withDeduction.preTaxDeductions).toBe(6000)
    expect(withDeduction.netAnnual).toBeLessThan(100000)
  })
})
