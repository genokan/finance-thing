import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'
import { toMonthlyEquivalent } from '../lib/monthlyEquivalent'
import { ownsAccount } from '../lib/ownership'
import type { IntervalUnit } from '../generated/prisma/client'

export const contributionsRouter = Router()

// Contributions are wealth-building allocations (money moving to an asset or
// extra debt principal) — net-worth-neutral, distinct from outflow and from
// income distributions.
const contributionSchema = z.object({
  name: z.string().min(1).max(200),
  amount: z.coerce.number().positive(),
  intervalCount: z.coerce.number().int().positive().default(1),
  intervalUnit: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']).default('MONTH'),
  kind: z.enum(['RETIREMENT', 'SAVINGS', 'BROKERAGE', 'EXTRA_DEBT', 'OTHER']).default('SAVINGS'),
  destinationAccountId: z.string().cuid().nullish(),
  notes: z.string().optional(),
})

function withMonthly(c: { amount: unknown; intervalCount: number; intervalUnit: IntervalUnit; [k: string]: unknown }) {
  const monthlyEquivalent = Math.round(toMonthlyEquivalent(Number(c.amount), c.intervalCount, c.intervalUnit) * 100) / 100
  return { ...c, monthlyEquivalent }
}

const include = { destinationAccount: true } as const

contributionsRouter.get('/', async (req, res) => {
  const items = await prisma.contribution.findMany({
    where: { userId: req.userId, isActive: true },
    include,
    orderBy: { amount: 'desc' },
  })
  res.json(items.map(withMonthly))
})

contributionsRouter.post('/', validate(contributionSchema), async (req, res) => {
  const data = req.body as z.infer<typeof contributionSchema>
  if (!(await ownsAccount(req.userId, data.destinationAccountId))) { res.status(404).json({ error: 'Account not found' }); return }
  const item = await prisma.contribution.create({ data: { ...data, userId: req.userId }, include })
  res.status(201).json(withMonthly(item))
})

contributionsRouter.put('/:id', validate(contributionSchema), async (req, res) => {
  const data = req.body as z.infer<typeof contributionSchema>
  if (!(await ownsAccount(req.userId, data.destinationAccountId))) { res.status(404).json({ error: 'Account not found' }); return }
  try {
    const item = await prisma.contribution.update({ where: { id: req.params.id as string, userId: req.userId }, data, include })
    res.json(withMonthly(item))
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})

contributionsRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.contribution.update({ where: { id: req.params.id as string, userId: req.userId }, data: { isActive: false } })
    res.json({ ok: true })
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})
