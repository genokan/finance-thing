import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { toMonthlyEquivalent } from '../lib/monthlyEquivalent'
import { accountValue, accountUnvested, isCashKind, isLiabilityKind } from '../lib/accountValue'
import { debtPaymentInfo } from '../lib/debtPayment'
import { estimateTax } from '../services/tax'
import type { IntervalUnit } from '../generated/prisma/client'

export const dashboardRouter = Router()

const r2 = (n: number) => Math.round(n * 100) / 100

dashboardRouter.get('/', async (req, res) => {
  const uid = req.userId
  const [user, accounts, expenses, incomeSources, debts, snapshots, contributions] = await Promise.all([
    prisma.user.findUnique({ where: { id: uid }, select: { filingStatus: true, stateRate: true } }),
    prisma.account.findMany({ where: { userId: uid, isActive: true }, include: { holdings: { where: { isActive: true } } } }),
    prisma.expenseItem.findMany({ where: { userId: uid, isActive: true } }),
    prisma.incomeSource.findMany({ where: { userId: uid, isActive: true }, include: { deductions: true } }),
    prisma.debt.findMany({ where: { userId: uid, isActive: true }, include: { account: true } }),
    prisma.monthlySnapshot.findMany({ where: { userId: uid }, orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 2, select: { year: true, month: true, netWorth: true, liquidNetWorth: true } }),
    prisma.contribution.findMany({ where: { userId: uid, isActive: true } }),
  ])

  const defaults = { filingStatus: user?.filingStatus ?? null, stateRate: user?.stateRate != null ? Number(user.stateRate) : null }

  const liquidCash = accounts.filter((a) => isCashKind(a.kind)).reduce((s, a) => s + accountValue(a), 0)
  const vestedInvestments = accounts
    .filter((a) => !isCashKind(a.kind) && !isLiabilityKind(a.kind))
    .reduce((s, a) => s + accountValue(a), 0)
  const unvestedRSUs = accounts.reduce((s, a) => s + accountUnvested(a), 0)
  // Liability accounts subtract directly; a debt that links an account is already
  // captured by that account, so only unlinked debts add their own principal.
  const liabilityAccounts = accounts.filter((a) => isLiabilityKind(a.kind)).reduce((s, a) => s + accountValue(a), 0)
  const unlinkedDebtPrincipal = debts.filter((d) => !d.accountId).reduce((s, d) => s + Number(d.principal), 0)
  const totalDebtPrincipal = liabilityAccounts + unlinkedDebtPrincipal
  const liquidNetWorth = liquidCash + vestedInvestments - totalDebtPrincipal
  const totalNetWorth = liquidNetWorth + unvestedRSUs

  const grossMonthly = incomeSources.reduce((s, i) => s + estimateTax(i, defaults).grossAnnual / 12, 0)
  const netMonthly = incomeSources.reduce((s, i) => s + estimateTax(i, defaults).netMonthly, 0)

  const monthlyOf = (amount: unknown, c: number, u: IntervalUnit) => toMonthlyEquivalent(Number(amount), c, u)
  const recurring = expenses.filter((e) => e.kind === 'RECURRING')
  const essential = recurring.filter((e) => e.bucket === 'ESSENTIAL').reduce((s, e) => s + monthlyOf(e.amount, e.intervalCount, e.intervalUnit), 0)
  const discretionary = recurring.filter((e) => e.bucket === 'DISCRETIONARY').reduce((s, e) => s + monthlyOf(e.amount, e.intervalCount, e.intervalUnit), 0)
  const uncategorized = recurring.filter((e) => !e.bucket).reduce((s, e) => s + monthlyOf(e.amount, e.intervalCount, e.intervalUnit), 0)
  const debtPayments = debts.reduce((s, d) => s + debtPaymentInfo(d).effectivePayment, 0)
  const totalExpenses = essential + discretionary + uncategorized + debtPayments
  // Contributions are wealth-building (net-worth-neutral), tracked as their own band.
  const contributionsMonthly = contributions.reduce((s, c) => s + monthlyOf(c.amount, c.intervalCount, c.intervalUnit), 0)
  const unallocated = netMonthly - totalExpenses - contributionsMonthly

  const now = new Date()
  const ninetyOut = new Date(now.getTime() + 90 * 86400000)
  const upcomingAlerts = expenses
    .filter((e) => (e.expiresAt && e.expiresAt <= ninetyOut) || (e.renewsAt && e.renewsAt <= ninetyOut) || (e.kind === 'ONE_TIME' && e.dueDate && e.dueDate <= ninetyOut))
    .map((e) => ({ id: e.id, name: e.name, kind: e.kind, dueDate: e.dueDate, expiresAt: e.expiresAt, renewsAt: e.renewsAt }))

  const denom = netMonthly > 0 ? netMonthly : grossMonthly
  res.json({
    liquidNetWorth: r2(liquidNetWorth),
    totalNetWorth: r2(totalNetWorth),
    liquidCash: r2(liquidCash),
    vestedInvestments: r2(vestedInvestments),
    unvestedRSUs: r2(unvestedRSUs),
    grossMonthlyIncome: r2(grossMonthly),
    netMonthlyIncome: r2(netMonthly),
    totalExpenses: r2(totalExpenses),
    essentialExpenses: r2(essential),
    discretionaryExpenses: r2(discretionary),
    debtPayments: r2(debtPayments),
    contributions: r2(contributionsMonthly),
    unallocated: r2(unallocated),
    totalDebt: r2(totalDebtPrincipal),
    fiftyThirtyTwenty: {
      needsPercent: denom > 0 ? r2(((essential + debtPayments) / denom) * 100) : 0,
      wantsPercent: denom > 0 ? r2((discretionary / denom) * 100) : 0,
      savingsPercent: denom > 0 ? r2(((denom - totalExpenses) / denom) * 100) : 0,
    },
    recentSnapshots: snapshots,
    upcomingAlerts,
  })
})
