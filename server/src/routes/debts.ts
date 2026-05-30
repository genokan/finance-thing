import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'

export const debtsRouter = Router()

const debtSchema = z.object({
  name: z.string().min(1).max(200),
  term: z.enum(['SHORT_TERM', 'LONG_TERM']),
  kind: z.enum(['CREDIT_CARD', 'CAR_LOAN', 'MORTGAGE', 'STUDENT_LOAN', 'PERSONAL', 'OTHER']).default('OTHER'),
  categoryId: z.string().cuid().optional(),
  principal: z.coerce.number().nonnegative(),
  monthlyPayment: z.coerce.number().nonnegative(),
  apr: z.coerce.number().nonnegative(),
  institutionId: z.string().cuid().optional(),
  payoffDate: z.coerce.date().optional(),
  isZeroPromo: z.coerce.boolean().default(false),
  promoEndsAt: z.coerce.date().optional(),
  postPromoApr: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional(),
})

const include = { institution: true, category: true } as const

debtsRouter.get('/', async (req, res) => {
  const debts = await prisma.debt.findMany({
    where: { userId: req.userId, isActive: true },
    include,
    orderBy: { principal: 'desc' },
  })
  res.json(debts)
})

debtsRouter.post('/', validate(debtSchema), async (req, res) => {
  const data = req.body as z.infer<typeof debtSchema>
  const debt = await prisma.debt.create({ data: { ...data, userId: req.userId }, include })
  res.status(201).json(debt)
})

debtsRouter.put('/:id', validate(debtSchema), async (req, res) => {
  const data = req.body as z.infer<typeof debtSchema>
  try {
    const debt = await prisma.debt.update({ where: { id: req.params.id as string, userId: req.userId }, data, include })
    res.json(debt)
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})

debtsRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.debt.update({ where: { id: req.params.id as string, userId: req.userId }, data: { isActive: false } })
    res.json({ ok: true })
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})
