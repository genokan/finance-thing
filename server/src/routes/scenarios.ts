import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'
import { modifiersSchema } from '../services/projection'

export const scenariosRouter = Router()

// A scenario is a named set of what-if modifiers overlaid on the projection.
const scenarioSchema = z.object({
  name: z.string().min(1).max(120),
  notes: z.string().max(2000).nullish(),
  modifiers: modifiersSchema.min(1),
})

scenariosRouter.get('/', async (req, res) => {
  const items = await prisma.scenario.findMany({
    where: { userId: req.userId, isActive: true },
    orderBy: { createdAt: 'asc' },
  })
  res.json(items)
})

scenariosRouter.post('/', validate(scenarioSchema), async (req, res) => {
  const data = req.body as z.infer<typeof scenarioSchema>
  const item = await prisma.scenario.create({ data: { ...data, userId: req.userId } })
  res.status(201).json(item)
})

scenariosRouter.put('/:id', validate(scenarioSchema), async (req, res) => {
  const data = req.body as z.infer<typeof scenarioSchema>
  try {
    const item = await prisma.scenario.update({ where: { id: req.params.id as string, userId: req.userId }, data })
    res.json(item)
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})

scenariosRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.scenario.update({ where: { id: req.params.id as string, userId: req.userId }, data: { isActive: false } })
    res.json({ ok: true })
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})
