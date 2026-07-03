import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import path from 'path'
import fs from 'fs'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { authRouter } from './routes/auth'
import { dashboardRouter } from './routes/dashboard'
import { expensesRouter } from './routes/expenses'
import { categoriesRouter } from './routes/categories'
import { institutionsRouter } from './routes/institutions'
import { incomeRouter } from './routes/income'
import { accountsRouter } from './routes/accounts'
import { budgetsRouter } from './routes/budgets'
import { debtsRouter } from './routes/debts'
import { contributionsRouter } from './routes/contributions'
import { snapshotsRouter } from './routes/snapshots'
import { projectionsRouter } from './routes/projections'
import { scenariosRouter } from './routes/scenarios'
import { insightsRouter } from './routes/insights'
import { settingsRouter } from './routes/settings'
import { usersRouter } from './routes/users'
import { plaidRouter, plaidWebhookRouter } from './routes/plaid'
import { globalRateLimiter } from './middleware/rateLimiter'
import { authenticate } from './middleware/auth'
import pinoHttp from 'pino-http'
import { logger } from './lib/logger'
import { clientLogsRouter } from './routes/clientLogs'

export function createApp() {
  const app = express()

  // Helmet's default CSP blocks the Vite-built assets / inline bootstrap; relax it
  // since this is a single-origin app serving its own trusted bundle.
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(express.json({ limit: '10mb' }))
  app.use(cookieParser())
  app.use(globalRateLimiter)

  // HTTP access logging is off by default; enable with HTTP_ACCESS_LOG=true.
  if (process.env.HTTP_ACCESS_LOG === 'true') {
    app.use(pinoHttp({ logger }))
  }

  // Public routes
  app.use('/api/auth', authRouter)
  // Browser log ingestion is public so pre-login client errors still report.
  app.use('/api/client-logs', clientLogsRouter)
  // Plaid webhooks are unauthenticated by nature (Plaid is the caller).
  app.use('/api/plaid/webhook', plaidWebhookRouter)

  // Protected routes — skip /api/auth which is handled above
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/auth')) return next()
    authenticate(req, res, next)
  })
  app.use('/api/dashboard', dashboardRouter)
  app.use('/api/expenses', expensesRouter)
  app.use('/api/categories', categoriesRouter)
  app.use('/api/institutions', institutionsRouter)
  app.use('/api/income', incomeRouter)
  app.use('/api/accounts', accountsRouter)
  app.use('/api/budgets', budgetsRouter)
  app.use('/api/debts', debtsRouter)
  app.use('/api/contributions', contributionsRouter)
  app.use('/api/snapshots', snapshotsRouter)
  app.use('/api/projections', projectionsRouter)
  app.use('/api/scenarios', scenariosRouter)
  app.use('/api/insights', insightsRouter)
  app.use('/api/settings', settingsRouter)
  app.use('/api/users', usersRouter)
  app.use('/api/plaid', plaidRouter)

  // Unknown /api routes should 404 as JSON, never fall through to the SPA.
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' })
  })

  // Serve the compiled React app (built into ../public relative to dist/) and
  // fall back to index.html for client-side routing. Only active when the build exists.
  const clientDir = path.join(__dirname, '..', 'public')
  const indexHtml = path.join(clientDir, 'index.html')
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(clientDir))
    app.get(/.*/, (_req: Request, res: Response) => {
      res.sendFile(indexHtml)
    })
  }

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled request error')
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
