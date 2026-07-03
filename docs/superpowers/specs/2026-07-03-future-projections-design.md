# Future projections & scenarios — design

Date: 2026-07-03
Status: approved (approach A — server-side deterministic engine)

## Problem

The app is long-term focused but everything it shows is present-tense. The user
wants three questions answered: *Where am I headed? What if I change X? Am I on
track?* No fixed goal/target — the trajectory itself is the answer.

## Decisions (from brainstorming)

- **Deterministic, fixed-rate projection.** Single line per scenario. No Monte
  Carlo, no bands (future option).
- **Scenarios are both ephemeral and saveable.** Knobs + modifiers on the page
  give instant exploration; "save as scenario" persists a named modifier set
  that can be overlaid on the chart.
- **Levers:** one-time events, recurring contribution changes, and hypothetical
  assets with their own return characteristics (stocks, real estate incl.
  financing).
- **No goals model.** YAGNI.

## Engine — `server/src/services/projection.ts`

Pure function, unit-tested, no DB access:

```
project(inputs, assumptions, modifiers) → { points[], landmarks[] }
```

`inputs` is built by the route from current DB state: accounts (value via
`accountValue`, kind, APY), debts (via `debtPaymentInfo`: principal, APR, promo
terms, effective payment), net monthly income (via `estimateTax`), monthly
expenses (via `toMonthlyEquivalent`), contributions (amount + destination).

Each simulated month:

1. **Accounts grow.** Cash kinds at their APY (nominal monthly compounding,
   `annual%/12`); investment kinds at `assumptions.investmentReturnPct`.
   Liability-kind accounts linked to a debt are excluded (the debt simulates
   them); unlinked liability accounts are held flat.
2. **Debts amortize.** Monthly interest at APR (0% promos flip to post-promo
   APR on schedule), then the effective payment is applied. `EXTRA_DEBT`
   contributions go to the highest-APR live debt. Final-month surplus returns
   to cash; once a debt dies its payment **frees into cash flow**. Payoff
   month is recorded as a landmark.
3. **Cash flow settles.** `net income − expenses − debt payments actually made
   − contributions ± modifier flows = unallocated`. Positive unallocated ×
   `assumptions.savingsRatePct` deposits into the highest-APY cash account;
   negative unallocated drains cash in full.
4. **Contributions deposit** into their destination accounts (flow out of
   income, into the asset — net-worth impact is the growth).
5. **Modifiers fire** (below).
6. **Point recorded:** netWorth (assets − debts, **excluding unvested RSUs**),
   cash, investments, debt totals.

### Modifiers (the scenario vocabulary)

```ts
type Modifier =
  | { type: 'ONE_TIME'; month: number; amount: number; label?: string }
  | { type: 'RECURRING'; startMonth: number; endMonth?: number | null;
      monthlyAmount: number; annualReturnPct?: number | null; label?: string }
  | { type: 'NEW_ASSET'; month: number; cost: number; annualReturnPct: number;
      downPayment?: number | null; financeAprPct?: number | null;
      financeTermMonths?: number | null; monthlyCashFlow?: number | null;
      label?: string }
```

- `ONE_TIME` — windfall (+) or purchase (−) hitting cash at a month.
- `RECURRING` — with `annualReturnPct`, the flow compounds in a synthetic
  asset ("invest $500/mo at 7%"); without, it adjusts free cash flow ("spend
  $300 more/mo").
- `NEW_ASSET` — buy an asset. Unfinanced: full cost leaves cash. Financed:
  `downPayment` leaves cash and an internal debt (`cost − downPayment` at
  `financeAprPct` over `financeTermMonths`) runs through the same debt
  simulator. The asset appreciates at `annualReturnPct`; optional
  `monthlyCashFlow` (e.g. net rent) feeds cash flow. Covers the "rental
  property vs brokerage" comparison.

### Deliberate v1 simplifications (disclaimed in UI)

Nominal dollars (no inflation), flat income and expenses, no tax on gains,
unvested RSUs excluded, cash may go negative (visible on the chart rather than
hidden).

## Persistence

```prisma
model Scenario {
  id        String  @id @default(cuid())
  userId    String
  name      String
  notes     String?
  modifiers Json    // Modifier[] validated by zod at the API boundary
  isActive  Boolean @default(true)
  ...timestamps
}
```

JSON column, not child tables — modifiers are a closed union read/written as a
set, never queried relationally.

## API

- `POST /api/projections` — body: `{ horizonMonths?, savingsRatePct?,
  investmentReturnPct?, modifiers?, scenarioIds? }`. Returns baseline series +
  one series per requested overlay (ad-hoc modifiers = the "current what-ifs"
  series; each saved scenario id = its own series). One call, all lines.
- `GET/POST/PUT/DELETE /api/scenarios` — standard CRUD, zod-validated
  modifiers, userId-scoped, soft delete (matches contributions router).

## Client — `/future` page

- **Chart:** Recharts, one line per series. Recorded snapshots plot as actuals
  left of a "now" reference line — the "am I on track" view.
- **Headline stats:** net worth at +5y / +10y / horizon; debt-free date;
  scenario delta at horizon.
- **Knobs (debounced refetch):** horizon (5/10/20/30y), investment return,
  savings rate.
- **What-if builder:** modifier chips + add-modal (one-time / recurring / buy
  an asset). "Save as scenario" persists the current set.
- **Scenario chips:** toggle saved scenarios on/off the chart; delete.
- Nav: "Future" added to top nav after Overview.

## Testing

Engine unit tests (vitest, alongside `tax.test.ts` pattern): compounding
matches closed form; debt payoff frees payment into savings; promo APR flip;
extra-debt contributions accelerate payoff; each modifier type; savings-rate
knob; landmark correctness. Routes rely on zod validation + engine tests.
