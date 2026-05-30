const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const usdCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function money(value: number | string | null | undefined, cents = false): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0)
  if (Number.isNaN(n)) return '$0'
  return cents ? usdCents.format(n) : usd.format(n)
}

export function percent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`
}

export function intervalLabel(count: number, unit: string): string {
  const u = unit.toLowerCase()
  if (count === 1) {
    return { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' }[u] ?? `every ${u}`
  }
  return `every ${count} ${u}s`
}

export function dateLabel(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}
