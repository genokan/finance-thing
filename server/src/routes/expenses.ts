import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'
import { toMonthlyEquivalent } from '../lib/monthlyEquivalent'
import type { IntervalUnit } from '../generated/prisma/client'

export const expensesRouter = Router()

const expenseSchema = z.object({
  name: z.string().min(1).max(200),
  amount: z.coerce.number().positive(),
  kind: z.enum(['RECURRING', 'ONE_TIME']).default('RECURRING'),
  intervalCount: z.coerce.number().int().positive().default(1),
  intervalUnit: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']).default('MONTH'),
  dueDate: z.coerce.date().optional(),
  bucket: z.enum(['ESSENTIAL', 'DISCRETIONARY', 'SAVINGS']).nullish(),
  categoryId: z.string().cuid().nullish(),
  notes: z.string().optional(),
  expiresAt: z.coerce.date().optional(),
  renewsAt: z.coerce.date().optional(),
})

// monthlyEquivalent only applies to RECURRING items; ONE_TIME items have a dueDate.
function withMonthly(e: {
  amount: unknown
  kind: string
  intervalCount: number
  intervalUnit: IntervalUnit
  [k: string]: unknown
}) {
  const monthlyEquivalent =
    e.kind === 'RECURRING'
      ? Math.round(toMonthlyEquivalent(Number(e.amount), e.intervalCount, e.intervalUnit) * 100) / 100
      : 0
  return { ...e, monthlyEquivalent }
}

expensesRouter.get('/', async (req, res) => {
  const items = await prisma.expenseItem.findMany({
    where: { userId: req.userId, isActive: true },
    include: { category: true },
    orderBy: { amount: 'desc' },
  })
  res.json(items.map(withMonthly))
})

expensesRouter.post('/', validate(expenseSchema), async (req, res) => {
  const data = req.body as z.infer<typeof expenseSchema>
  const item = await prisma.expenseItem.create({ data: { ...data, userId: req.userId }, include: { category: true } })
  res.status(201).json(withMonthly(item))
})

expensesRouter.put('/:id', validate(expenseSchema), async (req, res) => {
  const data = req.body as z.infer<typeof expenseSchema>
  try {
    const item = await prisma.expenseItem.update({
      where: { id: req.params.id as string, userId: req.userId },
      data,
      include: { category: true },
    })
    res.json(withMonthly(item))
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})

expensesRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.expenseItem.update({ where: { id: req.params.id as string, userId: req.userId }, data: { isActive: false } })
    res.json({ ok: true })
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})
