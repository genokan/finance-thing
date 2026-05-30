import cron from 'node-cron'
import { prisma } from './prisma'
import { buildSnapshot } from '../routes/snapshots'

// Auto-capture a monthly snapshot for every user so the history time series
// builds without manual recording. Runs at 03:00 on the 1st of each month.
export function startScheduler() {
  cron.schedule('0 3 1 * *', async () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    try {
      const users = await prisma.user.findMany({ select: { id: true } })
      for (const u of users) {
        await buildSnapshot(u.id, year, month)
      }
      console.log(`Auto-snapshot captured for ${users.length} user(s): ${year}-${month}`)
    } catch (err) {
      console.error('Auto-snapshot failed:', err instanceof Error ? err.message : err)
    }
  })
}
