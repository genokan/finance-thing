import './lib/env'
import { createApp } from './app'
import { startScheduler } from './lib/scheduler'
import { logger } from './lib/logger'

const port = parseInt(process.env.PORT ?? '3000', 10)
if (isNaN(port)) throw new Error(`Invalid PORT: "${process.env.PORT}"`)

const app = createApp()
app.listen(port, () => {
  logger.info(`Server listening on port ${port}`)
  startScheduler()
})
