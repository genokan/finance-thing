# finance-thing — Product Requirements Document

**Date:** 2026-05-29  
**Status:** Draft  
**Author:** Brandon Cantrell

---

## 1. Overview

`finance-thing` is a personal finance dashboard that replaces a manually maintained spreadsheet. It tracks monthly recurring expenses, income, investments, savings, and debt — and builds a time series of those values over time for trend analysis. It does **not** track day-to-day transactions.

The goal is to move from a quarterly check-in cadence to something more interactive, with automated data updates where possible (stock prices, account balances via Plaid) and manual entry or CSV import where automation isn't available.

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Backend | Node.js + Express + TypeScript | Prisma compatibility, single-language stack, mobile-ready API |
| Frontend | React + Vite + TypeScript | Modern, fast, familiar |
| ORM | Prisma | Preferred by user, excellent TypeScript support |
| Database | PostgreSQL (existing homelab instance) | Already deployed, not included in compose |
| Container | Single Docker image, multi-stage build | Vite builds static files; Node serves API + static frontend |
| Auth | JWT (short-lived) + httpOnly refresh token cookie | Secure, stateless |

---

## 3. Deployment

Single `docker-compose.yml` with one service: the app container. PostgreSQL is external (already running in homelab). Environment variables passed at runtime via `.env` file (never committed).

Multi-stage Dockerfile:
1. **Build stage**: install deps, `vite build` (frontend), `tsc` (backend)
2. **Runtime stage**: copy compiled output, `node dist/server.js`

The Express server serves the compiled React app as static files at `/` and mounts the REST API at `/api`.

---

## 4. Data Model

All monetary values stored as `Decimal` — never `Float`.

### Core Tables

