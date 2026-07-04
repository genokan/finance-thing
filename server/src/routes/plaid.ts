import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../middleware/validate'
import { createLinkToken, exchangePublicToken, syncAllBalances, disconnectItem, listItems, markItemRelinked, handleWebhook, verifyPlaidWebhook } from '../services/plaid'
import { logger } from '../lib/logger'

export const plaidRouter = Router()

// Public — Plaid calls this; mounted before the auth gate in app.ts.
export const plaidWebhookRouter = Router()
plaidWebhookRouter.post('/', async (req, res) => {
  // Signature is mandatory outside sandbox; in sandbox an unsigned local test
  // is allowed but logged, so dev tooling keeps working.
  const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody
  const verified = await verifyPlaidWebhook(rawBody, req.header('Plaid-Verification')).catch(() => false)
  if (!verified) {
    if ((process.env.PLAID_ENV ?? 'sandbox') !== 'sandbox') {
      res.status(401).json({ error: 'Invalid webhook signature' })
      return
    }
    logger.warn('Plaid webhook accepted without a valid signature (sandbox only)')
  }
  try {
    await handleWebhook(req.body ?? {})
  } catch (err) {
    logger.error({ err }, 'Plaid webhook handling failed')
  }
  // 200 on handled requests — Plaid retries non-2xx.
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
