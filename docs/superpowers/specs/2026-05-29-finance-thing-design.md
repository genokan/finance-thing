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

enum ExpenseFrequency {
  MONTHLY
  BIMONTHLY      // every 2 months
  QUARTERLY
  SEMIANNUAL
  ANNUAL
}

enum InvestmentType {
  BROKERAGE
  IRA
  ROTH_IRA
  PLAN_401K
  DEFINED_CONTRIBUTION
  RSU_VESTED
  RSU_UNVESTED
  SAVINGS
  MONEY_MARKET
  CHECKING
}

enum DebtType {
  SHORT_TERM    // 0% APR promo, payoff-by-date
  LONG_TERM     // Student loans, car loans
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Category {
  id       String       @id @default(cuid())
  name     String       @unique
  type     CategoryType
  expenses ExpenseItem[]
}

model Institution {
  id                  String              @id @default(cuid())
  name                String              @unique
  investmentAccounts  InvestmentAccount[]
  debts               Debt[]
  plaidItems          PlaidItem[]
}

model ExpenseItem {
  id          String           @id @default(cuid())
  name        String
  amount      Decimal          @db.Decimal(12, 2)
  frequency   ExpenseFrequency @default(MONTHLY)
  categoryId  String
  category    Category         @relation(fields: [categoryId], references: [id])
  notes       String?
  expiresAt   DateTime?
  renewsAt    DateTime?
  isActive    Boolean          @default(true)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  snapshots   ExpenseSnapshot[]
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
  id            String            @id @default(cuid())
  name          String
  type          InvestmentType
  ticker        String?
  shares        Decimal?          @db.Decimal(18, 6)
  institutionId String?
  institution   Institution?      @relation(fields: [institutionId], references: [id])
  currentValue  Decimal           @db.Decimal(12, 2)
  isActive      Boolean           @default(true)
  lastUpdatedAt DateTime?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
  snapshots     InvestmentSnapshot[]
}

model Debt {
  id             String    @id @default(cuid())
  name           String
  type           DebtType
  principal      Decimal   @db.Decimal(12, 2)
  monthlyPayment Decimal   @db.Decimal(12, 2)
  apr            Decimal   @db.Decimal(6, 4)
  institutionId  String?
  institution    Institution? @relation(fields: [institutionId], references: [id])
  payoffDate     DateTime?
  notes          String?
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
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
  snapshot          MonthlySnapshot @relation(fields: [snapshotId], references: [id])
  expenseItemId     String
  expenseItem       ExpenseItem     @relation(fields: [expenseItemId], references: [id])
  monthlyEquivalent Decimal         @db.Decimal(12, 2)
}

model IncomeSnapshot {
  id             String          @id @default(cuid())
  snapshotId     String
  snapshot       MonthlySnapshot @relation(fields: [snapshotId], references: [id])
  incomeSourceId String
  incomeSource   IncomeSource    @relation(fields: [incomeSourceId], references: [id])
  amount         Decimal         @db.Decimal(12, 2)
}

model InvestmentSnapshot {
  id                  String            @id @default(cuid())
  snapshotId          String
  snapshot            MonthlySnapshot   @relation(fields: [snapshotId], references: [id])
  investmentAccountId String
  investmentAccount   InvestmentAccount @relation(fields: [investmentAccountId], references: [id])
  value               Decimal           @db.Decimal(12, 2)
}

model DebtSnapshot {
  id             String          @id @default(cuid())
  snapshotId     String
  snapshot       MonthlySnapshot @relation(fields: [snapshotId], references: [id])
  debtId         String
  debt           Debt            @relation(fields: [debtId], references: [id])
  principal      Decimal         @db.Decimal(12, 2)
  monthlyPayment Decimal         @db.Decimal(12, 2)
}

model PlaidItem {
  id            String      @id @default(cuid())
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  accessToken   String      // AES-256 encrypted before storage
  itemId        String      @unique
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
}
```

### Calculated Fields (derived at query time, never stored)

| Field | Formula |
|---|---|
| Monthly equivalent | `amount / frequencyMonths` where `MONTHLY=1, BIMONTHLY=2, QUARTERLY=3, SEMIANNUAL=6, ANNUAL=12` |
| Total essential expenses | sum of essential category monthly equivalents |
| Total discretionary expenses | sum of discretionary category monthly equivalents |
| 50/30/20 percentages | expense totals / net monthly income |
| Liquid net worth | cash/savings accounts + vested investments - total debt principal |
| Total net worth | liquid net worth + unvested RSU value |

---

## 5. Features

### 5.1 Dashboard

- Net worth (liquid and total) prominently displayed
- Monthly income vs. expenses summary
- 50/30/20 breakdown with progress indicators
- Investment portfolio total (vested / unvested split)
- Upcoming renewals and payoff deadlines (within 90 days)
- Quick-trigger "Record this month" button

### 5.2 Expenses

- List all recurring expenses with monthly equivalent displayed regardless of actual frequency
- Add / edit / deactivate expenses (soft delete — preserved in historical snapshots)
- Category management (Essential / Discretionary)
- Notes field supports expiry dates, renewal dates, and free text
- Filter by category, sort by amount

### 5.3 Income

- List income sources with monthly amounts
- Income distribution: show how a paycheck is allocated across accounts
- Add / edit / deactivate income sources

### 5.4 Investments

- List all accounts/holdings grouped by institution
- Separate display for vested vs. unvested RSUs
- Manual value override for any account
- Auto price update for accounts with a ticker symbol (via market data API)
- Plaid connection for supported institutions (banks, some brokerages)
- CSV import for unsupported accounts (retirement accounts, etc.)

### 5.5 Debt Tracker

- Short-term debt: track 0% APR promo items with payoff deadline
- Long-term debt: track principal, APR, monthly payment, payoff progress
- Alert when a 0% APR promo deadline is approaching (within 60 days)

### 5.6 Monthly Snapshots

- Manually trigger a snapshot at any time ("Record this month")
- Snapshot captures the current value of every expense, income source, investment, and debt
- One snapshot per calendar month enforced at the DB level (`@@unique([year, month])`)
- If a snapshot already exists for the current month, user can overwrite it — all existing child records for that snapshot are deleted and recreated from current data

### 5.7 Time Series / History

- Line chart of net worth over time
- Stacked area chart of expenses by category over time
- Investment portfolio value over time
- Debt principal paydown over time
- All charts use snapshot data — can go back to any recorded month

### 5.8 CSV Import

- Upload a CSV with columns: `account_name`, `institution`, `type`, `value`, `ticker` (optional)
- Preview parsed rows before importing
- Map CSV columns to schema fields if headers don't match exactly
- Used primarily for retirement accounts and institutions without Plaid support

---

## 6. Integrations

### 6.1 Market Data API (Stock/ETF Prices)

- Provider: **Finnhub** (free tier: 60 req/min, sufficient for personal use)
- Triggered manually ("Refresh prices") or on a schedule via `node-cron`
- Only updates `InvestmentAccount` records where `ticker` is set and type is `BROKERAGE`, `IRA`, `ROTH_IRA`, or `RSU_VESTED`
- Updates `currentValue = shares * latestPrice` and sets `lastUpdatedAt`
- Rate limiting handled with a small delay between requests

### 6.2 Plaid

- Used for: bank accounts (HYSA, checking, savings), money market accounts, supported brokerages
- Flow: Link button → Plaid Link SDK → exchange public token → store encrypted access token
- `accessToken` encrypted with AES-256-GCM before writing to DB; decrypted in memory only when making Plaid API calls
- Pulls account balances on demand or on schedule
- Does **not** pull transactions (out of scope)

### 6.3 CSV Import

See Feature 5.8 above.

---

## 7. API Design (REST)

All routes prefixed with `/api`. All routes except `/api/auth/*` require a valid JWT.

```
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh

GET    /api/dashboard              — computed summary (net worth, 50/30/20, etc.)

GET    /api/expenses
POST   /api/expenses
PUT    /api/expenses/:id
DELETE /api/expenses/:id           — soft delete (sets isActive = false)

GET    /api/income
POST   /api/income
PUT    /api/income/:id
DELETE /api/income/:id

GET    /api/investments
POST   /api/investments
PUT    /api/investments/:id
DELETE /api/investments/:id
POST   /api/investments/refresh-prices   — triggers Finnhub update for all tickers
POST   /api/investments/import-csv       — CSV upload

GET    /api/debts
POST   /api/debts
PUT    /api/debts/:id
DELETE /api/debts/:id

GET    /api/snapshots
POST   /api/snapshots                    — record current month
GET    /api/snapshots/:year/:month

GET    /api/plaid/link-token             — create Plaid Link token
POST   /api/plaid/exchange               — exchange public token, store item
POST   /api/plaid/sync                   — pull latest balances for all Plaid items
DELETE /api/plaid/items/:id              — disconnect an institution
```

---

## 8. Security

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

## 9. Out of Scope

- Day-to-day transaction tracking
- Bill pay or any write operations to financial institutions
- Multi-user support
- Mobile app (architecture supports it via the REST API, but not built now)
- Automatic snapshot scheduling (manual trigger only for now)
- Tax calculations or reporting
- Budget goal setting beyond the 50/30/20 view

---

## 10. Environment Variables

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
