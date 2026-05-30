import Papa from 'papaparse'
import { z } from 'zod'

const csvRowSchema = z.object({
  account_name: z.string().min(1),
  institution: z.string().optional(),
  type: z.enum(['BROKERAGE','IRA','ROTH_IRA','PLAN_401K','DEFINED_CONTRIBUTION','RSU','SAVINGS','MONEY_MARKET','CHECKING']),
  value: z.coerce.number().nonnegative(),
  ticker: z.string().optional(),
  shares: z.coerce.number().positive().optional(),
})

export type CsvRow = z.infer<typeof csvRowSchema>
export interface CsvParseResult { valid: CsvRow[]; errors: { row: number; message: string }[] }

export function parseCsv(csvText: string): CsvParseResult {
  const { data, errors: parseErrors } = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true, transformHeader: h => h.trim().toLowerCase().replace(/\s+/g, '_') })
  if (parseErrors.length > 0) return { valid: [], errors: parseErrors.map(e => ({ row: e.row ?? 0, message: e.message })) }
  const valid: CsvRow[] = [], errors: { row: number; message: string }[] = []
  data.forEach((row, i) => {
    const r = csvRowSchema.safeParse(row)
    if (r.success) valid.push(r.data)
    else errors.push({ row: i + 2, message: r.error.issues.map(iss => iss.message).join(', ') })
  })
  return { valid, errors }
}
