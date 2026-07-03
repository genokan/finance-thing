import { z } from 'zod'
import { minimumPayment } from '../lib/debtPayment'

// Deterministic month-by-month net-worth projection. Pure — no DB access, no
// dates: callers translate calendar dates into month offsets (1 = next month).
// All rates are annual percentages (7 = 7%/yr) compounded nominally (rate/12).

// ---------- Inputs ----------

export interface SimAccount {
  id: string
  name: string
  /** CASH grows at its own APY, INVESTMENT at the assumed return, FLAT not at all. */
  kind: 'CASH' | 'INVESTMENT' | 'FLAT'
  value: number
  /** APY for CASH; optional per-account override for INVESTMENT. */
  annualRatePct?: number | null
}

export interface SimDebt {
  id: string
  name: string
  principal: number
  aprPct: number
  /** Effective monthly payment (actual override or amortized minimum). */
  payment: number
  /** Months (offsets) the current APR still applies; afterwards postPromoAprPct kicks in. */
  promoMonthsLeft?: number | null
  postPromoAprPct?: number | null
}

export interface SimContribution {
  monthlyAmount: number
  /** Deposit target. Unmatched/absent falls back to the best cash account. */
  accountId?: string | null
  /** Extra principal toward the highest-APR live debt instead of a deposit. */
  extraDebt?: boolean
  /**
   * Withheld from pay before net income (401k/HSA/ESPP payroll deductions):
   * deposits into the account without touching monthly cash flow, which
   * already excludes it.
   */
  payroll?: boolean
}

export interface ProjectionInputs {
  accounts: SimAccount[]
  debts: SimDebt[]
  netMonthlyIncome: number
  monthlyExpenses: number
  contributions: SimContribution[]
}

export interface Assumptions {
  horizonMonths: number
  /** Share of positive unallocated cash flow that gets saved (rest assumed spent). */
  savingsRatePct: number
  /** Assumed annual return for investment accounts and default for new assets. */
  investmentReturnPct: number
}

// ---------- Modifiers (the scenario vocabulary) ----------

export const modifierSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ONE_TIME'),
    month: z.number().int().min(1).max(480),
    amount: z.number(), // + windfall into cash, − purchase out of cash
    label: z.string().max(120).optional(),
  }),
  z.object({
    type: z.literal('RECURRING'),
    startMonth: z.number().int().min(1).max(480),
    endMonth: z.number().int().min(1).max(480).nullish(),
    // With annualReturnPct: an invested flow compounding in its own asset.
    // Without: a change to free cash flow (+ save more / − spend more).
    monthlyAmount: z.number(),
    annualReturnPct: z.number().min(-50).max(100).nullish(),
    label: z.string().max(120).optional(),
  }),
  z.object({
    type: z.literal('NEW_ASSET'),
    month: z.number().int().min(1).max(480),
    cost: z.number().positive(),
    annualReturnPct: z.number().min(-50).max(100),
    downPayment: z.number().min(0).nullish(), // absent → paid in full from cash
    financeAprPct: z.number().min(0).max(100).nullish(),
    financeTermMonths: z.number().int().min(1).max(600).nullish(),
    monthlyCashFlow: z.number().nullish(), // e.g. net rent after costs
    label: z.string().max(120).optional(),
  }),
])

export type Modifier = z.infer<typeof modifierSchema>
export const modifiersSchema = z.array(modifierSchema).max(50)

// ---------- Output ----------

export interface ProjectionPoint {
  month: number // offset from now; 1 = first simulated month
  netWorth: number // assets − debts, excluding unvested RSUs
  cash: number
  investments: number // investment accounts + synthetic modifier assets
  debt: number
}

export interface ProjectionResult {
  points: ProjectionPoint[]
  debtPayoffs: { name: string; month: number }[]
  /** First month total debt reaches zero (having started above it). */
  debtFreeMonth: number | null
}

// ---------- Engine ----------

const r2 = (n: number) => Math.round(n * 100) / 100
const monthlyRate = (annualPct: number) => annualPct / 100 / 12

interface LiveDebt {
  name: string
  principal: number
  aprPct: number
  payment: number
  promoMonthsLeft: number
  postPromoAprPct: number | null
  startMonth: number // debt exists from this offset on (financed assets start late)
}

interface SyntheticAsset {
  value: number
  annualReturnPct: number
}

