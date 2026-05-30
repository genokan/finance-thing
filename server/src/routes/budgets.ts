import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { toMonthlyEquivalent } from '../lib/monthlyEquivalent'
import type { IntervalUnit } from '@prisma/client'

export const budgetsRouter = Router()

const r2 = (n: number) => Math.round(n * 100) / 100

// Budget overview: per-category actual (recurring expense monthly equivalent) vs
// target, plus the 50/30/20 roll-up by bucket against monthly income.
budgetsRouter.get('/', async (req, res) => {
  const uid = req.userId
  const [categories, expenses, incomeSources] = await Promise.all([
    prisma.category.findMany({ where: { userId: uid, isActive: true } }),
    prisma.expenseItem.findMany({ where: { userId: uid, isActive: true, kind: 'RECURRING' } }),
    prisma.incomeSource.findMany({ where: { userId: uid, isActive: true } }),
  ])

  const monthlyOf = (amount: unknown, count: number, unit: IntervalUnit) =>
    toMonthlyEquivalent(Number(amount), count, unit)

  const actualByCategory = new Map<string, number>()
  for (const e of expenses) {
    if (!e.categoryId) continue
    actualByCategory.set(
      e.categoryId,
      (actualByCategory.get(e.categoryId) ?? 0) + monthlyOf(e.amount, e.intervalCount, e.intervalUnit),
    )
  }

  const lines = categories.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    bucket: c.bucket,
    monthlyBudget: c.monthlyBudget != null ? Number(c.monthlyBudget) : null,
    actual: r2(actualByCategory.get(c.id) ?? 0),
  }))

  const totalIncome = incomeSources.reduce((s, i) => {
    // approximate monthly gross for the roll-up denominator
    if (i.grossAnnual != null) return s + Number(i.grossAnnual) / 12
    if (i.grossPerPaycheck != null) {
      const periods = { WEEKLY: 52, BIWEEKLY: 26, SEMIMONTHLY: 24, MONTHLY: 12, ANNUAL: 1 }[i.payFrequency]
      return s + (Number(i.grossPerPaycheck) * periods) / 12
    }
    return s
  }, 0)

  const buckets = (['ESSENTIAL', 'DISCRETIONARY', 'SAVINGS'] as const).map((bucket) => {
    const actual = lines.filter((l) => l.bucket === bucket).reduce((s, l) => s + l.actual, 0)
    return {
      bucket,
      actual: r2(actual),
      percentOfIncome: totalIncome > 0 ? r2((actual / totalIncome) * 100) : 0,
    }
  })

  res.json({ totalMonthlyIncome: r2(totalIncome), buckets, categories: lines })
})
