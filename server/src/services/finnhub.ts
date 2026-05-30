import { prisma } from '../lib/prisma'

const FINNHUB_BASE = 'https://finnhub.io/api/v1'
const DELAY_MS = 500

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

async function fetchQuote(ticker: string): Promise<number | null> {
  const key = process.env.FINNHUB_API_KEY
  if (!key) return null
  const res = await fetch(`${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(ticker)}&token=${key}`)
  if (!res.ok) return null
  const data = (await res.json()) as { c?: number }
  return data.c ?? null
}

// Refresh market value of every holding that has a ticker (and shares), for the
// given user's active accounts. RSU-style holdings revalue vested + unvested.
export async function refreshAllPrices(userId: string): Promise<{ updated: number; failed: string[] }> {
  const holdings = await prisma.holding.findMany({
    where: { isActive: true, ticker: { not: null }, account: { userId, isActive: true } },
  })
  let updated = 0
  const failed: string[] = []
  for (const h of holdings) {
    await sleep(DELAY_MS)
    const price = await fetchQuote(h.ticker!)
    if (price === null) { failed.push(h.ticker!); continue }
    const vested = h.vestedShares != null ? Number(h.vestedShares) : h.shares != null ? Number(h.shares) : null
    const unvested = h.unvestedShares != null ? Number(h.unvestedShares) : 0
    await prisma.holding.update({
      where: { id: h.id },
      data: {
        value: vested != null ? vested * price : h.value,
        unvestedValue: unvested > 0 ? unvested * price : undefined,
        lastUpdatedAt: new Date(),
      },
    })
    updated++
  }
  return { updated, failed }
}
