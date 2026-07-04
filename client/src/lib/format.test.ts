import { describe, it, expect } from 'vitest'
import { money, percent, monthLabel, intervalLabel, daysUntil } from './format'

describe('money', () => {
  it('formats whole dollars by default and cents on request', () => {
    expect(money(1234.56)).toBe('$1,235')
    expect(money(1234.56, true)).toBe('$1,234.56')
  })

  it('never renders signed zero (regression: "-$0" debt tile)', () => {
    expect(money(-0)).toBe('$0')
    expect(money(-0.004)).toBe('$0')
    expect(money('-0')).toBe('$0')
  })

  it('handles strings, null, undefined, and garbage', () => {
    expect(money('250')).toBe('$250')
    expect(money(null)).toBe('$0')
    expect(money(undefined)).toBe('$0')
    expect(money('not-a-number')).toBe('$0')
  })

  it('formats negatives', () => {
    expect(money(-18500)).toBe('-$18,500')
  })
})

describe('percent', () => {
  it('defaults to one decimal place', () => {
    expect(percent(31.745)).toBe('31.7%')
    expect(percent(6.9, 2)).toBe('6.90%')
  })
})

describe('monthLabel', () => {
  it('renders month + year', () => {
    expect(monthLabel(2026, 7)).toBe('Jul 2026')
    expect(monthLabel(2027, 1)).toBe('Jan 2027')
  })
})

describe('intervalLabel', () => {
  it('uses natural words for single intervals', () => {
    expect(intervalLabel(1, 'MONTH')).toBe('monthly')
    expect(intervalLabel(1, 'YEAR')).toBe('yearly')
  })

  it('spells out multi-unit intervals', () => {
    expect(intervalLabel(2, 'WEEK')).toBe('every 2 weeks')
  })
})

describe('daysUntil', () => {
  it('returns null without a date and a positive count for future dates', () => {
    expect(daysUntil(null)).toBeNull()
    const inTen = new Date(Date.now() + 10 * 86400000).toISOString()
    expect(daysUntil(inTen)).toBeGreaterThanOrEqual(9)
    expect(daysUntil(inTen)).toBeLessThanOrEqual(10)
  })
})
