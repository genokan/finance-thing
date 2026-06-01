import { Router } from 'express'
import { z } from 'zod'
import { logger } from '../lib/logger'

// Ingest browser-side logs so frontend errors land in the same Pino stream as
// the backend. Intentionally public (no auth) so failures around login still
// report. A malformed payload is swallowed — logging must never error the user.
export const clientLogsRouter = Router()

const clientLogger = logger.child({ source: 'client' })

const schema = z.object({
  level: z.enum(['error', 'warn', 'info']).default('error'),
  message: z.string().min(1).max(2000),
  context: z.record(z.unknown()).optional(),
})

clientLogsRouter.post('/', (req, res) => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(204).end()
    return
  }
  const { level, message, context } = parsed.data
  clientLogger[level]({ ...context, ua: req.headers['user-agent'] }, message)
  res.status(204).end()
})
