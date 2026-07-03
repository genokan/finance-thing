import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'
import { toMonthlyEquivalent } from '../lib/monthlyEquivalent'
import { accountValue, accountUnvested, isCashKind, isLiabilityKind } from '../lib/accountValue'
import { debtPaymentInfo } from '../lib/debtPayment'
import { estimateTax } from '../services/tax'
import type { IntervalUnit } from '../generated/prisma/client'

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
    prisma.debt.findMany({ where: { userId, isActive: true }, include: { account: true } }),
  ])

  const defaults = { filingStatus: user?.filingStatus ?? null, stateRate: user?.stateRate != null ? Number(user.stateRate) : null }

  const liquidCash = accounts.filter((a) => isCashKind(a.kind)).reduce((s, a) => s + accountValue(a), 0)
  const vested = accounts
    .filter((a) => !isCashKind(a.kind) && !isLiabilityKind(a.kind))
    .reduce((s, a) => s + accountValue(a), 0)
  const unvested = accounts.reduce((s, a) => s + accountUnvested(a), 0)
  const liabilityAccounts = accounts.filter((a) => isLiabilityKind(a.kind)).reduce((s, a) => s + accountValue(a), 0)
  const unlinkedDebtPrincipal = debts.filter((d) => !d.accountId).reduce((s, d) => s + Number(d.principal), 0)
  const totalDebt = liabilityAccounts + unlinkedDebtPrincipal
  const liquidNetWorth = liquidCash + vested - totalDebt
  const netWorth = liquidNetWorth + unvested

  await prisma.monthlySnapshot.deleteMany({ where: { userId, year, month } })

  return prisma.monthlySnapshot.create({
    data: {
      userId, year, month, netWorth, liquidNetWorth,
      accounts: { create: accounts.map((a) => ({ accountId: a.id, value: accountValue(a), unvestedValue: accountUnvested(a) })) },
      expenses: { create: expenses.map((e) => ({ expenseItemId: e.id, monthlyEquivalent: toMonthlyEquivalent(Number(e.amount), e.intervalCount, e.intervalUnit as IntervalUnit) })) },
      income: { create: incomeSources.map((s) => { const t = estimateTax(s, defaults); return { incomeSourceId: s.id, grossAmount: t.grossAnnual / 12, netAmount: t.netMonthly } }) },
      debts: { create: debts.map((d) => { const p = debtPaymentInfo(d); return { debtId: d.id, principal: p.principalValue, monthlyPayment: p.effectivePayment } }) },
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

// Chart-ready series in one query — History previously fetched every
// snapshot's detail individually (one request per recorded month).
snapshotsRouter.get('/series', async (req, res) => {
  const snapshots = await prisma.monthlySnapshot.findMany({
    where: { userId: req.userId },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
    include: {
      accounts: { include: { account: { select: { kind: true } } } },
      debts: { include: { debt: { select: { accountId: true } } } },
    },
  })
  const r2 = (n: number) => Math.round(n * 100) / 100
  res.json(
    snapshots.map((s) => {
      // Deleted accounts lose their kind (SetNull) — count them as assets,
      // matching how they were captured (liabilities live in debt snapshots).
      const assets = s.accounts
        .filter((a) => !a.account || !isLiabilityKind(a.account.kind))
        .reduce((sum, a) => sum + Number(a.value), 0)
      const liabilityAccounts = s.accounts
        .filter((a) => a.account && isLiabilityKind(a.account.kind))
        .reduce((sum, a) => sum + Number(a.value), 0)
      // Debts linked to a liability account are already counted via the account.
      const unlinkedDebt = s.debts
        .filter((d) => !d.debt?.accountId)
        .reduce((sum, d) => sum + Number(d.principal), 0)
      const debt = liabilityAccounts + unlinkedDebt
      return {
        year: s.year,
        month: s.month,
        netWorth: Number(s.netWorth),
        liquidNetWorth: s.liquidNetWorth != null ? Number(s.liquidNetWorth) : null,
        assets: r2(assets),
        debt: r2(debt),
      }
    }),
  )
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
