import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { toMonthlyEquivalent } from '../lib/monthlyEquivalent'
import { accountValue, isCashKind } from '../lib/accountValue'
import type { IntervalUnit } from '../generated/prisma/client'

export const insightsRouter = Router()

type Verdict = 'PAY_OFF' | 'BALANCED' | 'KEEP'
function verdict(apr: number, benchmark: number): Verdict {
  const diff = apr - benchmark
  if (diff > 2) return 'PAY_OFF'
  if (diff < -0.5) return 'KEEP'
  return 'BALANCED'
}

insightsRouter.get('/', async (req, res) => {
  const uid = req.userId
  const [user, debts, expenses, accounts] = await Promise.all([
    prisma.user.findUnique({ where: { id: uid } }),
    prisma.debt.findMany({ where: { userId: uid, isActive: true }, include: { account: true } }),
    prisma.expenseItem.findMany({ where: { userId: uid, isActive: true, kind: 'RECURRING' } }),
    prisma.account.findMany({ where: { userId: uid, isActive: true }, include: { holdings: { where: { isActive: true } } } }),
  ])

  const benchmark = Number(user?.benchmarkRate ?? 0)

  const debtAnalysis = debts.map((d) => {
    const apr = Number(d.apr)
    return { id: d.id, name: d.name, apr, benchmark, opportunityCostPercent: Math.round((apr - benchmark) * 100) / 100, verdict: verdict(apr, benchmark) }
  })

  // If the user has designated specific emergency-fund account(s), use those;
  // otherwise fall back to all liquid cash.
  const designatedAccounts = accounts.filter((a) => a.isEmergencyFund)
  const designated = designatedAccounts.length > 0
  const emergencyCash = designated
    ? designatedAccounts.reduce((s, a) => s + accountValue(a), 0)
    : accounts.filter((a) => isCashKind(a.kind)).reduce((s, a) => s + accountValue(a), 0)
  const monthlyEssential = expenses
    .filter((e) => e.bucket === 'ESSENTIAL')
    .reduce((s, e) => s + toMonthlyEquivalent(Number(e.amount), e.intervalCount, e.intervalUnit as IntervalUnit), 0)
  const monthsCovered = monthlyEssential > 0 ? emergencyCash / monthlyEssential : 0

  const now = new Date()
  const sixtyOut = new Date(now.getTime() + 60 * 86400000)
  // 0% promos approaching expiry, regardless of term.
  const promoAlerts = debts
    .filter((d) => d.isZeroPromo && d.promoEndsAt && d.promoEndsAt <= sixtyOut)
    .map((d) => ({ id: d.id, name: d.name, promoEndsAt: d.promoEndsAt, postPromoApr: Number(d.postPromoApr ?? 0), daysRemaining: Math.ceil((d.promoEndsAt!.getTime() - now.getTime()) / 86400000) }))

  res.json({
    benchmarkRate: benchmark,
    debtAnalysis,
    emergencyFund: {
      liquidCash: Math.round(emergencyCash * 100) / 100,
      monthlyEssentialExpenses: Math.round(monthlyEssential * 100) / 100,
      monthsCovered: Math.round(monthsCovered * 10) / 10,
      status: monthsCovered >= 6 ? 'ADEQUATE' : monthsCovered >= 3 ? 'MINIMUM' : 'LOW',
      designated,
    },
    promoAlerts,
    highAprDebts: debts
      .filter((d) => Number(d.apr) > 7.5)
      .map((d) => ({ id: d.id, name: d.name, apr: Number(d.apr), principal: d.account ? Number(d.account.balance) : Number(d.principal) })),
  })
})
