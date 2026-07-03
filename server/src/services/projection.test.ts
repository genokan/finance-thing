import { describe, it, expect } from 'vitest'
import { project, type ProjectionInputs, type Assumptions, type Modifier, type ProjectionResult } from './projection'
import { minimumPayment } from '../lib/debtPayment'

const noFlow: Omit<ProjectionInputs, 'accounts' | 'debts'> = {
  netMonthlyIncome: 0,
  monthlyExpenses: 0,
  contributions: [],
}

const base = (over: Partial<ProjectionInputs> = {}): ProjectionInputs => ({
  accounts: [],
  debts: [],
  ...noFlow,
  ...over,
})

const assume = (over: Partial<Assumptions> = {}): Assumptions => ({
  horizonMonths: 12,
  savingsRatePct: 100,
  investmentReturnPct: 7,
  ...over,
})

const cash = (value: number, apy = 0) =>
  ({ id: 'c1', name: 'Checking', kind: 'CASH', value, annualRatePct: apy }) as const

const invest = (value: number) => ({ id: 'i1', name: 'Brokerage', kind: 'INVESTMENT', value }) as const

/** Point at a simulated month offset (0 = today's anchor). */
function at(r: ProjectionResult, month: number) {
  const p = r.points.find((x) => x.month === month)
  if (!p) throw new Error(`no point for month ${month}`)
  return p
}

describe('series shape', () => {
  it('anchors the series at month 0 with current values', () => {
    const r = project(base({ accounts: [cash(1234), invest(5000)] }), assume({ horizonMonths: 6 }), [])
    expect(r.points).toHaveLength(7)
    expect(at(r, 0)).toMatchObject({ cash: 1234, investments: 5000, netWorth: 6234, debt: 0 })
  })
})

describe('account growth', () => {
  it('compounds an investment account at the assumed return (closed form)', () => {
    const r = project(base({ accounts: [invest(10000)] }), assume({ horizonMonths: 120 }), [])
    const expected = 10000 * Math.pow(1 + 0.07 / 12, 120)
    expect(at(r, 120).investments).toBeCloseTo(expected, 0)
  })

  it('compounds cash at its APY and leaves FLAT accounts alone', () => {
    const r = project(
      base({
        accounts: [cash(1000, 4.5), { id: 'f', name: 'Old card', kind: 'FLAT', value: -500 }],
      }),
      assume({ horizonMonths: 12 }),
      [],
    )
    expect(at(r, 12).cash).toBeCloseTo(1000 * Math.pow(1 + 0.045 / 12, 12), 2)
    expect(at(r, 12).netWorth).toBeCloseTo(at(r, 12).cash - 500, 2)
  })
})

describe('debt amortization', () => {
  it('pays a loan off exactly on schedule with the amortized minimum', () => {
    const pmt = minimumPayment(12000, 6, 24)
    const r = project(
      base({ debts: [{ id: 'd1', name: 'Car', principal: 12000, aprPct: 6, payment: pmt }] }),
      assume({ horizonMonths: 30 }),
      [],
    )
    expect(r.debtFreeMonth).toBe(24)
    expect(r.debtPayoffs).toEqual([{ name: 'Car', month: 24 }])
    expect(at(r, 24).debt).toBe(0)
  })

  it('frees the payment into savings after payoff', () => {
    // 1000 @ 0% with 500/mo payment dies in month 2; income exactly covers the
    // payment, so months 3+ save the full 500 while months 1-2 save nothing.
    const r = project(
      base({
        accounts: [cash(0)],
        debts: [{ id: 'd1', name: 'Loan', principal: 1000, aprPct: 0, payment: 500 }],
        netMonthlyIncome: 500,
      }),
      assume({ horizonMonths: 4 }),
      [],
    )
    expect(at(r, 2).cash).toBe(0)
    expect(at(r, 3).cash).toBe(500)
    expect(at(r, 4).cash).toBe(1000)
  })

  it('returns only the remaining balance to flow in the final month', () => {
    // 300 owed, 500/mo payment: month 1 pays 300, the spare 200 stays in flow.
    const r = project(
      base({
        accounts: [cash(0)],
        debts: [{ id: 'd1', name: 'Tail', principal: 300, aprPct: 0, payment: 500 }],
        netMonthlyIncome: 500,
      }),
      assume({ horizonMonths: 1 }),
      [],
    )
    expect(at(r, 1).cash).toBe(200)
    expect(r.debtFreeMonth).toBe(1)
  })

  it('flips a 0% promo to the post-promo APR on schedule', () => {
    const promo = project(
      base({ debts: [{ id: 'd', name: 'Card', principal: 10000, aprPct: 0, payment: 0, promoMonthsLeft: 6, postPromoAprPct: 24 }] }),
      assume({ horizonMonths: 7 }),
      [],
    )
    expect(at(promo, 6).debt).toBe(10000) // months 1-6: 0%
    expect(at(promo, 7).debt).toBeCloseTo(10000 * (1 + 0.24 / 12), 2) // month 7: 24%
  })
})

