import type { IntervalUnit } from '@prisma/client'

const UNIT_DAYS: Record<IntervalUnit, number> = {
  DAY: 1,
  WEEK: 7,
  MONTH: 30.44,
  YEAR: 365.25,
}

const DAYS_PER_MONTH = 30.44

export function toMonthlyEquivalent(
  amount: number,
  intervalCount: number,
  intervalUnit: IntervalUnit
): number {
  const totalDays = intervalCount * UNIT_DAYS[intervalUnit]
  return (amount / totalDays) * DAYS_PER_MONTH
}
