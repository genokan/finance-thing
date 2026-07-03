import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { toMonthlyEquivalent } from '../lib/monthlyEquivalent'
import { estimateTax } from '../services/tax'
import type { BudgetBucket, IntervalUnit } from '../generated/prisma/client'

export const budgetsRouter = Router()

const r2 = (n: number) => Math.round(n * 100) / 100

// Budget overview: per-category actual (recurring expense monthly equivalent) vs
// target, plus the 50/30/20 roll-up by bucket against monthly income.
budgetsRouter.get('/', async (req, res) => {
  const uid = req.userId
  const [user, categories, expenses, incomeSources, contributions] = await Promise.all([
    prisma.user.findUnique({ where: { id: uid }, select: { filingStatus: true, stateRate: true } }),
    prisma.category.findMany({ where: { userId: uid, isActive: true } }),
    prisma.expenseItem.findMany({ where: { userId: uid, isActive: true, kind: 'RECURRING' } }),
    prisma.incomeSource.findMany({ where: { userId: uid, isActive: true }, include: { deductions: true } }),
    prisma.contribution.findMany({ where: { userId: uid, isActive: true } }),
  ])

  const monthlyOf = (amount: unknown, count: number, unit: IntervalUnit) =>
    toMonthlyEquivalent(Number(amount), count, unit)

  // Bucket (Needs/Wants/Savings) lives on the expense itself; category is an
  // optional sub-tag used only for the per-category budget-vs-actual lines.
  const actualByCategory = new Map<string, number>()
  const actualByBucket: Record<BudgetBucket, number> = { ESSENTIAL: 0, DISCRETIONARY: 0, SAVINGS: 0 }
  for (const e of expenses) {
    const monthly = monthlyOf(e.amount, e.intervalCount, e.intervalUnit)
    if (e.bucket) actualByBucket[e.bucket] += monthly
    if (e.categoryId) actualByCategory.set(e.categoryId, (actualByCategory.get(e.categoryId) ?? 0) + monthly)
  }

  const lines = categories.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    bucket: c.bucket,
    monthlyBudget: c.monthlyBudget != null ? Number(c.monthlyBudget) : null,
    actual: r2(actualByCategory.get(c.id) ?? 0),
  }))

  // Net take-home, matching the dashboard — 50/30/20 percentages must mean the
  // same thing on every page (they previously used gross here, net there).
  const defaults = { filingStatus: user?.filingStatus ?? null, stateRate: user?.stateRate != null ? Number(user.stateRate) : null }
  const totalIncome = incomeSources.reduce((s, i) => s + estimateTax(i, defaults).netMonthly, 0)

  // The savings bucket is mostly Contribution rows, not expenses — without
  // them it read $0 while the dashboard showed real savings.
  actualByBucket.SAVINGS += contributions.reduce((s, c) => s + monthlyOf(c.amount, c.intervalCount, c.intervalUnit), 0)

  const buckets = (['ESSENTIAL', 'DISCRETIONARY', 'SAVINGS'] as const).map((bucket) => {
    const actual = actualByBucket[bucket]
    return {
      bucket,
      actual: r2(actual),
      percentOfIncome: totalIncome > 0 ? r2((actual / totalIncome) * 100) : 0,
    }
  })

  res.json({ totalMonthlyIncome: r2(totalIncome), buckets, categories: lines })
})
