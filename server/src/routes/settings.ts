import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'

export const settingsRouter = Router()

const settingsSchema = z.object({ benchmarkRate: z.coerce.number().nonnegative().max(100).optional() })

settingsRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true, benchmarkRate: true } })
  if (!user) { res.status(404).json({ error: 'Not found' }); return }
  res.json(user)
})

settingsRouter.put('/', validate(settingsSchema), async (req, res) => {
  const data = req.body as z.infer<typeof settingsSchema>
  const user = await prisma.user.update({ where: { id: req.userId }, data: { benchmarkRate: data.benchmarkRate }, select: { email: true, benchmarkRate: true } })
  res.json(user)
})
