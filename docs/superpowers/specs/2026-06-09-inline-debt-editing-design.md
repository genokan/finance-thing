# Inline debt editing on liability accounts

**Date:** 2026-06-09
**Status:** Approved, implementing

## Problem

A liability account (credit card, loan, mortgage) and its `Debt` row are
conceptually one thing, but editing is split across two screens. You can set
payoff terms *inline* when **creating** a manual liability account (the "Track
payoff terms" checkbox), but once the account exists — or it came from Plaid —
the account editor just says "Manage this debt on the Debt page." Setting or
changing APR/payment/term means a round trip to a second screen, and
Plaid-synced debts start as empty stubs (APR 0 / payment 0).

Most of the "enter once" plumbing already exists: net worth avoids double
counting linked debts (`dashboard.ts`), Outflow folds debt payments into total
expenses, and Plaid liabilities auto-spawn linked debts. The remaining friction
is purely the **split edit experience**.

## Goal

Set and edit a liability's APR, monthly payment, original loan amount, term, and
bucket directly from the account editor — on **create and edit**, manual or
Plaid. The Debt page stays as the payoff overview and home for advanced fields,
but is no longer a required stop.

## Design

### Account editor (liability accounts)

The existing "Track payoff terms (APR & schedule)" block — APR, original loan
amount, term (months), monthly payment with the amortized-minimum hint, term
type, bucket — renders on **edit** too, not just create. On edit it is
pre-filled from the account's linked `Debt`.

The "Manage this debt's APR & payoff terms on the Debt page" message is removed.
A small "More options (0% promo, category) →" link to the Debt page remains for
the advanced fields that stay there.

### Save — one action reconciles the debt

After the account PUT/POST succeeds:

- **Linked debt exists + track on** → `PUT /api/debts/:id` with new terms.
- **No debt yet + track on** → `POST /api/debts` with `accountId` (today's
  create behavior).
- **Linked debt exists + track off** → `DELETE /api/debts/:id` (soft-delete,
  reversible).
- **No debt + track off** → no-op.

`principal` is not entered here — the account balance ("Amount owed") is already
the source of truth for a linked debt's principal.

### Stays on the Debt page

0% promo terms, sub-category/tag, and the finer debt `kind` distinction
(car loan vs. student loan vs. personal). Debt `kind` continues to auto-derive
from account kind on creation.

## Scope boundaries

- **No schema changes.**
- **No server changes** — reuses existing debt POST/PUT/DELETE endpoints.
- Client only: `Accounts.tsx` (modal gains debt fields on edit + reconcile
  logic), and the Accounts page queries `['debts']` to find each account's debt.

## Testing

- `tsc --noEmit` clean on client.
- Manual: create a manual loan with terms; edit it and change APR — Debt page
  reflects it. Edit a Plaid liability and fill APR/payment — debt updates.
  Uncheck "track" — debt disappears from the Debt page.
