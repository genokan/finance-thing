import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'

export const categoriesRouter = Router()

const categorySchema = z.object({
  name: z.string().min(1).max(100),
  bucket: z.enum(['ESSENTIAL', 'DISCRETIONARY', 'SAVINGS']).default('ESSENTIAL'),
  appliesTo: z.enum(['EXPENSE', 'INCOME', 'DEBT', 'ANY']).default('ANY'),
  monthlyBudget: z.coerce.number().nonnegative().optional(),
  parentId: z.string().cuid().optional(),
})

categoriesRouter.get('/', async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { userId: req.userId, isActive: true },
    orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
  })
  res.json(categories)
})

categoriesRouter.post('/', validate(categorySchema), async (req, res) => {
  const data = req.body as z.infer<typeof categorySchema>
  const category = await prisma.category.create({ data: { ...data, userId: req.userId } })
  res.status(201).json(category)
})

categoriesRouter.put('/:id', validate(categorySchema), async (req, res) => {
  const data = req.body as z.infer<typeof categorySchema>
  try {
    const category = await prisma.category.update({
      where: { id: req.params.id as string, userId: req.userId },
      data,
    })
    res.json(category)
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})

categoriesRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.category.update({ where: { id: req.params.id as string, userId: req.userId }, data: { isActive: false } })
    res.json({ ok: true })
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})
