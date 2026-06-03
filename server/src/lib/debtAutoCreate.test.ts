import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing the module under test so ensureDebtForAccount
// exercises the idempotency branch without a real database. vi.mock is hoisted,
// so the mock fns must be created via vi.hoisted to be available in the factory.
const { findFirst, create } = vi.hoisted(() => ({ findFirst: vi.fn(), create: vi.fn() }))
vi.mock('./prisma', () => ({ prisma: { debt: { findFirst, create } } }))

import { debtDefaultsForAccount, ensureDebtForAccount, isLiabilityKind, type LiabilityAccount } from './debtAutoCreate'
import type { AccountKind } from '../generated/prisma/client'

const acct = (over: Partial<LiabilityAccount>): LiabilityAccount =>
  ({ id: 'a1', userId: 'u1', name: 'Card', kind: 'CREDIT_CARD', balance: 1500, institutionId: null, ...over })

describe('isLiabilityKind', () => {
  it('flags the four liability kinds and nothing else', () => {
    const liabilities: AccountKind[] = ['CREDIT_CARD', 'LOAN', 'LINE_OF_CREDIT', 'MORTGAGE']
    const assets: AccountKind[] = ['CHECKING', 'SAVINGS', 'BROKERAGE', 'IRA']
    expect(liabilities.every(isLiabilityKind)).toBe(true)
    expect(assets.some(isLiabilityKind)).toBe(false)
  })
})

describe('debtDefaultsForAccount', () => {
  it('returns null for a non-liability account', () => {
    expect(debtDefaultsForAccount(acct({ kind: 'CHECKING' }))).toBeNull()
  })

  it('maps a credit card to a short-term CREDIT_CARD debt with blank terms', () => {
    const d = debtDefaultsForAccount(acct({ kind: 'CREDIT_CARD', balance: 1500 }))
    expect(d).toMatchObject({ kind: 'CREDIT_CARD', term: 'SHORT_TERM', principal: 1500, monthlyPayment: 0, apr: 0, accountId: 'a1' })
  })

  it('maps a mortgage to a long-term MORTGAGE debt', () => {
    const d = debtDefaultsForAccount(acct({ kind: 'MORTGAGE', balance: 250000 }))
    expect(d).toMatchObject({ kind: 'MORTGAGE', term: 'LONG_TERM', principal: 250000 })
  })

  it('maps a loan to a long-term PERSONAL debt', () => {
    const d = debtDefaultsForAccount(acct({ kind: 'LOAN', balance: 9000 }))
    expect(d).toMatchObject({ kind: 'PERSONAL', term: 'LONG_TERM' })
  })
})

describe('ensureDebtForAccount', () => {
  beforeEach(() => { findFirst.mockReset(); create.mockReset() })

  it('creates a debt when none is linked yet', async () => {
    findFirst.mockResolvedValue(null)
    await ensureDebtForAccount(acct({ kind: 'CREDIT_CARD' }))
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]![0].data).toMatchObject({ accountId: 'a1', kind: 'CREDIT_CARD' })
  })

  it('is idempotent — does not duplicate when an active debt already exists', async () => {
    findFirst.mockResolvedValue({ id: 'd1' })
    await ensureDebtForAccount(acct({ kind: 'CREDIT_CARD' }))
    expect(create).not.toHaveBeenCalled()
  })

  it('is a no-op for non-liability accounts (no DB lookup)', async () => {
    await ensureDebtForAccount(acct({ kind: 'CHECKING' }))
    expect(findFirst).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})
