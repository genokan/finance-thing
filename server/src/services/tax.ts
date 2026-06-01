import type { FilingStatus, IncomeSource, IncomeDeduction, PayFrequency, TaxMode } from '../generated/prisma/client'
import {
  STANDARD_DEDUCTION,
  SS_RATE,
  SS_WAGE_BASE,
  MEDICARE_RATE,
  ADDL_MEDICARE_RATE,
  ADDL_MEDICARE_THRESHOLD,
  federalTax,
} from '../lib/tax/2026'

const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  WEEKLY: 52,
  BIWEEKLY: 26,
  SEMIMONTHLY: 24,
  MONTHLY: 12,
  ANNUAL: 1,
}

export interface TaxBreakdown {
  mode: TaxMode
  grossAnnual: number
  federal: number
  socialSecurity: number
  medicare: number
  state: number
  preTaxDeductions: number
  postTaxDeductions: number
  netAnnual: number
  netMonthly: number
  effectiveRate: number // total tax / gross
}

type SourceForTax = Pick<
  IncomeSource,
  'grossAnnual' | 'grossPerPaycheck' | 'payFrequency' | 'taxMode' | 'flatEffectiveRate' | 'filingStatus' | 'stateRate'
> & { deductions?: IncomeDeduction[] }

const r2 = (n: number) => Math.round(n * 100) / 100

/** Annualize gross from either an annual figure or a per-paycheck amount. */
export function annualGross(src: SourceForTax): number {
  if (src.grossAnnual != null) return Number(src.grossAnnual)
  if (src.grossPerPaycheck != null) return Number(src.grossPerPaycheck) * PERIODS_PER_YEAR[src.payFrequency]
  return 0
}

function annualDeductions(src: SourceForTax) {
  let preTax = 0
  let postTax = 0
  for (const d of src.deductions ?? []) {
    const annual = Number(d.amount) * PERIODS_PER_YEAR[src.payFrequency]
    if (d.preTax) preTax += annual
    else postTax += annual
  }
  return { preTax, postTax }
}

/**
 * Estimate take-home for an income source.
 * FLAT: total tax = gross * flatEffectiveRate.
 * BRACKET: real federal brackets + FICA + flat state rate; pre-tax deductions
 * reduce federal/state taxable income. FICA is approximated on gross.
 */
export function estimateTax(
  src: SourceForTax,
  userDefaults: { filingStatus: FilingStatus | null; stateRate: number | null },
): TaxBreakdown {
  const gross = annualGross(src)
  const { preTax, postTax } = annualDeductions(src)

  if (src.taxMode === 'FLAT') {
    const rate = Number(src.flatEffectiveRate ?? 0)
    const totalTax = gross * rate
    const net = gross - totalTax - preTax - postTax
    return {
      mode: 'FLAT',
      grossAnnual: r2(gross),
      federal: r2(totalTax),
      socialSecurity: 0,
      medicare: 0,
      state: 0,
      preTaxDeductions: r2(preTax),
      postTaxDeductions: r2(postTax),
      netAnnual: r2(net),
      netMonthly: r2(net / 12),
      effectiveRate: gross > 0 ? r2((totalTax / gross) * 100) / 100 : 0,
    }
  }

  const status = src.filingStatus ?? userDefaults.filingStatus ?? 'SINGLE'
  const stateRate = Number(src.stateRate ?? userDefaults.stateRate ?? 0)

  const taxable = Math.max(0, gross - preTax - STANDARD_DEDUCTION[status])
  const federal = federalTax(taxable, status)
  const socialSecurity = Math.min(gross, SS_WAGE_BASE) * SS_RATE
  const medicare =
    gross * MEDICARE_RATE + Math.max(0, gross - ADDL_MEDICARE_THRESHOLD[status]) * ADDL_MEDICARE_RATE
  const state = Math.max(0, gross - preTax) * stateRate

  const totalTax = federal + socialSecurity + medicare + state
  const net = gross - totalTax - preTax - postTax

  return {
    mode: 'BRACKET',
    grossAnnual: r2(gross),
    federal: r2(federal),
    socialSecurity: r2(socialSecurity),
    medicare: r2(medicare),
    state: r2(state),
    preTaxDeductions: r2(preTax),
    postTaxDeductions: r2(postTax),
    netAnnual: r2(net),
    netMonthly: r2(net / 12),
    effectiveRate: gross > 0 ? r2((totalTax / gross) * 100) / 100 : 0,
  }
}
