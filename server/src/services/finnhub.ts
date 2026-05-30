import { prisma } from '../lib/prisma'

const FINNHUB_BASE = 'https://finnhub.io/api/v1'
const DELAY_MS = 500

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function fetchQuote(ticker: string): Promise<number | null> {
  const key = process.env.FINNHUB_API_KEY
  if (!key) return null
  const res = await fetch(`${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(ticker)}&token=${key}`)
  if (!res.ok) return null
  const data = await res.json() as { c?: number }
  return data.c ?? null
}

export async function refreshAllPrices(userId: string): Promise<{ updated: number; failed: string[] }> {
  const accounts = await prisma.investmentAccount.findMany({ where: { userId, isActive: true, ticker: { not: null } } })
  let updated = 0
  const failed: string[] = []
  for (const account of accounts) {
    await sleep(DELAY_MS)
    const price = await fetchQuote(account.ticker!)
    if (price === null) { failed.push(account.ticker!); continue }
    const shares = account.type === 'RSU' ? Number(account.vestedShares ?? 0) : Number(account.shares ?? 0)
    const unvestedShares = account.type === 'RSU' ? Number(account.unvestedShares ?? 0) : 0
    await prisma.investmentAccount.update({ where: { id: account.id }, data: { currentValue: shares * price, unvestedValue: unvestedShares > 0 ? unvestedShares * price : undefined, lastUpdatedAt: new Date() } })
    updated++
  }
  return { updated, failed }
}
