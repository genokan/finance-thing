import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'

export const incomeRouter = Router()

const distSchema = z.object({ accountName: z.string().min(1), amount: z.coerce.number().positive() })
const incomeSchema = z.object({
  name: z.string().min(1).max(200),
  amount: z.coerce.number().positive(),
  intervalCount: z.coerce.number().int().positive().default(1),
  intervalUnit: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']).default('MONTH'),
  distributions: z.array(distSchema).default([]),
})

incomeRouter.get('/', async (req, res) => {
  const sources = await prisma.incomeSource.findMany({ where: { userId: req.userId, isActive: true }, include: { distributions: true }, orderBy: { amount: 'desc' } })
  res.json(sources)
})

incomeRouter.post('/', validate(incomeSchema), async (req, res) => {
  const { distributions, ...data } = req.body as z.infer<typeof incomeSchema>
  const source = await prisma.incomeSource.create({ data: { ...data, userId: req.userId, distributions: { create: distributions } }, include: { distributions: true } })
  res.status(201).json(source)
})

incomeRouter.put('/:id', validate(incomeSchema), async (req, res) => {
  const { distributions, ...data } = req.body as z.infer<typeof incomeSchema>
  const id = req.params.id as string
  try {
    await prisma.incomeDistribution.deleteMany({ where: { incomeSourceId: id } })
    const source = await prisma.incomeSource.update({ where: { id, userId: req.userId }, data: { ...data, distributions: { create: distributions } }, include: { distributions: true } })
    res.json(source)
  } catch { res.status(404).json({ error: 'Not found' }) }
})

incomeRouter.delete('/:id', async (req, res) => {
  const id = req.params.id as string
  try {
    await prisma.incomeSource.update({ where: { id, userId: req.userId }, data: { isActive: false } })
    res.json({ ok: true })
  } catch { res.status(404).json({ error: 'Not found' }) }
})
