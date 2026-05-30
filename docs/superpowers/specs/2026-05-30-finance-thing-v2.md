# finance-thing — v2 Design (post-feedback rebuild)

**Date:** 2026-05-30
**Status:** Active
**Supersedes:** `2026-05-29-finance-thing-design.md` where they conflict.

Greenfield rebuild driven by `docs/notes.md`. Nothing ships until the whole product is right. Infra (Vault, CI→GHCR, tests, security) is explicitly lowest priority and tracked separately. Guiding principle: **it replaces a spreadsheet — flexibility wins.** The user can define almost anything from the UI.

---

## 1. Core data-model change: first-class `Account`

The single biggest fix. Today "accounts" are ad-hoc strings (income distributions) and `InvestmentAccount` conflates an account with a single holding. v2 introduces a real `Account` that everything references.

```
Account
  id, userId
  name
  institutionId?            -> Institution
  kind: AccountKind         -- CHECKING | SAVINGS | MONEY_MARKET | BROKERAGE
                               | IRA | ROTH_IRA | PLAN_401K | DEFINED_CONTRIBUTION
                               | HSA | RSU | OTHER
  trackingMode: BALANCE | HOLDINGS   -- single balance, or sum of holdings
  balance: Decimal          -- used when trackingMode = BALANCE
  plaidItemId?              -> PlaidItem (balance auto-synced)
  isActive, lastUpdatedAt, createdAt, updatedAt
  holdings: Holding[]

Holding
  id, accountId            -> Account (cascade)
  label
  ticker?
  shares?
  value: Decimal           -- market value (manual or shares * price)
  costBasis?: Decimal
  -- RSU support:
  vestedShares?, unvestedShares?, unvestedValue?
  isActive, lastUpdatedAt
```

- **Account value** = `trackingMode == BALANCE ? balance : sum(active holdings.value)`.
- **Liquid net worth** = cash-kind account values + vested investment values − total debt principal. Unvested RSU value excluded (added only into *total* net worth).
- **Investments page** now reads cleanly: you add an **Account**, then (optionally) **Holdings** inside it. Cash accounts just carry a balance. Resolves "am I adding an account or an investment?"
- **Income distributions** and **Plaid** both reference `Account` — no retyping account names.

`InvestmentAccount` is removed; data concepts migrate to `Account` + `Holding`. (Greenfield — `prisma db push`, no migration history to preserve.)

---

## 2. Flexible categories + budgets

Categories are user-defined and hierarchical. Budgets are just targets on categories; 50/30/20 is a roll-up.

```
Category
  id, userId
  name
  parentId?                -> Category (self-relation, for subcategories)
  bucket: ESSENTIAL | DISCRETIONARY | SAVINGS   -- 50/30/20 roll-up
  monthlyBudget?: Decimal  -- optional target
  appliesTo: EXPENSE | INCOME | DEBT | ANY      -- so the same tree can tag debts/income too
  isActive
```

- User can add/edit/delete categories and subcategories entirely from the UI.
- **Budgets page**: top shows the 50/30/20 envelope (sum of category actuals grouped by `bucket` vs income); below, each category/subcategory shows actual vs `monthlyBudget`.
- Expenses, debts, and (optionally) income reference a category.

---

## 3. Expenses

- Add `kind: RECURRING | ONE_TIME`.
- `ONE_TIME` has a `dueDate` (planned vacation, big purchase) → surfaces in upcoming/cash-flow planning, excluded from steady monthly recurring totals (counted in its month).
- Keep flexible interval (`intervalCount` + `intervalUnit`) for recurring.
- References a (hierarchical) `Category`.

---

## 4. Income + tax breakdown

```
IncomeSource
  id, userId
  name
  type: W2 | SELF_1099 | OTHER
  -- gross:
  grossAnnual?: Decimal      -- or
  grossPerPaycheck?: Decimal
  payFrequency: WEEKLY | BIWEEKLY | SEMIMONTHLY | MONTHLY | ANNUAL
  -- tax config (W2):
  taxMode: FLAT | BRACKET
  flatEffectiveRate?: Decimal     -- used when taxMode = FLAT
  filingStatus?: SINGLE | MARRIED_JOINT | MARRIED_SEPARATE | HEAD_OF_HOUSEHOLD
  stateRate?: Decimal             -- flat state rate (config), bracket mode still uses this for state
  deductions: IncomeDeduction[]
  distributions: IncomeDistribution[]   -- each -> Account
  isActive

IncomeDeduction
  id, incomeSourceId
  name                      -- "401k", "Medical", "HSA"
  amount: Decimal           -- per-paycheck or monthly (normalized)
  preTax: bool
  linkedAccountId?          -> Account   -- e.g. 401k contributions cross-check the 401k account
```

**Tax estimator (server service):**
- `taxMode = FLAT`: `tax = gross * flatEffectiveRate`. Fast, rough.
- `taxMode = BRACKET`: real **2026 federal** brackets by filing status + standard deduction, **FICA** (Social Security 6.2% to wage base, Medicare 1.45% + 0.9% surtax), **state** as configured flat rate. Pre-tax deductions reduce taxable income.
- Output: gross → federal / FICA / state / pre-tax deductions → **net take-home**, plus effective rate. Both modes available via toggle so you can compare.

Federal/FICA constants live in a versioned table (`server/src/lib/tax/2026.ts`) so they're easy to update yearly.

---

## 5. Debt

- Keep **term**: `SHORT_TERM | LONG_TERM` (user likes the split).
- Add orthogonal **`isZeroPromo`** flag + `promoEndsAt` + `postPromoApr` — a 0% promo is no longer forced to be "short-term".
- Add **`kind`**: `CREDIT_CARD | CAR_LOAN | MORTGAGE | STUDENT_LOAN | PERSONAL | OTHER`.
- Add **category** (`bucket` essential/discretionary) via `Category`.
- Keep principal, monthlyPayment, apr, payoffDate, institution.

---

## 6. History → live + auto-snapshot

- Dashboard and all current figures are **always live-computed**.
- A scheduled job (`node-cron`, monthly) auto-captures a `MonthlySnapshot` for the trend charts. Manual "snapshot now" stays as an optional button.
- Snapshots store per-account / per-debt / per-category values so trends survive edits (nullable FKs + `SetNull`, as today).

---

## 7. Settings split

- **User settings**: benchmark rate, tax defaults (filing status, state rate), display preferences. Per-user.
- **Admin/app settings**: stored in a DB `AppSetting` table (key/value), editable by admins in the UI. External integration config (Plaid env, Finnhub) via admin UI where safe; secrets otherwise from Vault.

---

## 8. Import

- Flexible CSV import with a **column-mapping** step so different institutions' exports work. Maps to Accounts/Holdings. Preview before commit.

---

## 9. Plaid (how it works)

Connect → Plaid hosted Link (you log into your bank there; we never see credentials) → public token exchanged for an access token → token encrypted (AES-256-GCM) + stored on a `PlaidItem` → "Sync" pulls **balances** into the linked `Account`. Read-only, no transactions.

---

## 10. Deferred (lowest priority)

Vault secret loading (`vault.opsguy.io`), CI build + publish to GHCR, test suites (unit / regression / Playwright UI), security (scanning, Dependabot, pentest, data-leak review). Tracked, built last.