describe('cash flow settlement', () => {
  it('saves surplus at the savings rate', () => {
    const r = project(
      base({ accounts: [cash(0)], netMonthlyIncome: 4000, monthlyExpenses: 3000 }),
      assume({ horizonMonths: 3, savingsRatePct: 50 }),
      [],
    )
    expect(at(r, 3).cash).toBe(1500) // 1000 surplus × 50% × 3 months
  })

  it('drains cash in full on a deficit', () => {
    const r = project(
      base({ accounts: [cash(5000)], netMonthlyIncome: 1000, monthlyExpenses: 1400 }),
      assume({ horizonMonths: 2, savingsRatePct: 50 }),
      [],
    )
    expect(at(r, 2).cash).toBe(5000 - 800)
  })

  it('routes contributions into their destination account', () => {
    const r = project(
      base({
        accounts: [cash(0), invest(0)],
        netMonthlyIncome: 1000,
        contributions: [{ monthlyAmount: 600, accountId: 'i1' }],
      }),
      assume({ horizonMonths: 1, savingsRatePct: 0, investmentReturnPct: 0 }),
      [],
    )
    expect(at(r, 1).investments).toBe(600)
    expect(at(r, 1).cash).toBe(0) // remaining 400 surplus × 0% saved
  })

  it('sends EXTRA_DEBT contributions to the highest-APR debt first', () => {
    const r = project(
      base({
        debts: [
          { id: 'a', name: 'Low', principal: 1000, aprPct: 3, payment: 0 },
          { id: 'b', name: 'High', principal: 1000, aprPct: 20, payment: 0 },
        ],
        netMonthlyIncome: 100,
        contributions: [{ monthlyAmount: 100, extraDebt: true }],
      }),
      assume({ horizonMonths: 1 }),
      [],
    )
    // High-APR debt got the 100 after its 20%/12 interest accrued.
    expect(at(r, 1).debt).toBeCloseTo(1000 * (1 + 0.03 / 12) + 1000 * (1 + 0.2 / 12) - 100, 2)
  })
})

describe('modifiers', () => {
  it('ONE_TIME hits cash in its month only', () => {
    const mods: Modifier[] = [{ type: 'ONE_TIME', month: 2, amount: -20000 }]
    const r = project(base({ accounts: [cash(50000)] }), assume({ horizonMonths: 3 }), mods)
    expect(at(r, 1).cash).toBe(50000)
    expect(at(r, 2).cash).toBe(30000)
    expect(at(r, 3).cash).toBe(30000)
  })

  it('RECURRING without a return adjusts free cash flow', () => {
    const mods: Modifier[] = [{ type: 'RECURRING', startMonth: 1, monthlyAmount: -300 }]
    const r = project(
      base({ accounts: [cash(0)], netMonthlyIncome: 1000 }),
      assume({ horizonMonths: 2, savingsRatePct: 100 }),
      mods,
    )
    expect(at(r, 2).cash).toBe(1400) // (1000 − 300) × 2
  })

  it('RECURRING with a return compounds in its own asset and honors endMonth', () => {
    const mods: Modifier[] = [{ type: 'RECURRING', startMonth: 1, endMonth: 12, monthlyAmount: 500, annualReturnPct: 12 }]
    const r = project(base({ netMonthlyIncome: 500 }), assume({ horizonMonths: 24, savingsRatePct: 0 }), mods)
    // Ordinary annuity at 1%/mo for 12 months, then growth-only for 12 more.
    const fv12 = 500 * ((Math.pow(1.01, 12) - 1) / 0.01)
    expect(at(r, 12).investments).toBeCloseTo(fv12, 2)
    expect(at(r, 24).investments).toBeCloseTo(fv12 * Math.pow(1.01, 12), 2)
  })

  it('NEW_ASSET unfinanced: cash out, asset appreciates', () => {
    const mods: Modifier[] = [{ type: 'NEW_ASSET', month: 1, cost: 100000, annualReturnPct: 3 }]
    const r = project(base({ accounts: [cash(150000)] }), assume({ horizonMonths: 13 }), mods)
    expect(at(r, 1).cash).toBe(50000)
    expect(at(r, 1).investments).toBe(100000)
    expect(at(r, 13).investments).toBeCloseTo(100000 * Math.pow(1 + 0.03 / 12, 12), 2)
  })

  it('NEW_ASSET financed: creates a debt that amortizes to zero on term', () => {
    const mods: Modifier[] = [
      { type: 'NEW_ASSET', month: 1, cost: 300000, downPayment: 60000, annualReturnPct: 3, financeAprPct: 6.5, financeTermMonths: 360, monthlyCashFlow: 400, label: 'Rental' },
    ]
    const r = project(
      base({ accounts: [cash(100000)], netMonthlyIncome: 2000 }),
      assume({ horizonMonths: 400, savingsRatePct: 0 }),
      mods,
    )
    expect(at(r, 1).cash).toBe(40000)
    expect(at(r, 1).debt).toBe(240000) // owed at purchase; first payment next month
    // The purchase itself is net-worth-neutral: +300k asset, −60k cash, −240k debt.
    expect(at(r, 1).netWorth).toBe(100000)
    expect(at(r, 2).debt).toBeCloseTo(240000 * (1 + 0.065 / 12) - minimumPayment(240000, 6.5, 360), 0)
    expect(r.debtPayoffs.some((p) => p.name === 'Rental' && p.month === 361)).toBe(true)
    expect(at(r, 361).debt).toBe(0)
  })
})
