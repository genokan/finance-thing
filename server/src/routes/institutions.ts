import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'

export const institutionsRouter = Router()

// Institution rows are shared by name (Plaid dedup) and have no userId, so every
// query is scoped to institutions the requesting user actually references — via
// their accounts, debts, or Plaid items — to avoid cross-tenant reads/writes.
const institutionSchema = z.object({ name: z.string().min(1).max(120) })

function userScope(userId: string) {
  return {
    OR: [
      { accounts: { some: { userId } } },
      { debts: { some: { userId } } },
      { plaidItems: { some: { userId } } },
    ],
  }
}

async function userReferences(userId: string, id: string): Promise<boolean> {
  return !!(await prisma.institution.findFirst({ where: { id, ...userScope(userId) }, select: { id: true } }))
}

institutionsRouter.get('/', async (req, res) => {
  const userId = req.userId
  const [institutions, accounts, debts] = await Promise.all([
    prisma.institution.findMany({ where: userScope(userId), orderBy: { name: 'asc' } }),
    prisma.account.findMany({ where: { userId }, select: { institutionId: true } }),
    prisma.debt.findMany({ where: { userId }, select: { institutionId: true } }),
  ])
  // Per-user link counts only — never expose other tenants' usage.
  const linked = new Map<string, number>()
  for (const a of accounts) if (a.institutionId) linked.set(a.institutionId, (linked.get(a.institutionId) ?? 0) + 1)
  for (const d of debts) if (d.institutionId) linked.set(d.institutionId, (linked.get(d.institutionId) ?? 0) + 1)
  res.json(institutions.map((i) => ({ ...i, linked: linked.get(i.id) ?? 0 })))
})

institutionsRouter.post('/', validate(institutionSchema), async (req, res) => {
  const data = req.body as z.infer<typeof institutionSchema>
  const institution = await prisma.institution.upsert({ where: { name: data.name }, create: data, update: {} })
  res.status(201).json(institution)
})

institutionsRouter.put('/:id', validate(institutionSchema), async (req, res) => {
  const id = req.params.id as string
  if (!(await userReferences(req.userId, id))) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const data = req.body as z.infer<typeof institutionSchema>
  try {
    const institution = await prisma.institution.update({ where: { id }, data: { name: data.name } })
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
  if (!(await userReferences(req.userId, id))) {
    res.status(404).json({ error: 'Not found' })
    return
  }
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
