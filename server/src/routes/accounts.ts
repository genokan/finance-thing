import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'
import { withValue } from '../lib/accountValue'
import { refreshAllPrices } from '../services/finnhub'
import { ownsAccount } from '../lib/ownership'

export const accountsRouter = Router()

// Must match the AccountKind enum in schema.prisma — Accounts is the spine for
// assets AND liabilities, so the liability kinds belong here too.
const ACCOUNT_KINDS = [
  'CHECKING', 'SAVINGS', 'MONEY_MARKET', 'BROKERAGE', 'IRA', 'ROTH_IRA',
  'PLAN_401K', 'DEFINED_CONTRIBUTION', 'HSA', 'RSU',
  'CREDIT_CARD', 'LOAN', 'LINE_OF_CREDIT', 'MORTGAGE', 'OTHER',
] as const

const accountSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(ACCOUNT_KINDS),
  trackingMode: z.enum(['BALANCE', 'HOLDINGS']).default('BALANCE'),
  balance: z.coerce.number().default(0),
  apy: z.coerce.number().nonnegative().nullish(),
  isEmergencyFund: z.coerce.boolean().default(false),
  institutionId: z.string().cuid().optional(),
})

const holdingSchema = z.object({
  label: z.string().min(1).max(200),
  ticker: z.string().max(10).optional(),
  shares: z.coerce.number().optional(),
  value: z.coerce.number().nonnegative(),
  costBasis: z.coerce.number().optional(),
  vestedShares: z.coerce.number().optional(),
  unvestedShares: z.coerce.number().optional(),
  unvestedValue: z.coerce.number().optional(),
})

const include = { holdings: { where: { isActive: true } }, institution: true } as const

accountsRouter.get('/', async (req, res) => {
  const accounts = await prisma.account.findMany({
    where: { userId: req.userId, isActive: true },
    include,
    orderBy: { createdAt: 'asc' },
  })
  res.json(accounts.map(withValue))
})

accountsRouter.post('/', validate(accountSchema), async (req, res) => {
  const data = req.body as z.infer<typeof accountSchema>
  const account = await prisma.account.create({
    data: { ...data, userId: req.userId, lastUpdatedAt: new Date() },
    include,
  })
  res.status(201).json(withValue(account))
})

accountsRouter.put('/:id', validate(accountSchema), async (req, res) => {
  const data = req.body as z.infer<typeof accountSchema>
  try {
    const account = await prisma.account.update({
      where: { id: req.params.id as string, userId: req.userId },
      data: { ...data, lastUpdatedAt: new Date() },
      include,
    })
    res.json(withValue(account))
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})

accountsRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.account.update({ where: { id: req.params.id as string, userId: req.userId }, data: { isActive: false } })
    res.json({ ok: true })
  } catch {
    res.status(404).json({ error: 'Not found' })
  }
})

accountsRouter.post('/:id/holdings', validate(holdingSchema), async (req, res) => {
  const accountId = req.params.id as string
  if (!(await ownsAccount(req.userId, accountId))) {
    res.status(404).json({ error: 'Account not found' })
    return
  }
  const data = req.body as z.infer<typeof holdingSchema>
  const holding = await prisma.holding.create({ data: { ...data, accountId, lastUpdatedAt: new Date() } })
  res.status(201).json(holding)
})

accountsRouter.put('/:id/holdings/:hid', validate(holdingSchema), async (req, res) => {
  const accountId = req.params.id as string
  if (!(await ownsAccount(req.userId, accountId))) {
    res.status(404).json({ error: 'Account not found' })
    return
  }
  const data = req.body as z.infer<typeof holdingSchema>
  try {
    const holding = await prisma.holding.update({
      where: { id: req.params.hid as string, accountId },
      data: { ...data, lastUpdatedAt: new Date() },
    })
    res.json(holding)
  } catch {
    res.status(404).json({ error: 'Holding not found' })
  }
})

accountsRouter.delete('/:id/holdings/:hid', async (req, res) => {
  const accountId = req.params.id as string
  if (!(await ownsAccount(req.userId, accountId))) {
    res.status(404).json({ error: 'Account not found' })
    return
  }
  try {
    await prisma.holding.update({ where: { id: req.params.hid as string, accountId }, data: { isActive: false } })
    res.json({ ok: true })
  } catch {
    res.status(404).json({ error: 'Holding not found' })
  }
})

accountsRouter.post('/refresh-prices', async (req, res) => {
  res.json(await refreshAllPrices(req.userId))
})
