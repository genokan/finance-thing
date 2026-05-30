import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { toMonthlyEquivalent } from '../lib/monthlyEquivalent'
import type { IntervalUnit } from '@prisma/client'

export const insightsRouter = Router()

type Verdict = 'PAY_OFF' | 'BALANCED' | 'KEEP'
function verdict(apr: number, benchmark: number): Verdict {
  const diff = apr - benchmark
  if (diff > 2) return 'PAY_OFF'
  if (diff < -0.5) return 'KEEP'
  return 'BALANCED'
}

insightsRouter.get('/', async (req, res) => {
  const [user, debts, expenses, investments] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.userId } }),
    prisma.debt.findMany({ where: { userId: req.userId, isActive: true } }),
    prisma.expenseItem.findMany({ where: { userId: req.userId, isActive: true }, include: { category: true } }),
    prisma.investmentAccount.findMany({ where: { userId: req.userId, isActive: true } }),
  ])

  const benchmark = Number(user?.benchmarkRate ?? 0)

  const debtAnalysis = debts.map(d => {
    const apr = Number(d.apr)
    return { id: d.id, name: d.name, apr, benchmark, opportunityCostPercent: Math.round((apr - benchmark) * 100) / 100, verdict: verdict(apr, benchmark) }
  })

  const liquidCash = investments.filter(a => ['SAVINGS','MONEY_MARKET','CHECKING'].includes(a.type)).reduce((s, a) => s + Number(a.currentValue), 0)
  const monthlyEssential = expenses.filter(e => e.category.type === 'ESSENTIAL').reduce((s, e) => s + toMonthlyEquivalent(Number(e.amount), e.intervalCount, e.intervalUnit as IntervalUnit), 0)
  const monthsCovered = monthlyEssential > 0 ? liquidCash / monthlyEssential : 0

  const now = new Date()
  const sixtyOut = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
  const promoAlerts = debts
    .filter(d => d.payoffDate && d.payoffDate <= sixtyOut && Number(d.apr) === 0)
    .map(d => ({ id: d.id, name: d.name, payoffDate: d.payoffDate, promoApr: Number(d.promoApr ?? 0), daysRemaining: Math.ceil((d.payoffDate!.getTime() - now.getTime()) / 86400000) }))

  res.json({
    benchmarkRate: benchmark,
    debtAnalysis,
    emergencyFund: { liquidCash: Math.round(liquidCash * 100) / 100, monthlyEssentialExpenses: Math.round(monthlyEssential * 100) / 100, monthsCovered: Math.round(monthsCovered * 10) / 10, status: monthsCovered >= 6 ? 'ADEQUATE' : monthsCovered >= 3 ? 'MINIMUM' : 'LOW' },
    promoAlerts,
    highAprDebts: debts.filter(d => Number(d.apr) > 7.5).map(d => ({ id: d.id, name: d.name, apr: Number(d.apr), principal: Number(d.principal) })),
  })
})
