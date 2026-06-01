import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'
import { estimateTax } from '../services/tax'
import { ownsAllAccounts } from '../lib/ownership'

export const incomeRouter = Router()

const deductionSchema = z.object({
  name: z.string().min(1),
  amount: z.coerce.number().nonnegative(),
  preTax: z.coerce.boolean().default(true),
  linkedAccountId: z.string().cuid().optional(),
})

const distributionSchema = z.object({
  accountId: z.string().cuid().optional(),
  amount: z.coerce.number().positive(),
})

const incomeSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['W2', 'SELF_1099', 'OTHER']).default('W2'),
  grossAnnual: z.coerce.number().nonnegative().optional(),
  grossPerPaycheck: z.coerce.number().nonnegative().optional(),
  payFrequency: z.enum(['WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY', 'ANNUAL']).default('BIWEEKLY'),
  taxMode: z.enum(['FLAT', 'BRACKET']).default('FLAT'),
  flatEffectiveRate: z.coerce.number().min(0).max(1).optional(),
  filingStatus: z.enum(['SINGLE', 'MARRIED_JOINT', 'MARRIED_SEPARATE', 'HEAD_OF_HOUSEHOLD']).optional(),
  stateRate: z.coerce.number().min(0).max(1).optional(),
  deductions: z.array(deductionSchema).default([]),
  distributions: z.array(distributionSchema).default([]),
})

const include = { deductions: true, distributions: { include: { account: true } } } as const

// Nested Prisma create uses the checked variant, which exposes relations (connect)
// rather than scalar FKs — map our optional account links accordingly.
function deductionCreate(deductions: z.infer<typeof deductionSchema>[]) {
  return deductions.map((d) => ({
    name: d.name,
    amount: d.amount,
    preTax: d.preTax,
    ...(d.linkedAccountId ? { linkedAccount: { connect: { id: d.linkedAccountId } } } : {}),
  }))
}

function distributionCreate(distributions: z.infer<typeof distributionSchema>[]) {
  return distributions.map((d) => ({
    amount: d.amount,
    ...(d.accountId ? { account: { connect: { id: d.accountId } } } : {}),
  }))
}

incomeRouter.get('/', async (req, res) => {
  const [sources, user] = await Promise.all([
    prisma.incomeSource.findMany({ where: { userId: req.userId, isActive: true }, include, orderBy: { createdAt: 'asc' } }),
    prisma.user.findUnique({ where: { id: req.userId }, select: { filingStatus: true, stateRate: true } }),
  ])
  const defaults = { filingStatus: user?.filingStatus ?? null, stateRate: user?.stateRate != null ? Number(user.stateRate) : null }
  res.json(sources.map((s) => ({ ...s, tax: estimateTax(s, defaults) })))
})

// Every account a paycheck routes to / deducts into must belong to the user.
function referencedAccountIds(deductions: z.infer<typeof deductionSchema>[], distributions: z.infer<typeof distributionSchema>[]) {
  return [...deductions.map((d) => d.linkedAccountId), ...distributions.map((d) => d.accountId)]
}

incomeRouter.post('/', validate(incomeSchema), async (req, res) => {
  const { deductions, distributions, ...data } = req.body as z.infer<typeof incomeSchema>
  if (!(await ownsAllAccounts(req.userId, referencedAccountIds(deductions, distributions)))) {
    res.status(404).json({ error: 'Account not found' })
    return
  }
  const source = await prisma.incomeSource.create({
    data: { ...data, userId: req.userId, deductions: { create: deductionCreate(deductions) }, distributions: { create: distributionCreate(distributions) } },
    include,
  })
  res.status(201).json(source)
})

incomeRouter.put('/:id', validate(incomeSchema), async (req, res) => {
  const { deductions, distributions, ...data } = req.body as z.infer<typeof incomeSchema>
  const id = req.params.id as string
  if (!(await ownsAllAccounts(req.userId, referencedAccountIds(deductions, distributions)))) {
    res.status(404).json({ error: 'Account not found' })
    return
  }
  try {
    // Replace child collections wholesale.
    await prisma.incomeDeduction.deleteMany({ where: { incomeSourceId: id } })
    await prisma.incomeDistribution.deleteMany({ where: { incomeSourceId: id } })
    const source = await prisma.incomeSource.update({
      where: { id, userId: req.userId },
      data: { ...data, deductions: { create: deductionCreate(deductions) }, distributions: { create: distributionCreate(distributions) } },
      include,
    })
    res.json(source)
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})

incomeRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.incomeSource.update({ where: { id: req.params.id as string, userId: req.userId }, data: { isActive: false } })
    res.json({ ok: true })
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})
