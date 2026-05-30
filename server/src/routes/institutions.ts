import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'

export const institutionsRouter = Router()

// Institutions are shared/global (single-user app) — keyed by unique name.
const institutionSchema = z.object({ name: z.string().min(1).max(120) })

institutionsRouter.get('/', async (_req, res) => {
  const institutions = await prisma.institution.findMany({ orderBy: { name: 'asc' } })
  res.json(institutions)
})

institutionsRouter.post('/', validate(institutionSchema), async (req, res) => {
  const data = req.body as z.infer<typeof institutionSchema>
  const institution = await prisma.institution.upsert({
    where: { name: data.name },
    create: data,
    update: {},
  })
  res.status(201).json(institution)
})