```prisma
enum CategoryType {
  ESSENTIAL
  DISCRETIONARY
}

enum IntervalUnit {
  DAY
  WEEK
  MONTH
  YEAR
}

enum InvestmentType {
  BROKERAGE
  IRA
  ROTH_IRA
  PLAN_401K
  DEFINED_CONTRIBUTION
  RSU
  SAVINGS
  MONEY_MARKET
  CHECKING
}

enum DebtType {
  SHORT_TERM    // 0% APR promo, payoff-by-date
  LONG_TERM     // Student loans, car loans
}

model User {
  id              String   @id @default(cuid())
  email           String   @unique
  passwordHash    String
  benchmarkRate   Decimal? @db.Decimal(6, 4) // user's best current safe return rate (HYSA, MM, etc.)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model Category {
  id       String       @id @default(cuid())
  name     String       @unique
  type     CategoryType
  expenses ExpenseItem[]
}

model Institution {
  id                 String              @id @default(cuid())
  name               String              @unique
  investmentAccounts InvestmentAccount[]
  debts              Debt[]
  plaidItems         PlaidItem[]
}

model ExpenseItem {
  id            String       @id @default(cuid())
  name          String
  amount        Decimal      @db.Decimal(12, 2)
  intervalCount Int          @default(1)   // e.g. 2
  intervalUnit  IntervalUnit @default(MONTH) // e.g. WEEK → "every 2 weeks"
  categoryId    String
  category      Category     @relation(fields: [categoryId], references: [id])
  notes         String?
  expiresAt     DateTime?
  renewsAt      DateTime?
  isActive      Boolean      @default(true)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  snapshots     ExpenseSnapshot[]
}

model IncomeSource {
  id            String               @id @default(cuid())
  name          String
  amount        Decimal              @db.Decimal(12, 2)
  isActive      Boolean              @default(true)
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt
  distributions IncomeDistribution[]
  snapshots     IncomeSnapshot[]
}

model IncomeDistribution {
  id             String       @id @default(cuid())
  incomeSourceId String
  incomeSource   IncomeSource @relation(fields: [incomeSourceId], references: [id])
  accountName    String
  amount         Decimal      @db.Decimal(12, 2)
}

model InvestmentAccount {
  id             String         @id @default(cuid())
  name           String
  type           InvestmentType
  ticker         String?
  // For non-RSU accounts: shares * price = currentValue
  shares         Decimal?       @db.Decimal(18, 6)
  // For RSU accounts: vested and unvested tracked separately
  vestedShares   Decimal?       @db.Decimal(18, 6)
  unvestedShares Decimal?       @db.Decimal(18, 6)
  unvestedValue  Decimal?       @db.Decimal(12, 2) // unvested RSU market value (excluded from liquid net worth)
  institutionId  String?
  institution    Institution?   @relation(fields: [institutionId], references: [id])
  currentValue   Decimal        @db.Decimal(12, 2) // vested value only for RSUs
  isActive       Boolean        @default(true)
  lastUpdatedAt  DateTime?
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  snapshots      InvestmentSnapshot[]
}

model Debt {
  id             String       @id @default(cuid())
  name           String
  type           DebtType
  principal      Decimal      @db.Decimal(12, 2)
  monthlyPayment Decimal      @db.Decimal(12, 2)
  apr            Decimal      @db.Decimal(6, 4)
  institutionId  String?
  institution    Institution? @relation(fields: [institutionId], references: [id])
  payoffDate     DateTime?    // for SHORT_TERM 0% APR promos
  promoApr       Decimal?     @db.Decimal(6, 4) // APR after promo ends (SHORT_TERM only)
  notes          String?
  isActive       Boolean      @default(true)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  snapshots      DebtSnapshot[]
}

model MonthlySnapshot {
  id          String               @id @default(cuid())
  year        Int
  month       Int                  // 1-12
  netWorth    Decimal              @db.Decimal(12, 2)
  createdAt   DateTime             @default(now())
  expenses    ExpenseSnapshot[]
  income      IncomeSnapshot[]
  investments InvestmentSnapshot[]
  debts       DebtSnapshot[]

  @@unique([year, month])
}

model ExpenseSnapshot {
  id                String          @id @default(cuid())
  snapshotId        String
  snapshot          MonthlySnapshot @relation(fields: [snapshotId], references: [id], onDelete: Cascade)
  expenseItemId     String
  expenseItem       ExpenseItem     @relation(fields: [expenseItemId], references: [id])
  monthlyEquivalent Decimal         @db.Decimal(12, 2)
}

model IncomeSnapshot {
  id             String          @id @default(cuid())
  snapshotId     String
  snapshot       MonthlySnapshot @relation(fields: [snapshotId], references: [id], onDelete: Cascade)
  incomeSourceId String
  incomeSource   IncomeSource    @relation(fields: [incomeSourceId], references: [id])
  amount         Decimal         @db.Decimal(12, 2)
}

model InvestmentSnapshot {
  id                  String            @id @default(cuid())
  snapshotId          String
  snapshot            MonthlySnapshot   @relation(fields: [snapshotId], references: [id], onDelete: Cascade)
  investmentAccountId String
  investmentAccount   InvestmentAccount @relation(fields: [investmentAccountId], references: [id])
  value               Decimal           @db.Decimal(12, 2)
  unvestedValue       Decimal?          @db.Decimal(12, 2)
}

model DebtSnapshot {
  id             String          @id @default(cuid())
  snapshotId     String
  snapshot       MonthlySnapshot @relation(fields: [snapshotId], references: [id], onDelete: Cascade)
  debtId         String
  debt           Debt            @relation(fields: [debtId], references: [id])
  principal      Decimal         @db.Decimal(12, 2)
  monthlyPayment Decimal         @db.Decimal(12, 2)
}

model PlaidItem {
  id            String      @id @default(cuid())
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  accessToken   String      // AES-256-GCM encrypted before storage — never plaintext
  itemId        String      @unique
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
}
```

### Calculated Fields (derived at query time, never stored)

| Field | Formula |
|---|---|
| Monthly equivalent | `amount / daysInInterval * 30.44` — normalized to average month using `intervalCount * unitDays` where `DAY=1, WEEK=7, MONTH=30.44, YEAR=365.25` |
| Total essential expenses | sum of essential category monthly equivalents |
| Total discretionary expenses | sum of discretionary category monthly equivalents |
| 50/30/20 percentages | expense totals / net monthly income |
| Liquid net worth | SAVINGS + MONEY_MARKET + CHECKING + vested investments - total debt principal |
| Total net worth | liquid net worth + unvested RSU value |

---

## 5. Features

### 5.1 Dashboard

- Net worth (liquid and total) as the hero — large, prominent, above everything else
- Monthly income vs. total expenses (essential + discretionary + debt payments)
- 50/30/20 breakdown with visual progress bars against targets
- Investment portfolio total (vested / unvested split clearly labeled)
- Financial Insights panel (see §5.9)
- Upcoming alerts: renewals, 0% APR promo expirations within 90 days
- "Record this month" button — always accessible

### 5.2 Expenses