export function project(inputs: ProjectionInputs, assumptions: Assumptions, modifiers: Modifier[]): ProjectionResult {
  const horizon = Math.max(1, Math.min(480, Math.floor(assumptions.horizonMonths)))
  const savingsRate = Math.max(0, Math.min(100, assumptions.savingsRatePct)) / 100

  const accounts = inputs.accounts.map((a) => ({ ...a }))
  const debts: LiveDebt[] = inputs.debts.map((d) => ({
    name: d.name,
    principal: d.principal,
    aprPct: d.aprPct,
    payment: d.payment,
    promoMonthsLeft: d.promoMonthsLeft ?? 0,
    postPromoAprPct: d.postPromoAprPct ?? null,
    startMonth: 1,
  }))
  const synthetics: SyntheticAsset[] = []
  // Recurring invested flows each get their own compounding bucket.
  const recurringAssets = new Map<Modifier, SyntheticAsset>()

  // Surplus savings and one-time events need a cash home; prefer the best APY.
  let bestCash = accounts.filter((a) => a.kind === 'CASH').sort((x, y) => (y.annualRatePct ?? 0) - (x.annualRatePct ?? 0))[0]
  if (!bestCash) {
    bestCash = { id: '__cash__', name: 'Cash', kind: 'CASH', value: 0, annualRatePct: 0 }
    accounts.push(bestCash)
  }

  const growthRate = (a: SimAccount): number => {
    if (a.kind === 'CASH') return monthlyRate(a.annualRatePct ?? 0)
    if (a.kind === 'INVESTMENT') return monthlyRate(a.annualRatePct ?? assumptions.investmentReturnPct)
    return 0
  }

  const debtPayoffs: { name: string; month: number }[] = []
  const points: ProjectionPoint[] = []

  const record = (m: number) => {
    const cash = accounts.filter((a) => a.kind === 'CASH').reduce((s, a) => s + a.value, 0)
    const investments =
      accounts.filter((a) => a.kind === 'INVESTMENT').reduce((s, a) => s + a.value, 0) +
      synthetics.reduce((s, x) => s + x.value, 0)
    const flat = accounts.filter((a) => a.kind === 'FLAT').reduce((s, a) => s + a.value, 0)
    const debt = debts.reduce((s, d) => s + Math.max(0, d.principal), 0)
    points.push({
      month: m,
      netWorth: r2(cash + investments + flat - debt),
      cash: r2(cash),
      investments: r2(investments),
      debt: r2(debt),
    })
  }

  // Month 0 anchors every series at today's position.
  record(0)

  for (let m = 1; m <= horizon; m++) {
    // 1. Growth first: this month's flows don't earn this month's return.
    for (const a of accounts) a.value *= 1 + growthRate(a)
    for (const s of synthetics) s.value *= 1 + monthlyRate(s.annualReturnPct)

    // 2. Debt service. Freed payments simply stop being subtracted from flow.
    let flow = inputs.netMonthlyIncome - inputs.monthlyExpenses
    for (const d of debts) {
      if (d.principal <= 0 || m < d.startMonth) continue
      const promoActive = d.promoMonthsLeft >= m - d.startMonth + 1
      const apr = !promoActive && d.postPromoAprPct != null ? d.postPromoAprPct : d.aprPct
      d.principal *= 1 + monthlyRate(apr)
      const paid = Math.min(d.payment, d.principal)
      d.principal -= paid
      flow -= paid
      if (d.principal <= 0.005) {
        d.principal = 0
        debtPayoffs.push({ name: d.name, month: m })
      }
    }

    // 3. Contributions: out of flow, into their destination (or extra debt principal).
    for (const c of inputs.contributions) {
      if (c.extraDebt) {
        const target = debts.filter((d) => d.principal > 0 && m >= d.startMonth).sort((x, y) => y.aprPct - x.aprPct)[0]
        // No live debt left → the money just stays in unallocated flow.
        if (!target) continue
        const paid = Math.min(c.monthlyAmount, target.principal)
        target.principal -= paid
        flow -= paid
        if (target.principal <= 0.005) {
          target.principal = 0
          debtPayoffs.push({ name: target.name, month: m })
        }
        continue
      }
      const dest = (c.accountId && accounts.find((a) => a.id === c.accountId)) || bestCash
      dest.value += c.monthlyAmount
      if (!c.payroll) flow -= c.monthlyAmount
    }

    // 4. Modifiers.
    for (const mod of modifiers) {
      if (mod.type === 'ONE_TIME') {
        if (mod.month === m) bestCash.value += mod.amount
      } else if (mod.type === 'RECURRING') {
        if (m < mod.startMonth || (mod.endMonth != null && m > mod.endMonth)) continue
        if (mod.annualReturnPct != null) {
          let asset = recurringAssets.get(mod)
          if (!asset) {
            asset = { value: 0, annualReturnPct: mod.annualReturnPct }
            recurringAssets.set(mod, asset)
            synthetics.push(asset)
          }
          asset.value += mod.monthlyAmount
          flow -= mod.monthlyAmount
        } else {
          flow += mod.monthlyAmount
        }
      } else {
        // NEW_ASSET
        if (mod.month === m) {
          const down = mod.downPayment ?? mod.cost
          bestCash.value -= down
          synthetics.push({ value: mod.cost, annualReturnPct: mod.annualReturnPct })
          const financed = mod.cost - down
          if (financed > 0.005) {
            debts.push({
              name: mod.label ?? 'Financed asset',
              principal: financed,
              aprPct: mod.financeAprPct ?? 0,
              payment: minimumPayment(financed, mod.financeAprPct ?? 0, mod.financeTermMonths ?? 360),
              promoMonthsLeft: 0,
              postPromoAprPct: null,
              startMonth: m + 1,
            })
          }
        }
        if (m >= mod.month && mod.monthlyCashFlow) flow += mod.monthlyCashFlow
      }
    }

    // 5. Settle unallocated: save a share of surplus; deficits drain cash in full.
    if (flow > 0) bestCash.value += flow * savingsRate
    else bestCash.value += flow

    // 6. Record.
    record(m)
  }

  const startedWithDebt = (points[0]?.debt ?? 0) > 0
  const debtFreeMonth = startedWithDebt ? (points.find((p) => p.debt === 0)?.month ?? null) : null

  return { points, debtPayoffs, debtFreeMonth }
}
