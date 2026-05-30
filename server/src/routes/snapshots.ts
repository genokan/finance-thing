import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'
import { toMonthlyEquivalent } from '../lib/monthlyEquivalent'
import type { IntervalUnit } from '@prisma/client'

export const snapshotsRouter = Router()

const snapshotSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})

async function buildSnapshot(userId: string, year: number, month: number) {
  const [expenses, incomeSources, investments, debts] = await Promise.all([
    prisma.expenseItem.findMany({ where: { userId, isActive: true } }),
    prisma.incomeSource.findMany({ where: { userId, isActive: true } }),
    prisma.investmentAccount.findMany({ where: { userId, isActive: true } }),
    prisma.debt.findMany({ where: { userId, isActive: true } }),
  ])

  const totalInvestments = investments.reduce((s, a) => s + Number(a.currentValue), 0)
  const totalDebt = debts.reduce((s, d) => s + Number(d.principal), 0)

  await prisma.monthlySnapshot.deleteMany({ where: { userId, year, month } })

  return prisma.monthlySnapshot.create({
    data: {
      userId, year, month,
      netWorth: totalInvestments - totalDebt,
      expenses: { create: expenses.map(e => ({ expenseItemId: e.id, monthlyEquivalent: toMonthlyEquivalent(Number(e.amount), e.intervalCount, e.intervalUnit as IntervalUnit) })) },
      income: { create: incomeSources.map(s => ({ incomeSourceId: s.id, amount: s.amount })) },
      investments: { create: investments.map(a => ({ investmentAccountId: a.id, value: a.currentValue, unvestedValue: a.unvestedValue })) },
      debts: { create: debts.map(d => ({ debtId: d.id, principal: d.principal, monthlyPayment: d.monthlyPayment })) },
    },
    include: { expenses: true, income: true, investments: true, debts: true },
  })
}

snapshotsRouter.get('/', async (req, res) => {
  const snapshots = await prisma.monthlySnapshot.findMany({ where: { userId: req.userId }, orderBy: [{ year: 'desc' }, { month: 'desc' }], select: { id: true, year: true, month: true, netWorth: true, createdAt: true } })
  res.json(snapshots)
})

snapshotsRouter.post('/', validate(snapshotSchema), async (req, res) => {
  const { year, month } = req.body as z.infer<typeof snapshotSchema>
  const snapshot = await buildSnapshot(req.userId, year, month)
  res.status(201).json(snapshot)
})

snapshotsRouter.get('/:year/:month', async (req, res) => {
  const year = parseInt(req.params.year, 10)
  const month = parseInt(req.params.month, 10)
  const snapshot = await prisma.monthlySnapshot.findUnique({
    where: { userId_year_month: { userId: req.userId, year, month } },
    include: {
      expenses: { include: { expenseItem: { include: { category: true } } } },
      income: { include: { incomeSource: true } },
      investments: { include: { investmentAccount: { include: { institution: true } } } },
      debts: { include: { debt: true } },
    },
  })
  if (!snapshot) { res.status(404).json({ error: 'Not found' }); return }
  res.json(snapshot)
})
