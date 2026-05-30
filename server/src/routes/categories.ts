import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'

export const categoriesRouter = Router()

// Categories are shared/global (single-user app) — keyed by unique name.
const categorySchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['ESSENTIAL', 'DISCRETIONARY']),
})

categoriesRouter.get('/', async (_req, res) => {
  const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
  res.json(categories)
})

categoriesRouter.post('/', validate(categorySchema), async (req, res) => {
  const data = req.body as z.infer<typeof categorySchema>
  const category = await prisma.category.upsert({
    where: { name: data.name },
    create: data,
    update: { type: data.type },
  })
  res.status(201).json(category)
})
