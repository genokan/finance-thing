import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'
import { refreshAllPrices } from '../services/finnhub'
import { parseCsv } from '../services/csv'

export const investmentsRouter = Router()

const investmentSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['BROKERAGE','IRA','ROTH_IRA','PLAN_401K','DEFINED_CONTRIBUTION','RSU','SAVINGS','MONEY_MARKET','CHECKING']),
  ticker: z.string().max(10).optional(),
  shares: z.coerce.number().positive().optional(),
  vestedShares: z.coerce.number().positive().optional(),
  unvestedShares: z.coerce.number().positive().optional(),
  unvestedValue: z.coerce.number().nonnegative().optional(),
  institutionId: z.string().cuid().optional(),
  currentValue: z.coerce.number().nonnegative(),
})

investmentsRouter.get('/', async (req, res) => {
  const accounts = await prisma.investmentAccount.findMany({ where: { userId: req.userId, isActive: true }, include: { institution: true }, orderBy: { currentValue: 'desc' } })
  res.json(accounts)
})

investmentsRouter.post('/', validate(investmentSchema), async (req, res) => {
  const data = req.body as z.infer<typeof investmentSchema>
  const account = await prisma.investmentAccount.create({ data: { ...data, userId: req.userId }, include: { institution: true } })
  res.status(201).json(account)
})

investmentsRouter.put('/:id', validate(investmentSchema), async (req, res) => {
  const data = req.body as z.infer<typeof investmentSchema>
  const id = req.params.id as string
  try {
    const account = await prisma.investmentAccount.update({ where: { id, userId: req.userId }, data: { ...data, lastUpdatedAt: new Date() }, include: { institution: true } })
    res.json(account)
  } catch { res.status(404).json({ error: 'Not found' }) }
})

investmentsRouter.delete('/:id', async (req, res) => {
  const id = req.params.id as string
  try {
    await prisma.investmentAccount.update({ where: { id, userId: req.userId }, data: { isActive: false } })
    res.json({ ok: true })
  } catch { res.status(404).json({ error: 'Not found' }) }
})

investmentsRouter.post('/refresh-prices', async (req, res) => {
  const result = await refreshAllPrices(req.userId)
  res.json(result)
})

investmentsRouter.post('/import-csv', async (req, res) => {
  const { csv } = req.body as { csv?: string }
  if (!csv || typeof csv !== 'string') { res.status(400).json({ error: 'csv field required' }); return }
  const { valid, errors } = parseCsv(csv)
  if (errors.length > 0 && valid.length === 0) { res.status(400).json({ errors }); return }
  const results = []
  for (const row of valid) {
    let institutionId: string | undefined
    if (row.institution) {
      const inst = await prisma.institution.upsert({ where: { name: row.institution }, create: { name: row.institution }, update: {} })
      institutionId = inst.id
    }
    const account = await prisma.investmentAccount.create({ data: { name: row.account_name, type: row.type, currentValue: row.value, ticker: row.ticker, shares: row.shares, institutionId, userId: req.userId } })
    results.push(account)
  }
  res.status(201).json({ imported: results.length, errors })
})
