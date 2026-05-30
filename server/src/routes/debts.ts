import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'

export const debtsRouter = Router()

const debtSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['SHORT_TERM', 'LONG_TERM']),
  principal: z.coerce.number().nonnegative(),
  monthlyPayment: z.coerce.number().nonnegative(),
  apr: z.coerce.number().nonnegative(),
  institutionId: z.string().cuid().optional(),
  payoffDate: z.coerce.date().optional(),
  promoApr: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional(),
})

debtsRouter.get('/', async (req, res) => {
  const debts = await prisma.debt.findMany({ where: { userId: req.userId, isActive: true }, include: { institution: true }, orderBy: { principal: 'desc' } })
  res.json(debts)
})

debtsRouter.post('/', validate(debtSchema), async (req, res) => {
  const data = req.body as z.infer<typeof debtSchema>
  const debt = await prisma.debt.create({ data: { ...data, userId: req.userId }, include: { institution: true } })
  res.status(201).json(debt)
})

debtsRouter.put('/:id', validate(debtSchema), async (req, res) => {
  const data = req.body as z.infer<typeof debtSchema>
  const id = req.params.id as string
  try {
    const debt = await prisma.debt.update({ where: { id, userId: req.userId }, data, include: { institution: true } })
    res.json(debt)
  } catch { res.status(404).json({ error: 'Not found' }) }
})

debtsRouter.delete('/:id', async (req, res) => {
  const id = req.params.id as string
  try {
    await prisma.debt.update({ where: { id, userId: req.userId }, data: { isActive: false } })
    res.json({ ok: true })
  } catch { res.status(404).json({ error: 'Not found' }) }
})
