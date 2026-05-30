import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../middleware/validate'
import { createLinkToken, exchangePublicToken, syncAllBalances, disconnectItem, listItems } from '../services/plaid'

export const plaidRouter = Router()

const exchangeSchema = z.object({ publicToken: z.string().min(1), institutionName: z.string().min(1) })

plaidRouter.get('/items', async (req, res) => {
  try { res.json(await listItems(req.userId)) }
  catch { res.status(500).json({ error: 'Failed to list linked items' }) }
})

plaidRouter.get('/link-token', async (req, res) => {
  try { res.json({ linkToken: await createLinkToken(req.userId) }) }
  catch { res.status(500).json({ error: 'Failed to create link token' }) }
})

plaidRouter.post('/exchange', validate(exchangeSchema), async (req, res) => {
  const { publicToken, institutionName } = req.body as z.infer<typeof exchangeSchema>
  try { await exchangePublicToken(publicToken, institutionName, req.userId); res.json({ ok: true }) }
  catch { res.status(500).json({ error: 'Failed to exchange token' }) }
})

plaidRouter.post('/sync', async (req, res) => {
  try { res.json(await syncAllBalances(req.userId)) }
  catch { res.status(500).json({ error: 'Sync failed' }) }
})

plaidRouter.delete('/items/:itemId', async (req, res) => {
  try { await disconnectItem(req.params.itemId as string, req.userId); res.json({ ok: true }) }
  catch { res.status(404).json({ error: 'Item not found' }) }
})
