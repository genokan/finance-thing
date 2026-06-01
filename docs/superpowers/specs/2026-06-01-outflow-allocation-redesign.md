# Outflow & Allocation Redesign

Date: 2026-06-01

## Problem

Setting up one liability takes three manual entries today: a liability account
(with a balance), a separate Debt (with a balance), and a payment that has to be
re-typed into Expenses. "Expenses" also implies day-to-day spend tracking, which
is out of scope. This tool is a **top-down allocation / overview** — a mix of
Ramsey ("every dollar has a job") and YNAB, minus micro-budgeting groceries.

## Money model

Three movements, treated differently:

- **Outflow** (renamed from Expenses) — money that *leaves* net worth: recurring
  bills, planned one-offs, and debt payments.
- **Contribution** (new) — money that *moves to an asset* (retirement, savings,
  brokerage) or pays down extra debt principal. Net-worth-neutral, shown as
  wealth-building, **never** counted as outflow. Distinct from a **Distribution**
  (paycheck routing across accounts, which already exists on Income).
- **Unallocated** (computed) — `Net income − Outflow − Contributions` = the
  free-to-spend remainder. A legitimate, named bucket ("yours to spend however"),
  not an error.

## Debt is first-class (not folded into Account)

Debt is its own concept with its own page and direct add/edit. A debt is either:

- **Standalone** — e.g. "$20 owed to a friend." No account, no institution, no
  Plaid. Just a name, balance, and optional terms.
- **Account-backed** — a credit card or loan (manual or Plaid). Optionally linked
  to a liability `Account`; when linked, that account's balance is the source of
  truth for the current amount owed (avoids double-counting in net worth).

The `Debt.accountId` link is **optional** (already true in the schema — keep it).

### Fixes to the debt model

- **`balance` (current amount owed) is separated from `originalPrincipal`.** The
  amortized minimum payment is computed from `originalPrincipal` + `apr` +
  `termMonths` — never from the current balance. (Fixes the "balance ≠ original
  principal" bug.) Informal debts can omit principal/term entirely.
- **The monthly payment auto-flows into Outflow**, counted once. You never enter
  a debt payment separately as an expense again — that was the real triple-entry
  pain. No double-count against net worth (the linked account already holds the
  balance; an unlinked debt contributes its own).
- Existing amortization, payoff/opportunity-cost, and short/long + 0% promo
  analysis stay on the Debt page.

## Accounts: the registry of balances

- **Liability accounts** still exist to hold a current balance (Plaid-syncable),
  but they do **not** duplicate debt terms — APR/term/principal live on the Debt.
  Adding a liability account can offer to create its linked Debt inline (and the
  debt form can link/create an account inline) → entered once, either direction.
- **Asset accounts**: an **`apy`** field on savings / HYSA / CD / money-market
  (surfaces on the Investments view); the "holdings / shares" tracking option is
  **hidden** on bank-type accounts (only brokerage / retirement / RSU offer
  holdings).

## Investments: its own top-level page

Investments is a lens over investment accounts + holdings (every holding has an
account), but it's a **top-level page**, not a tab — it will grow into a richer
view (performance graphs, allocation over time, contribution cross-checks), so it
deserves its own destination.

## Outflow page

The renamed Expenses page: recurring + planned outflows, plus the auto-derived
debt payments (read-only rows sourced from Debts). Bucketed Needs/Wants/Savings
as today.

## Dashboard = the allocation waterfall

The consolidated view, mirroring the CSV's summary column, live:

```
Net income
  − Outflow         (recurring + planned)
  − Debt payments   (auto from debts)
  − Contributions   (retirement / savings / brokerage / extra principal)
  ─────────────────
  = Unallocated     (headline "free to spend")
```

Plus the net-worth snapshot. 50/30/20 stays as a secondary lens. Replaces the
current scattered stat cards.

## Navigation (de-cramped)

Collapse 9 links → **6 top-level**: **Overview · Accounts · Investments · Debt ·
Outflow · Income**. Settings lives in the user menu (already does).
- **Debt is top-level** (it can exist without an account, so it isn't "under
  Accounts").
- **Investments is top-level** (it will grow graphs/analytics of its own).
- Budgets folds into the Overview waterfall.
- History becomes secondary (a tab under Overview).

## Schema changes (Prisma; greenfield `prisma db push`)

- **Debt**: rename current `principal` → `balance` (current amount owed); add
  `originalPrincipal` (nullable, for amortizing loans). Keep `accountId?`, `apr`,
  `termMonths`, `monthlyPayment`, `term`, `bucket`, 0%-promo fields, `payoffDate`.
  Keep `Debt` and `DebtSnapshot` models.
- **Account**: add `apy` (nullable, asset accounts). No debt-term fields move onto
  Account.
- **Rename** `ExpenseItem` → `OutflowItem`; route `/api/expenses` → `/api/outflow`;
  `ExpenseSnapshot` → `OutflowSnapshot`.
- **New** `Contribution` model: `name`, `amount`, `intervalCount`/`intervalUnit`,
  `destinationAccountId?`, `kind` (RETIREMENT | SAVINGS | BROKERAGE | EXTRA_DEBT |
  OTHER), `notes?`, `isActive`.

## Build order (for the implementation plan)

1. **Schema + backend**: Debt `balance`/`originalPrincipal` split + amortize from
   principal; Account `apy`; `Contribution`; rename Outflow; update dashboard /
   budgets / insights / snapshots; derive debt payments into outflow. Update + add
   unit tests.
2. **Frontend data layer**: types, api client; Accounts form (asset `apy`, hide
   shares on banks); Debt form (standalone vs account-backed, inline account link,
   `originalPrincipal`).
3. **Views**: the Outflow page (with derived debt-payment rows); Contributions
   UI; Investments page kept top-level.
4. **Overview**: the allocation waterfall + nav collapse to 6 (Debt & Investments
   top-level).

## Out of scope

Day-to-day transaction tracking, per-item grocery budgets, automated transaction
import/categorization.
