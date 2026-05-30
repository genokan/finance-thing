// Federal tax constants. Based on 2025 IRS figures as the working baseline for
// 2026 estimates — update these yearly. All values are annual USD.
import type { FilingStatus } from '@prisma/client'

export interface Bracket {
  upTo: number // upper bound of this bracket (Infinity for the top)
  rate: number // marginal rate as a fraction
}

export const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  SINGLE: 15000,
  MARRIED_JOINT: 30000,
  MARRIED_SEPARATE: 15000,
  HEAD_OF_HOUSEHOLD: 22500,
}

export const FEDERAL_BRACKETS: Record<FilingStatus, Bracket[]> = {
  SINGLE: [
    { upTo: 11925, rate: 0.1 },
    { upTo: 48475, rate: 0.12 },
    { upTo: 103350, rate: 0.22 },
    { upTo: 197300, rate: 0.24 },
    { upTo: 250525, rate: 0.32 },
    { upTo: 626350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  MARRIED_JOINT: [
    { upTo: 23850, rate: 0.1 },
    { upTo: 96950, rate: 0.12 },
    { upTo: 206700, rate: 0.22 },
    { upTo: 394600, rate: 0.24 },
    { upTo: 501050, rate: 0.32 },
    { upTo: 751600, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  MARRIED_SEPARATE: [
    { upTo: 11925, rate: 0.1 },
    { upTo: 48475, rate: 0.12 },
    { upTo: 103350, rate: 0.22 },
    { upTo: 197300, rate: 0.24 },
    { upTo: 250525, rate: 0.32 },
    { upTo: 375800, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  HEAD_OF_HOUSEHOLD: [
    { upTo: 17000, rate: 0.1 },
    { upTo: 64850, rate: 0.12 },
    { upTo: 103350, rate: 0.22 },
    { upTo: 197300, rate: 0.24 },
    { upTo: 250500, rate: 0.32 },
    { upTo: 626350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
}

// FICA
export const SS_RATE = 0.062
export const SS_WAGE_BASE = 176100
export const MEDICARE_RATE = 0.0145
export const ADDL_MEDICARE_RATE = 0.009
export const ADDL_MEDICARE_THRESHOLD: Record<FilingStatus, number> = {
  SINGLE: 200000,
  MARRIED_JOINT: 250000,
  MARRIED_SEPARATE: 125000,
  HEAD_OF_HOUSEHOLD: 200000,
}

/** Progressive federal income tax on a taxable amount for a filing status. */
export function federalTax(taxable: number, status: FilingStatus): number {
  if (taxable <= 0) return 0
  const brackets = FEDERAL_BRACKETS[status]
  let tax = 0
  let lower = 0
  for (const b of brackets) {
    const slice = Math.min(taxable, b.upTo) - lower
    if (slice > 0) tax += slice * b.rate
    if (taxable <= b.upTo) break
    lower = b.upTo
  }
  return tax
}
