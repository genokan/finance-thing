import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'
import { accountValue, isCashKind, isLiabilityKind } from '../lib/accountValue'
import { debtPaymentInfo } from '../lib/debtPayment'
import { toMonthlyEquivalent } from '../lib/monthlyEquivalent'
import { estimateTax, linkedDeductionDeposits } from '../services/tax'
import {
  project,
  modifiersSchema,
  type Modifier,
  type ProjectionInputs,
  type SimAccount,
  type SimContribution,
  type Assumptions,
} from '../services/projection'

export const projectionsRouter = Router()

const bodySchema = z.object({
  horizonMonths: z.coerce.number().int().min(12).max(480).default(120),
  savingsRatePct: z.coerce.number().min(0).max(100).default(50),
  investmentReturnPct: z.coerce.number().min(-50).max(100).default(7),
  modifiers: modifiersSchema.default([]),
  scenarioIds: z.array(z.string().cuid()).max(6).default([]),
})

/** Whole months from `from` until `to` (1 = next month); 0 when passed/now. */
function monthOffset(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}

/**
 * Snapshot the user's current finances into plain engine inputs. Also derives
 * baseline modifiers the data implies: planned one-time expenses with a future
 * due date become ONE_TIME cash outflows in their month.
 */
async function buildInputs(userId: string): Promise<{ inputs: ProjectionInputs; baseModifiers: Modifier[] }> {
  const [user, accounts, debts, incomeSources, expenses, contributions] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { filingStatus: true, stateRate: true } }),
    prisma.account.findMany({ where: { userId, isActive: true }, include: { holdings: { where: { isActive: true } } } }),
    prisma.debt.findMany({ where: { userId, isActive: true }, include: { account: true } }),
    prisma.incomeSource.findMany({ where: { userId, isActive: true }, include: { deductions: true } }),
    prisma.expenseItem.findMany({ where: { userId, isActive: true } }),
    prisma.contribution.findMany({ where: { userId, isActive: true } }),
  ])

  const now = new Date()
  const linkedAccountIds = new Set(debts.map((d) => d.accountId).filter((id): id is string => !!id))

  const simAccounts: SimAccount[] = []
  for (const a of accounts) {
    const value = accountValue(a)
    if (isLiabilityKind(a.kind)) {
      // Linked liabilities are simulated by their debt; unlinked ones have no
      // APR/payment to amortize, so they simply hold at a negative value.
      if (!linkedAccountIds.has(a.id)) simAccounts.push({ id: a.id, name: a.name, kind: 'FLAT', value: -value })
      continue
    }
    if (isCashKind(a.kind)) {
      simAccounts.push({ id: a.id, name: a.name, kind: 'CASH', value, annualRatePct: a.apy != null ? Number(a.apy) : 0 })
    } else {
      // Vested value only — unvested RSUs are excluded from the projection.
      simAccounts.push({ id: a.id, name: a.name, kind: 'INVESTMENT', value })
    }
  }

  const simDebts = debts.map((d) => {
    const info = debtPaymentInfo(d)
    const promoLeft = d.isZeroPromo && d.promoEndsAt && d.promoEndsAt > now ? Math.max(0, monthOffset(now, d.promoEndsAt)) : 0
    return {
      id: d.id,
      name: d.name,
      principal: info.principalValue,
      aprPct: Number(d.apr),
      payment: info.effectivePayment,
      promoMonthsLeft: promoLeft,
      postPromoAprPct: d.postPromoApr != null ? Number(d.postPromoApr) : null,
    }
  })

  const defaults = { filingStatus: user?.filingStatus ?? null, stateRate: user?.stateRate != null ? Number(user.stateRate) : null }
  const netMonthlyIncome = incomeSources.reduce((s, i) => s + estimateTax(i, defaults).netMonthly, 0)

  const monthlyExpenses = expenses
    .filter((e) => e.kind === 'RECURRING')
    .reduce((s, e) => s + toMonthlyEquivalent(Number(e.amount), e.intervalCount, e.intervalUnit), 0)

  const baseModifiers: Modifier[] = expenses
    .filter((e) => e.kind === 'ONE_TIME' && e.dueDate && e.dueDate > now)
    .map((e) => ({ type: 'ONE_TIME', month: Math.max(1, monthOffset(now, e.dueDate!)), amount: -Number(e.amount), label: e.name }))

  const simContributions: SimContribution[] = contributions.map((c) => ({
    monthlyAmount: toMonthlyEquivalent(Number(c.amount), c.intervalCount, c.intervalUnit),
    accountId: c.destinationAccountId,
    extraDebt: c.kind === 'EXTRA_DEBT',
  }))

  // Payroll deductions with a linked account (401k, HSA…) deposit there each
  // month — withheld pre-net, so they add to the account without touching flow.
  for (const src of incomeSources) {
    for (const dep of linkedDeductionDeposits(src)) {
      simContributions.push({ monthlyAmount: dep.monthlyAmount, accountId: dep.accountId, payroll: true })
    }
  }

  return {
    inputs: {
      accounts: simAccounts,
      debts: simDebts,
      netMonthlyIncome,
      monthlyExpenses,
      contributions: simContributions,
    },
    baseModifiers,
  }
}

projectionsRouter.post('/', validate(bodySchema), async (req, res) => {
  const body = req.body as z.infer<typeof bodySchema>
  const { inputs, baseModifiers } = await buildInputs(req.userId)

  const assumptions: Assumptions = {
    horizonMonths: body.horizonMonths,
    savingsRatePct: body.savingsRatePct,
    investmentReturnPct: body.investmentReturnPct,
  }

  const baseline = project(inputs, assumptions, baseModifiers)
  const whatIf = body.modifiers.length > 0 ? project(inputs, assumptions, [...baseModifiers, ...body.modifiers]) : null

  const scenarioRows = body.scenarioIds.length
    ? await prisma.scenario.findMany({ where: { id: { in: body.scenarioIds }, userId: req.userId, isActive: true } })
    : []
  const scenarios = scenarioRows.flatMap((s) => {
    const parsed = modifiersSchema.safeParse(s.modifiers)
    if (!parsed.success) return [] // stored before a schema change — skip rather than 500
    return [{ id: s.id, name: s.name, ...project(inputs, assumptions, [...baseModifiers, ...parsed.data]) }]
  })

  const now = new Date()
  res.json({
    startYear: now.getFullYear(),
    startMonth: now.getMonth() + 1, // offset m lands m months after this
    assumptions,
    netMonthlyIncome: Math.round(inputs.netMonthlyIncome * 100) / 100,
    monthlyExpenses: Math.round(inputs.monthlyExpenses * 100) / 100,
    baseline,
    whatIf,
    scenarios,
  })
})
