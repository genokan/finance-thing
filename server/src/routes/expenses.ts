import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'
import { toMonthlyEquivalent } from '../lib/monthlyEquivalent'
import type { IntervalUnit } from '@prisma/client'

export const expensesRouter = Router()

const expenseSchema = z.object({
  name: z.string().min(1).max(200),
  amount: z.coerce.number().positive(),
  intervalCount: z.coerce.number().int().positive().default(1),
  intervalUnit: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']).default('MONTH'),
  categoryId: z.string().cuid(),
  notes: z.string().optional(),
  expiresAt: z.coerce.date().optional(),
  renewsAt: z.coerce.date().optional(),
})

function withMonthly(e: { amount: unknown; intervalCount: number; intervalUnit: IntervalUnit; [k: string]: unknown }) {
  return { ...e, monthlyEquivalent: Math.round(toMonthlyEquivalent(Number(e.amount), e.intervalCount, e.intervalUnit) * 100) / 100 }
}

expensesRouter.get('/', async (req, res) => {
  const items = await prisma.expenseItem.findMany({ where: { userId: req.userId, isActive: true }, include: { category: true }, orderBy: { amount: 'desc' } })
  res.json(items.map(withMonthly))
})

expensesRouter.post('/', validate(expenseSchema), async (req, res) => {
  const data = req.body as z.infer<typeof expenseSchema>
  const item = await prisma.expenseItem.create({ data: { ...data, userId: req.userId }, include: { category: true } })
  res.status(201).json(withMonthly(item))
})

expensesRouter.put('/:id', validate(expenseSchema), async (req, res) => {
  const data = req.body as z.infer<typeof expenseSchema>
  const id = req.params.id as string
  try {
    const item = await prisma.expenseItem.update({ where: { id, userId: req.userId }, data, include: { category: true } })
    res.json(withMonthly(item))
  } catch { res.status(404).json({ error: 'Not found' }) }
})

expensesRouter.delete('/:id', async (req, res) => {
  const id = req.params.id as string
  try {
    await prisma.expenseItem.update({ where: { id, userId: req.userId }, data: { isActive: false } })
    res.json({ ok: true })
  } catch { res.status(404).json({ error: 'Not found' }) }
})
