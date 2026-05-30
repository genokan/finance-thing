export type IntervalUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'
export type CategoryType = 'ESSENTIAL' | 'DISCRETIONARY'
export type InvestmentType =
  | 'BROKERAGE'
  | 'IRA'
  | 'ROTH_IRA'
  | 'PLAN_401K'
  | 'DEFINED_CONTRIBUTION'
  | 'RSU'
  | 'SAVINGS'
  | 'MONEY_MARKET'
  | 'CHECKING'
export type DebtType = 'SHORT_TERM' | 'LONG_TERM'

export interface Category {
  id: string
  name: string
  type: CategoryType
}

export interface Institution {
  id: string
  name: string
}

export interface Expense {
  id: string
  name: string
  amount: string
  intervalCount: number
  intervalUnit: IntervalUnit
  categoryId: string
  category: Category
  notes: string | null
  expiresAt: string | null
  renewsAt: string | null
  monthlyEquivalent: number
}

export interface Distribution {
  id?: string
  accountName: string
  amount: string
}

export interface IncomeSource {
  id: string
  name: string
  amount: string
  intervalCount: number
  intervalUnit: IntervalUnit
  distributions: Distribution[]
}

export interface Investment {
  id: string
  name: string
  type: InvestmentType
  ticker: string | null
  shares: string | null
  vestedShares: string | null
  unvestedShares: string | null
  unvestedValue: string | null
  institutionId: string | null
  institution: Institution | null
  currentValue: string
  lastUpdatedAt: string | null
}

export interface Debt {
  id: string
  name: string
  type: DebtType
  principal: string
  monthlyPayment: string
  apr: string
  institutionId: string | null
  institution: Institution | null
  payoffDate: string | null
  promoApr: string | null
  notes: string | null
}

export interface Dashboard {
  totalIncome: number
  totalExpenses: number
  essentialExpenses: number
  discretionaryExpenses: number
  debtPayments: number
  liquidNetWorth: number
  totalNetWorth: number
  liquidCash: number
  vestedInvestments: number
  unvestedRSUs: number
  fiftyThirtyTwenty: { needsPercent: number; wantsPercent: number; savingsPercent: number }
  recentSnapshots: { year: number; month: number; netWorth: string }[]
  upcomingAlerts: { id: string; name: string; expiresAt: string | null; renewsAt: string | null }[]
}

export interface Insights {
  benchmarkRate: number
  debtAnalysis: {
    id: string
    name: string
    apr: number
    benchmark: number
    opportunityCostPercent: number
    verdict: 'PAY_OFF' | 'BALANCED' | 'KEEP'
  }[]
  emergencyFund: {
    liquidCash: number
    monthlyEssentialExpenses: number
    monthsCovered: number
    status: 'ADEQUATE' | 'MINIMUM' | 'LOW'
  }
  promoAlerts: { id: string; name: string; payoffDate: string; promoApr: number; daysRemaining: number }[]
  highAprDebts: { id: string; name: string; apr: number; principal: number }[]
}

export interface SnapshotListItem {
  id: string
  year: number
  month: number
  netWorth: string
  createdAt: string
}

export interface Settings {
  email: string
  benchmarkRate: string | null
  isAdmin: boolean
}

export interface ManagedUser {
  id: string
  email: string
  isAdmin: boolean
  createdAt: string
}
