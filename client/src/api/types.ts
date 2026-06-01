export type IntervalUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'
export type BudgetBucket = 'ESSENTIAL' | 'DISCRETIONARY' | 'SAVINGS'
export type CategoryScope = 'EXPENSE' | 'INCOME' | 'DEBT' | 'ANY'
export type ExpenseKind = 'RECURRING' | 'ONE_TIME'
export type AccountKind =
  | 'CHECKING' | 'SAVINGS' | 'MONEY_MARKET' | 'BROKERAGE' | 'IRA' | 'ROTH_IRA'
  | 'PLAN_401K' | 'DEFINED_CONTRIBUTION' | 'HSA' | 'RSU'
  | 'CREDIT_CARD' | 'LOAN' | 'LINE_OF_CREDIT' | 'MORTGAGE' | 'OTHER'
export type TrackingMode = 'BALANCE' | 'HOLDINGS'
export type IncomeType = 'W2' | 'SELF_1099' | 'OTHER'
export type PayFrequency = 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY' | 'ANNUAL'
export type TaxMode = 'FLAT' | 'BRACKET'
export type FilingStatus = 'SINGLE' | 'MARRIED_JOINT' | 'MARRIED_SEPARATE' | 'HEAD_OF_HOUSEHOLD'
export type DebtTerm = 'SHORT_TERM' | 'LONG_TERM'
export type DebtKind = 'CREDIT_CARD' | 'CAR_LOAN' | 'MORTGAGE' | 'STUDENT_LOAN' | 'PERSONAL' | 'OTHER'

export interface Institution {
  id: string
  name: string
}

export interface Category {
  id: string
  name: string
  parentId: string | null
  bucket: BudgetBucket
  monthlyBudget: string | null
  appliesTo: CategoryScope
}

export interface Holding {
  id: string
  accountId: string
  label: string
  ticker: string | null
  shares: string | null
  value: string
  costBasis: string | null
  vestedShares: string | null
  unvestedShares: string | null
  unvestedValue: string | null
}

export interface Account {
  id: string
  name: string
  kind: AccountKind
  trackingMode: TrackingMode
  balance: string
  apy: string | null
  isEmergencyFund: boolean
  institutionId: string | null
  institution: Institution | null
  holdings: Holding[]
  value: number
  unvestedValue: number
  lastUpdatedAt: string | null
}

export interface Expense {
  id: string
  name: string
  amount: string
  kind: ExpenseKind
  intervalCount: number
  intervalUnit: IntervalUnit
  dueDate: string | null
  bucket: BudgetBucket | null
  categoryId: string | null
  category: Category | null
  notes: string | null
  expiresAt: string | null
  renewsAt: string | null
  monthlyEquivalent: number
}

export interface Deduction {
  id?: string
  name: string
  amount: string
  preTax: boolean
  linkedAccountId?: string | null
}

export interface Distribution {
  id?: string
  accountId: string | null
  amount: string
  account?: Account | null
}

export interface TaxBreakdown {
  mode: TaxMode
  grossAnnual: number
  federal: number
  socialSecurity: number
  medicare: number
  state: number
  preTaxDeductions: number
  postTaxDeductions: number
  netAnnual: number
  netMonthly: number
  effectiveRate: number
}

export interface IncomeSource {
  id: string
  name: string
  type: IncomeType
  grossAnnual: string | null
  grossPerPaycheck: string | null
  payFrequency: PayFrequency
  taxMode: TaxMode
  flatEffectiveRate: string | null
  filingStatus: FilingStatus | null
  stateRate: string | null
  deductions: Deduction[]
  distributions: Distribution[]
  tax: TaxBreakdown
}

export type ContributionKind = 'RETIREMENT' | 'SAVINGS' | 'BROKERAGE' | 'EXTRA_DEBT' | 'OTHER'

export interface Contribution {
  id: string
  name: string
  amount: string
  intervalCount: number
  intervalUnit: IntervalUnit
  kind: ContributionKind
  destinationAccountId: string | null
  destinationAccount: Account | null
  notes: string | null
  monthlyEquivalent: number
}

export interface Debt {
  id: string
  name: string
  term: DebtTerm
  kind: DebtKind
  bucket: BudgetBucket | null
  categoryId: string | null
  category: Category | null
  accountId: string | null
  account: Account | null
  principal: string
  originalPrincipal: string | null
  monthlyPayment: string
  termMonths: number | null
  // computed by the server
  principalValue: number
  minimumPayment: number
  actualPayment: number
  effectivePayment: number
  apr: string
  institutionId: string | null
  institution: Institution | null
  payoffDate: string | null
  isZeroPromo: boolean
  promoEndsAt: string | null
  postPromoApr: string | null
  notes: string | null
}

export interface Dashboard {
  liquidNetWorth: number
  totalNetWorth: number
  liquidCash: number
  vestedInvestments: number
  unvestedRSUs: number
  grossMonthlyIncome: number
  netMonthlyIncome: number
  totalExpenses: number
  essentialExpenses: number
  discretionaryExpenses: number
  debtPayments: number
  contributions: number
  unallocated: number
  totalDebt: number
  fiftyThirtyTwenty: { needsPercent: number; wantsPercent: number; savingsPercent: number }
  recentSnapshots: { year: number; month: number; netWorth: string; liquidNetWorth: string | null }[]
  upcomingAlerts: { id: string; name: string; kind: ExpenseKind; dueDate: string | null; expiresAt: string | null; renewsAt: string | null }[]
}

export interface Insights {
  benchmarkRate: number
  debtAnalysis: { id: string; name: string; apr: number; benchmark: number; opportunityCostPercent: number; verdict: 'PAY_OFF' | 'BALANCED' | 'KEEP' }[]
  emergencyFund: { liquidCash: number; monthlyEssentialExpenses: number; monthsCovered: number; status: 'ADEQUATE' | 'MINIMUM' | 'LOW'; designated: boolean }
  promoAlerts: { id: string; name: string; promoEndsAt: string; postPromoApr: number; daysRemaining: number }[]
  highAprDebts: { id: string; name: string; apr: number; principal: number }[]
}

export interface BudgetOverview {
  totalMonthlyIncome: number
  buckets: { bucket: BudgetBucket; actual: number; percentOfIncome: number }[]
  categories: { id: string; name: string; parentId: string | null; bucket: BudgetBucket; monthlyBudget: number | null; actual: number }[]
}

export interface SnapshotListItem {
  id: string
  year: number
  month: number
  netWorth: string
  liquidNetWorth: string | null
  createdAt: string
}

export interface Settings {
  email: string
  benchmarkRate: string | null
  filingStatus: FilingStatus | null
  stateRate: string | null
  isAdmin: boolean
}

export interface ManagedUser {
  id: string
  email: string
  isAdmin: boolean
  createdAt: string
}
