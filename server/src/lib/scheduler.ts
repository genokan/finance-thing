import cron from 'node-cron'
import { prisma } from './prisma'
import { logger } from './logger'
import { buildSnapshot } from '../routes/snapshots'
import { syncAllBalances } from '../services/plaid'

/**
 * Ensure every user with accounts has a snapshot for the month that just
 * ended. Create-if-missing (never replaces), so a manual month-end snapshot
 * always wins; running daily + on boot means a server asleep on the 1st
 * backfills the month instead of silently skipping it.
 */
export async function ensureMonthlySnapshots(): Promise<void> {
  const now = new Date()
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth() // getMonth() is 0-based → previous month's 1-based number
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  try {
    const users = await prisma.user.findMany({
      where: { accounts: { some: { isActive: true } } },
      select: { id: true, snapshots: { where: { year: prevYear, month: prevMonth }, select: { id: true } } },
    })
    let created = 0
    for (const u of users) {
      if (u.snapshots.length > 0) continue
      await buildSnapshot(u.id, prevYear, prevMonth)
      created++
    }
    if (created > 0) logger.info(`Auto-snapshot backfilled ${created} user(s) for ${prevYear}-${prevMonth}`)
  } catch (err) {
    logger.error({ err }, 'Auto-snapshot job failed')
  }
}

/** Refresh Plaid balances daily so dashboards and snapshots stay current. */
export async function syncPlaidBalances(): Promise<void> {
  try {
    const owners = await prisma.plaidItem.findMany({ select: { userId: true }, distinct: ['userId'] })
    for (const { userId } of owners) {
      const { synced, failed } = await syncAllBalances(userId)
      if (failed.length > 0) logger.warn({ userId, failed }, `Plaid sync: ${synced} account(s) ok, ${failed.length} institution(s) failed`)
    }
  } catch (err) {
    logger.error({ err }, 'Scheduled Plaid sync failed')
  }
}

export function startScheduler() {
  // Balances first (02:30), snapshots after (03:00) so a month-end snapshot
  // captures freshly-synced numbers.
  cron.schedule('30 2 * * *', syncPlaidBalances)
  cron.schedule('0 3 * * *', ensureMonthlySnapshots)
  // Boot-time catch-up: a homelab box that slept through the 1st still gets
  // last month's snapshot the next time it starts.
  void ensureMonthlySnapshots()
}