- List all recurring expenses with their actual amount, frequency label, and monthly equivalent
- Add / edit / deactivate (soft delete — preserved in historical snapshots)
- Frequency is free-form: any `intervalCount` + `intervalUnit` combination (e.g. every 6 weeks, every 2 years)
- Category management (Essential / Discretionary)
- Notes, expiry date, renewal date fields
- Filter by category, sort by monthly equivalent descending

### 5.3 Income

- List income sources with monthly amounts
- Income distribution breakdown per source: shows where each paycheck goes (savings, checking, bills, etc.)
- Add / edit / deactivate income sources

### 5.4 Investments

- List all accounts grouped by institution
- RSU accounts show vested value and unvested value separately; only vested counts toward liquid net worth
- Manual value override for any account at any time
- Auto-price update for accounts with a ticker (`shares * latestPrice`) via Finnhub
- Plaid connection for supported institutions
- CSV import for unsupported accounts (retirement, DC plans)

### 5.5 Debt Tracker

- Short-term debt: 0% APR promo items with payoff deadline and post-promo APR
- Long-term debt: principal, APR, monthly payment, estimated payoff date
- Visual payoff progress bar for long-term debt
- Alert badge when a 0% promo is within 60 days of expiring

### 5.6 Monthly Snapshots

- "Record this month" captures point-in-time values of all active expenses, income sources, investments, and debts
- One snapshot per calendar month enforced at DB level (`@@unique([year, month])`)
- Overwriting a month deletes all child records via cascade and recreates them — user is warned before overwrite
- Snapshot history accessible from the History view

### 5.7 Time Series / History

- Line chart: net worth over time (liquid and total overlaid)
- Stacked area chart: expenses by category over time
- Line chart: investment portfolio value over time
- Line chart: debt principal paydown over time
- All charts driven by snapshot data; empty state shown when fewer than 2 snapshots exist

### 5.8 CSV Import

- Upload CSV for investment accounts (retirement, DC plans, etc.)
- Expected columns: `account_name`, `institution`, `type`, `value`, `ticker` (optional), `shares` (optional)
- Preview parsed rows before import
- Column mapping UI for non-standard headers
- Imported accounts can be manually overridden at any time

### 5.9 Financial Insights

A dedicated panel on the dashboard providing actionable guidance based on the user's actual data.

**Opportunity cost analysis — per debt:**
- Compare each debt's APR against the user's `benchmarkRate` (set in Settings — their best current safe return, e.g. HYSA or money market rate)
- Verdict displayed per debt:
  - APR > benchmarkRate + 2%: "Pay this off aggressively — costs more than you can safely earn"
  - APR within 2% of benchmarkRate: "Balanced — either direction is reasonable"
  - APR < benchmarkRate: "Keep this debt — you earn more investing than paying it off"
- Example: car loan at 2.74%, benchmark 5.00% → "You're ahead by 2.26% keeping this loan. Park extra cash in savings."

**Priority checklist (shown in order):**
1. 401k employer match — surface if user has a PLAN_401K account; prompt them to confirm they're capturing the full match (checkbox, not automated)
2. Emergency fund coverage — `liquid cash / monthly essential expenses` = months covered; target is 3-6 months
3. High-interest debt — flag any debt with APR > 7.5% as priority payoff
4. 0% APR countdown — list promos expiring within 60 days with post-promo rate

**Benchmarking:**
- `benchmarkRate` is set by the user in Settings (e.g. 5.00% for a current HYSA)
- All opportunity cost math uses this rate
- Shown clearly in the Insights panel so the user knows what rate is being used

---

## 6. Integrations

### 6.1 Market Data API (Stock/ETF Prices)

- Provider: **Finnhub** (free tier: 60 req/min, sufficient for personal use)
- Triggered manually ("Refresh prices") or on a schedule via `node-cron`
- Updates accounts where `ticker` is set: `currentValue = vestedShares * latestPrice` (for RSUs) or `shares * latestPrice` (for others)
- Sets `lastUpdatedAt` on each updated account
- Delays between requests to respect rate limits

### 6.2 Plaid

- Used for: SAVINGS, MONEY_MARKET, CHECKING account balances; supported brokerage accounts
- Flow: Link button → Plaid Link SDK → exchange public token → AES-256-GCM encrypt access token → store
- Access token decrypted in memory only when making Plaid API calls; never logged
- Pulls balances on demand ("Sync accounts") or scheduled via `node-cron`
- Does **not** pull transactions (out of scope)

### 6.3 CSV Import

