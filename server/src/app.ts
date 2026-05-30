import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { authRouter } from './routes/auth'
import { dashboardRouter } from './routes/dashboard'
import { expensesRouter } from './routes/expenses'
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

  app.use(helmet())
  app.use(express.json({ limit: '10mb' }))
  app.use(cookieParser())
  app.use(globalRateLimiter)

  // Public routes
  app.use('/api/auth', authRouter)

  // Protected routes
  app.use('/api', authenticate)
  app.use('/api/dashboard', dashboardRouter)
  app.use('/api/expenses', expensesRouter)
  app.use('/api/income', incomeRouter)
  app.use('/api/investments', investmentsRouter)
  app.use('/api/debts', debtsRouter)
  app.use('/api/snapshots', snapshotsRouter)
  app.use('/api/insights', insightsRouter)
  app.use('/api/settings', settingsRouter)
  app.use('/api/plaid', plaidRouter)

  return app
}
