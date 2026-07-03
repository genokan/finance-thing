import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../middleware/validate'
import { createLinkToken, exchangePublicToken, syncAllBalances, disconnectItem, listItems, markItemRelinked, handleWebhook } from '../services/plaid'
import { logger } from '../lib/logger'

export const plaidRouter = Router()

// Public — Plaid calls this; mounted before the auth gate in app.ts. The
// handler only toggles re-auth flags on known item_ids (see services/plaid).
export const plaidWebhookRouter = Router()
plaidWebhookRouter.post('/', async (req, res) => {
  try {
    await handleWebhook(req.body ?? {})
  } catch (err) {
    logger.error({ err }, 'Plaid webhook handling failed')
  }
  // Always 200 — Plaid retries non-2xx and the payload is only a hint.
  res.json({ ok: true })
})

const exchangeSchema = z.object({ publicToken: z.string().min(1), institutionName: z.string().min(1) })

plaidRouter.get('/items', async (req, res) => {
  try { res.json(await listItems(req.userId)) }
  catch { res.status(500).json({ error: 'Failed to list linked items' }) }
})

plaidRouter.get('/link-token', async (req, res) => {
  const relinkItemId = typeof req.query.relinkItemId === 'string' ? req.query.relinkItemId : undefined
  try { res.json({ linkToken: await createLinkToken(req.userId, relinkItemId) }) }
  catch { res.status(500).json({ error: 'Failed to create link token' }) }
})

// After a successful Link update-mode session (no exchange needed).
plaidRouter.post('/items/:itemId/relinked', async (req, res) => {
  try { await markItemRelinked(req.params.itemId as string, req.userId); res.json({ ok: true }) }
  catch { res.status(404).json({ error: 'Item not found' }) }
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
