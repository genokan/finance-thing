import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'

export const institutionsRouter = Router()

// Institutions are shared/global (single-user app) — keyed by unique name.
const institutionSchema = z.object({ name: z.string().min(1).max(120) })

institutionsRouter.get('/', async (_req, res) => {
  const institutions = await prisma.institution.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { accounts: true, debts: true, plaidItems: true } } },
  })
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

institutionsRouter.put('/:id', validate(institutionSchema), async (req, res) => {
  const data = req.body as z.infer<typeof institutionSchema>
  try {
    const institution = await prisma.institution.update({ where: { id: req.params.id as string }, data: { name: data.name } })
    res.json(institution)
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: 'An institution with that name already exists' })
      return
    }
    res.status(404).json({ error: 'Not found' })
  }
})

institutionsRouter.delete('/:id', async (req, res) => {
  const id = req.params.id as string
  // Refuse to delete while anything still points at it (FK would fail anyway).
  const [accounts, debts, plaidItems] = await Promise.all([
    prisma.account.count({ where: { institutionId: id } }),
    prisma.debt.count({ where: { institutionId: id } }),
    prisma.plaidItem.count({ where: { institutionId: id } }),
  ])
  const inUse = accounts + debts + plaidItems
  if (inUse > 0) {
    res.status(409).json({ error: `In use by ${inUse} account(s)/debt(s) — reassign or remove those first` })
    return
  }
  try {
    await prisma.institution.delete({ where: { id } })
    res.json({ ok: true })
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})
