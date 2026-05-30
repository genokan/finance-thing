import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'
import { requireAdmin } from '../middleware/auth'

export const settingsRouter = Router()

// ----- Per-user settings -----

const settingsSchema = z.object({
  benchmarkRate: z.coerce.number().nonnegative().max(100).optional(),
  filingStatus: z.enum(['SINGLE', 'MARRIED_JOINT', 'MARRIED_SEPARATE', 'HEAD_OF_HOUSEHOLD']).optional(),
  stateRate: z.coerce.number().min(0).max(1).optional(),
})

settingsRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { email: true, benchmarkRate: true, filingStatus: true, stateRate: true, isAdmin: true },
  })
  if (!user) { res.status(404).json({ error: 'Not found' }); return }
  res.json(user)
})

settingsRouter.put('/', validate(settingsSchema), async (req, res) => {
  const data = req.body as z.infer<typeof settingsSchema>
  const user = await prisma.user.update({
    where: { id: req.userId },
    data,
    select: { email: true, benchmarkRate: true, filingStatus: true, stateRate: true, isAdmin: true },
  })
  res.json(user)
})

// ----- App-wide settings (admin only, stored as key/value) -----

const appSettingSchema = z.object({ key: z.string().min(1).max(100), value: z.string() })

settingsRouter.get('/app', requireAdmin, async (_req, res) => {
  const settings = await prisma.appSetting.findMany({ orderBy: { key: 'asc' } })
  res.json(settings)
})

settingsRouter.put('/app', requireAdmin, validate(appSettingSchema), async (req, res) => {
  const { key, value } = req.body as z.infer<typeof appSettingSchema>
  const setting = await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
  res.json(setting)
})
