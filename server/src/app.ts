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
import { investmentsRouter } from './routes/investments'
import { debtsRouter } from './routes/debts'
import { snapshotsRouter } from './routes/snapshots'
import { insightsRouter } from './routes/insights'
import { settingsRouter } from './routes/settings'
import { plaidRouter } from './routes/plaid'
import { globalRateLimiter } from './middleware/rateLimiter'
import { authenticate } from './middleware/auth'

export function createApp() {
  const app = express()

  // Helmet's default CSP blocks the Vite-built assets / inline bootstrap; relax it
  // since this is a single-origin app serving its own trusted bundle.
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(express.json({ limit: '10mb' }))
  app.use(cookieParser())
  app.use(globalRateLimiter)

  // Public routes
  app.use('/api/auth', authRouter)

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
  app.use('/api/investments', investmentsRouter)
  app.use('/api/debts', debtsRouter)
  app.use('/api/snapshots', snapshotsRouter)
  app.use('/api/insights', insightsRouter)
  app.use('/api/settings', settingsRouter)
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

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err.message)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