See Feature §5.8.

---

## 7. API Design (REST)

All routes prefixed with `/api`. All routes except `/api/auth/*` require a valid JWT.

```
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh

GET    /api/dashboard                     — computed summary + insights

GET    /api/expenses
POST   /api/expenses
PUT    /api/expenses/:id
DELETE /api/expenses/:id                  — soft delete

GET    /api/income
POST   /api/income
PUT    /api/income/:id
DELETE /api/income/:id

GET    /api/investments
POST   /api/investments
PUT    /api/investments/:id
DELETE /api/investments/:id
POST   /api/investments/refresh-prices    — Finnhub update for all tickers
POST   /api/investments/import-csv        — CSV upload + parse

GET    /api/debts
POST   /api/debts
PUT    /api/debts/:id
DELETE /api/debts/:id

GET    /api/snapshots
POST   /api/snapshots                     — record current month (warns if exists)
GET    /api/snapshots/:year/:month

GET    /api/insights                      — opportunity cost + priority checklist

GET    /api/settings
PUT    /api/settings                      — update benchmarkRate, etc.

GET    /api/plaid/link-token
POST   /api/plaid/exchange
POST   /api/plaid/sync
DELETE /api/plaid/items/:id
```

---

## 8. UI / Design Direction

### Philosophy

Numbers are the product. The UI exists to surface financial data clearly, not to decorate it. Every design decision serves legibility and trust.

### Visual Language

| Token | Value | Notes |
|---|---|---|
| Background | `#0F0F13` | Near-black with slight cool tint |
| Surface | `#17171F` | Card backgrounds |
| Border | `#242432` | 1px, subtle — no heavy shadows |
| Text primary | `#F0F0F5` | Near-white |
| Text secondary | `#8888A0` | Labels, metadata |
| Accent | `#F59E0B` | Amber/gold — interactive elements, key highlights |
| Positive | `#10B981` | Gains, under-budget |
| Negative | `#F43F5E` | Losses, over-budget, alerts |
| Font | Geist or Inter | `font-variant-numeric: tabular-nums` on all financial figures |

### Layout

- Mobile-first, single-column on small screens; two-column on desktop (sidebar nav + content)
- Net worth displayed as the hero number at the top of the dashboard — large (3xl+), no decorative chrome around it
- Cards are flat with a 1px border, no drop shadows, no rounded pill shapes
- Color used only for directional meaning (positive/negative/accent) — never decorative
- Generous vertical spacing between sections; dense within a card

### Mobile

- Bottom tab navigation on mobile (Dashboard, Expenses, Investments, Debt, History)
- All tap targets minimum 44px
- Numbers scale down with viewport but remain the dominant visual element
- No horizontal scroll anywhere

### Charts

- Library: Recharts (lightweight, composable, React-native)
- Dark-themed, no gridlines except subtle horizontal guides
- Accent color for primary series; muted secondary for comparison series
- Tooltips show exact values on hover/tap

---

## 9. Security

| Concern | Approach |
|---|---|
| Authentication | JWT access token (15 min expiry) + httpOnly refresh token cookie (7 day) |
| Password storage | bcrypt, cost factor 12 |
| Plaid tokens | AES-256-GCM encrypted before DB write; key from env var |
| Input validation | Zod schemas on all POST/PUT request bodies |
| HTTP security | Helmet.js (CSP, HSTS, X-Frame-Options, etc.) |
| Rate limiting | express-rate-limit on all routes (stricter on auth routes) |
| CORS | Configured to same-origin only |
| DB privileges | App DB user has DML only (no DDL, no DROP) |
| Secrets | All via environment variables; never in code or committed files |
| Logging | No financial values or tokens in logs |
| Dependencies | `npm audit` run in CI/build pipeline |

---

## 10. Out of Scope

- Day-to-day transaction tracking
- Bill pay or any write operations to financial institutions
- Multi-user support
- Mobile app (architecture supports it via the REST API, but not built now)
- Automatic snapshot scheduling (manual trigger only for now)
- Tax calculations or reporting
- Budget goal setting beyond the 50/30/20 view

---

## 11. Environment Variables

```env
DATABASE_URL=postgresql://...
JWT_SECRET=
JWT_REFRESH_SECRET=
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox|development|production
FINNHUB_API_KEY=
ENCRYPTION_KEY=           # AES-256 key for Plaid token encryption (32 bytes hex)
PORT=3000
NODE_ENV=production
```
