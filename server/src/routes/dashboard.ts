import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { toMonthlyEquivalent } from '../lib/monthlyEquivalent'
import type { IntervalUnit } from '@prisma/client'

export const dashboardRouter = Router()

dashboardRouter.get('/', async (req, res) => {
  const uid = req.userId
  const [expenses, incomeSources, investments, debts, snapshots] = await Promise.all([
    prisma.expenseItem.findMany({ where: { userId: uid, isActive: true }, include: { category: true } }),
    prisma.incomeSource.findMany({ where: { userId: uid, isActive: true } }),
    prisma.investmentAccount.findMany({ where: { userId: uid, isActive: true } }),
    prisma.debt.findMany({ where: { userId: uid, isActive: true } }),
    prisma.monthlySnapshot.findMany({ where: { userId: uid }, orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 2, select: { year: true, month: true, netWorth: true } }),
  ])

  const totalIncome = incomeSources.reduce((s, i) => s + Number(i.amount), 0)
  const essential = expenses.filter(e => e.category.type === 'ESSENTIAL').reduce((s, e) => s + toMonthlyEquivalent(Number(e.amount), e.intervalCount, e.intervalUnit as IntervalUnit), 0)
  const discretionary = expenses.filter(e => e.category.type === 'DISCRETIONARY').reduce((s, e) => s + toMonthlyEquivalent(Number(e.amount), e.intervalCount, e.intervalUnit as IntervalUnit), 0)
  const debtPayments = debts.reduce((s, d) => s + Number(d.monthlyPayment), 0)
  const liquidCash = investments.filter(a => ['SAVINGS','MONEY_MARKET','CHECKING'].includes(a.type)).reduce((s, a) => s + Number(a.currentValue), 0)
  const vestedInvestments = investments.filter(a => !['SAVINGS','MONEY_MARKET','CHECKING'].includes(a.type)).reduce((s, a) => s + Number(a.currentValue), 0)
  const unvestedRSUs = investments.filter(a => a.type === 'RSU').reduce((s, a) => s + Number(a.unvestedValue ?? 0), 0)
  const totalDebtPrincipal = debts.reduce((s, d) => s + Number(d.principal), 0)
  const liquidNetWorth = liquidCash + vestedInvestments - totalDebtPrincipal
  const totalNetWorth = liquidNetWorth + unvestedRSUs
  const totalExpenses = essential + discretionary + debtPayments

  const now = new Date()
  const ninetyOut = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
  const upcomingAlerts = expenses
    .filter(e => (e.expiresAt && e.expiresAt <= ninetyOut) || (e.renewsAt && e.renewsAt <= ninetyOut))
    .map(e => ({ id: e.id, name: e.name, expiresAt: e.expiresAt, renewsAt: e.renewsAt }))

  const r = (n: number) => Math.round(n * 100) / 100
  res.json({
    totalIncome, totalExpenses: r(totalExpenses), essentialExpenses: r(essential), discretionaryExpenses: r(discretionary), debtPayments: r(debtPayments),
    liquidNetWorth: r(liquidNetWorth), totalNetWorth: r(totalNetWorth), liquidCash: r(liquidCash), vestedInvestments: r(vestedInvestments), unvestedRSUs: r(unvestedRSUs),
    fiftyThirtyTwenty: {
      needsPercent: totalIncome > 0 ? Math.round(essential / totalIncome * 1000) / 10 : 0,
      wantsPercent: totalIncome > 0 ? Math.round(discretionary / totalIncome * 1000) / 10 : 0,
      savingsPercent: totalIncome > 0 ? Math.round((totalIncome - totalExpenses) / totalIncome * 1000) / 10 : 0,
    },
    recentSnapshots: snapshots,
    upcomingAlerts,
  })
})
