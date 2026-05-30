import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'
import { toMonthlyEquivalent } from '../lib/monthlyEquivalent'
import { accountValue, accountUnvested, isCashKind } from '../lib/accountValue'
import { estimateTax } from '../services/tax'
import type { IntervalUnit } from '@prisma/client'

export const snapshotsRouter = Router()

const snapshotSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})

// Capture a point-in-time snapshot. Idempotent per (user, year, month): replaces
// any existing snapshot for that month. Shared by the manual route and the cron job.
export async function buildSnapshot(userId: string, year: number, month: number) {
  const [user, accounts, expenses, incomeSources, debts] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { filingStatus: true, stateRate: true } }),
    prisma.account.findMany({ where: { userId, isActive: true }, include: { holdings: { where: { isActive: true } } } }),
    prisma.expenseItem.findMany({ where: { userId, isActive: true, kind: 'RECURRING' } }),
    prisma.incomeSource.findMany({ where: { userId, isActive: true }, include: { deductions: true } }),
    prisma.debt.findMany({ where: { userId, isActive: true } }),
  ])

  const defaults = { filingStatus: user?.filingStatus ?? null, stateRate: user?.stateRate != null ? Number(user.stateRate) : null }

  const liquidCash = accounts.filter((a) => isCashKind(a.kind)).reduce((s, a) => s + accountValue(a), 0)
  const vested = accounts.filter((a) => !isCashKind(a.kind)).reduce((s, a) => s + accountValue(a), 0)
  const unvested = accounts.reduce((s, a) => s + accountUnvested(a), 0)
  const totalDebt = debts.reduce((s, d) => s + Number(d.principal), 0)
  const liquidNetWorth = liquidCash + vested - totalDebt
  const netWorth = liquidNetWorth + unvested

  await prisma.monthlySnapshot.deleteMany({ where: { userId, year, month } })

  return prisma.monthlySnapshot.create({
    data: {
      userId, year, month, netWorth, liquidNetWorth,
      accounts: { create: accounts.map((a) => ({ accountId: a.id, value: accountValue(a), unvestedValue: accountUnvested(a) })) },
      expenses: { create: expenses.map((e) => ({ expenseItemId: e.id, monthlyEquivalent: toMonthlyEquivalent(Number(e.amount), e.intervalCount, e.intervalUnit as IntervalUnit) })) },
      income: { create: incomeSources.map((s) => { const t = estimateTax(s, defaults); return { incomeSourceId: s.id, grossAmount: t.grossAnnual / 12, netAmount: t.netMonthly } }) },
      debts: { create: debts.map((d) => ({ debtId: d.id, principal: d.principal, monthlyPayment: d.monthlyPayment })) },
    },
    include: { accounts: true, expenses: true, income: true, debts: true },
  })
}

snapshotsRouter.get('/', async (req, res) => {
  const snapshots = await prisma.monthlySnapshot.findMany({
    where: { userId: req.userId },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    select: { id: true, year: true, month: true, netWorth: true, liquidNetWorth: true, createdAt: true },
  })
  res.json(snapshots)
})

snapshotsRouter.post('/', validate(snapshotSchema), async (req, res) => {
  const { year, month } = req.body as z.infer<typeof snapshotSchema>
  res.status(201).json(await buildSnapshot(req.userId, year, month))
})

snapshotsRouter.get('/:year/:month', async (req, res) => {
  const snapshot = await prisma.monthlySnapshot.findUnique({
    where: { userId_year_month: { userId: req.userId, year: parseInt(req.params.year, 10), month: parseInt(req.params.month, 10) } },
    include: {
      accounts: { include: { account: { include: { institution: true } } } },
      expenses: { include: { expenseItem: { include: { category: true } } } },
      income: { include: { incomeSource: true } },
      debts: { include: { debt: true } },
    },
  })
  if (!snapshot) { res.status(404).json({ error: 'Not found' }); return }
  res.json(snapshot)
})
