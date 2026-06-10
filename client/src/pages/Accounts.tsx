import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import type { Account, AccountKind, BudgetBucket, Debt, DebtKind, DebtTerm, Holding, Institution, TrackingMode } from '../api/types'
import { AmountCell, BucketSelect, Card, Empty, Field, Loading, MoneyInput, Modal, SectionHead } from '../components/ui'
import { PlaidConnect } from '../components/PlaidConnect'
import { dateLabel, money } from '../lib/format'

export const KIND_LABELS: Record<AccountKind, string> = {
  CHECKING: 'Checking', SAVINGS: 'Savings', MONEY_MARKET: 'Money Market', BROKERAGE: 'Brokerage',
  IRA: 'IRA', ROTH_IRA: 'Roth IRA', PLAN_401K: '401(k)', DEFINED_CONTRIBUTION: 'DC Plan',
  HSA: 'HSA', RSU: 'RSU',
  CREDIT_CARD: 'Credit Card', LOAN: 'Loan', LINE_OF_CREDIT: 'Line of Credit', MORTGAGE: 'Mortgage',
  OTHER: 'Other',
}

const LIABILITY_KINDS: AccountKind[] = ['CREDIT_CARD', 'LOAN', 'LINE_OF_CREDIT', 'MORTGAGE']
export const isLiabilityKind = (k: AccountKind) => LIABILITY_KINDS.includes(k)

// Only investment accounts hold positions; bank accounts never show "shares".
const INVESTMENT_KINDS: AccountKind[] = ['BROKERAGE', 'IRA', 'ROTH_IRA', 'PLAN_401K', 'DEFINED_CONTRIBUTION', 'HSA', 'RSU']
export const isInvestmentKind = (k: AccountKind) => INVESTMENT_KINDS.includes(k)

// Interest-bearing cash accounts can carry an APY.
const APY_KINDS: AccountKind[] = ['SAVINGS', 'MONEY_MARKET']
const hasApy = (k: AccountKind) => APY_KINDS.includes(k)

// Reasonable default debt kind when a liability account spawns its debt.
const ACCOUNT_TO_DEBT_KIND: Partial<Record<AccountKind, DebtKind>> = {
  CREDIT_CARD: 'CREDIT_CARD', MORTGAGE: 'MORTGAGE', LOAN: 'PERSONAL', LINE_OF_CREDIT: 'OTHER',
}

async function resolveInstitution(name: string, existing: Institution[]): Promise<string | undefined> {
  const trimmed = name.trim()
  if (!trimmed) return undefined
  const match = existing.find((i) => i.name.toLowerCase() === trimmed.toLowerCase())
  if (match) return match.id
  const created = await api.post<Institution>('/api/institutions', { name: trimmed })
  return created.id
}

export function Accounts() {
  const qc = useQueryClient()
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<Account[]>('/api/accounts') })
  const institutions = useQuery({ queryKey: ['institutions'], queryFn: () => api.get<Institution[]>('/api/institutions') })
  const debts = useQuery({ queryKey: ['debts'], queryFn: () => api.get<Debt[]>('/api/debts') })

  const [acctModal, setAcctModal] = useState<{ open: boolean; editing: Account | null }>({ open: false, editing: null })
  const [holdingModal, setHoldingModal] = useState<{ accountId: string; editing: Holding | null } | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['accounts'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['institutions'] })
    qc.invalidateQueries({ queryKey: ['debts'] })
  }

  const saveAccount = useMutation({
    // A liability account and its payoff terms are entered/edited as one step
    // ("enter once"): save the account, then reconcile its linked Debt — create,
    // update, or soft-delete it depending on whether "track payoff terms" is on.
    mutationFn: async (p: { id?: string; body: Record<string, unknown>; debt?: Record<string, unknown>; debtId?: string; removeDebt?: boolean }) => {
      const account = p.id
        ? await api.put<Account>(`/api/accounts/${p.id}`, p.body)
        : await api.post<Account>('/api/accounts', p.body)
      const accountId = p.id ?? account.id
      if (p.removeDebt && p.debtId) {
        await api.del(`/api/debts/${p.debtId}`)
      } else if (p.debt) {
        if (p.debtId) await api.put(`/api/debts/${p.debtId}`, { ...p.debt, accountId })
        else await api.post('/api/debts', { ...p.debt, accountId })
      }
      return account
    },
    onSuccess: () => { invalidate(); setAcctModal({ open: false, editing: null }) },
  })
  const removeAccount = useMutation({ mutationFn: (id: string) => api.del(`/api/accounts/${id}`), onSuccess: invalidate })
  const saveHolding = useMutation({
    mutationFn: (p: { accountId: string; id?: string; body: Record<string, unknown> }) =>
      p.id ? api.put(`/api/accounts/${p.accountId}/holdings/${p.id}`, p.body) : api.post(`/api/accounts/${p.accountId}/holdings`, p.body),
    onSuccess: () => { invalidate(); setHoldingModal(null) },
  })
  const removeHolding = useMutation({
    mutationFn: (p: { accountId: string; id: string }) => api.del(`/api/accounts/${p.accountId}/holdings/${p.id}`),
    onSuccess: invalidate,
  })
  const refresh = useMutation({
    mutationFn: () => api.post<{ updated: number; failed: string[] }>('/api/accounts/refresh-prices'),
    onSuccess: invalidate,
  })

  const assetsTotal = useMemo(() => (accounts.data ?? []).filter((a) => !isLiabilityKind(a.kind)).reduce((s, a) => s + a.value, 0), [accounts.data])
  const liabilitiesTotal = useMemo(() => (accounts.data ?? []).filter((a) => isLiabilityKind(a.kind)).reduce((s, a) => s + a.value, 0), [accounts.data])
  const unvested = useMemo(() => (accounts.data ?? []).reduce((s, a) => s + a.unvestedValue, 0), [accounts.data])

  const grouped = useMemo(() => {
    const map = new Map<string, Account[]>()
    for (const a of accounts.data ?? []) {
      const key = a.institution?.name ?? 'Other'
      map.set(key, [...(map.get(key) ?? []), a])
    }
    return [...map.entries()]
  }, [accounts.data])

  if (accounts.isLoading || institutions.isLoading || debts.isLoading) return <Loading />

  // The Debt linked to the account being edited (drives the inline payoff fields).
  const editingDebt = acctModal.editing
    ? (debts.data ?? []).find((d) => d.accountId === acctModal.editing!.id) ?? null
    : null

  return (
    <div>
      <h1 className="page-title">Accounts</h1>
      <p className="page-sub num">
        <span className="pos">{money(assetsTotal)}</span> assets · <span className="neg">{money(liabilitiesTotal)}</span> owed
        {unvested > 0 ? ` · ${money(unvested)} unvested` : ''}
      </p>

      <SectionHead title="Linked banks (Plaid)" />
      <PlaidConnect />

      <SectionHead
        title="Your accounts"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              {refresh.isPending ? 'Refreshing…' : '↻ Prices'}
            </button>
            <button className="btn sm" onClick={() => setAcctModal({ open: true, editing: null })}>+ Add account</button>
          </div>
        }
      />

      {refresh.isSuccess && (
        <div className="dim" style={{ marginBottom: 10 }}>
          Updated {refresh.data.updated} holding(s){refresh.data.failed.length ? `, failed: ${refresh.data.failed.join(', ')}` : ''}.
        </div>
      )}

      {!accounts.data?.length ? (
        <Card><Empty>No accounts yet. Add a checking, savings, brokerage, or retirement account.</Empty></Card>
      ) : (
        grouped.map(([inst, list]) => (
          <div key={inst}>
            <div className="stat-label" style={{ margin: '18px 0 8px' }}>{inst}</div>
            {list.map((a) => (
              <Card key={a.id} className="" >
                <div className="row" style={{ paddingTop: 0 }}>
                  <div className="main">
                    <div className="name">{a.name} <span className="badge neutral">{KIND_LABELS[a.kind]}</span>{a.isEmergencyFund && <span className="badge good"> emergency fund</span>}</div>
                    <div className="meta">
                      {a.trackingMode === 'HOLDINGS' ? `${a.holdings.length} holding(s)` : 'Balance-tracked'}
                      {a.apy ? <span className="num"> · {a.apy}% APY</span> : null}
                      {a.lastUpdatedAt ? ` · updated ${dateLabel(a.lastUpdatedAt)}` : ''}
                      {a.unvestedValue > 0 ? <span className="num"> · {money(a.unvestedValue)} unvested</span> : null}
                    </div>
                  </div>
                  <div className="right">
                    <AmountCell
                      value={money(a.value)}
                      tone={isLiabilityKind(a.kind) ? 'neg' : undefined}
                      label={isLiabilityKind(a.kind) ? 'Owed' : isInvestmentKind(a.kind) ? 'Value' : 'Balance'}
                    />
                    <button className="iconbtn" onClick={() => setAcctModal({ open: true, editing: a })}>✎</button>
                    <button className="iconbtn" onClick={() => removeAccount.mutate(a.id)}>✕</button>
                  </div>
                </div>

                {a.trackingMode === 'HOLDINGS' && (
                  <div style={{ marginTop: 8 }}>
                    {a.holdings.map((h) => (
                      <div className="row" key={h.id} style={{ padding: '8px 4px' }}>
                        <div className="main">
                          <span>{h.label}</span> {h.ticker && <span className="dim">· {h.ticker}</span>}
                          {h.unvestedValue ? <span className="dim num"> · {money(h.unvestedValue)} unvested</span> : null}
                        </div>
                        <div className="right">
                          <span className="num">{money(h.value)}</span>
                          <button className="iconbtn" onClick={() => setHoldingModal({ accountId: a.id, editing: h })}>✎</button>
                          <button className="iconbtn" onClick={() => removeHolding.mutate({ accountId: a.id, id: h.id })}>✕</button>
                        </div>
                      </div>
                    ))}
                    <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => setHoldingModal({ accountId: a.id, editing: null })}>
                      + Add holding
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ))
      )}

      {acctModal.open && (
        <AccountModal
          account={acctModal.editing}
          debt={editingDebt}
          institutions={institutions.data ?? []}
          saving={saveAccount.isPending}
          error={saveAccount.isError ? (saveAccount.error instanceof ApiError ? saveAccount.error.message : 'Could not save account') : null}
          onClose={() => setAcctModal({ open: false, editing: null })}
          onSubmit={saveAccount.mutate}
        />
      )}
      {holdingModal && (
        <HoldingModal
          holding={holdingModal.editing}
          saving={saveHolding.isPending}
          onClose={() => setHoldingModal(null)}
          onSubmit={(body) => saveHolding.mutate({ accountId: holdingModal.accountId, id: holdingModal.editing?.id, body })}
        />
      )}
    </div>
  )
}

export function AccountModal({
  account, debt, institutions, saving, error, onClose, onSubmit, defaultKind,
}: {
  account: Account | null
  debt?: Debt | null
  institutions: Institution[]
  saving: boolean
  error?: string | null
  onClose: () => void
  onSubmit: (p: { id?: string; body: Record<string, unknown>; debt?: Record<string, unknown>; debtId?: string; removeDebt?: boolean }) => void
  defaultKind?: AccountKind
}) {
  const [name, setName] = useState(account?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? defaultKind ?? 'CHECKING')
  const [trackingMode, setTrackingMode] = useState<TrackingMode>(account?.trackingMode ?? 'BALANCE')
  const [balance, setBalance] = useState(account ? String(account.balance) : '')
  const [apy, setApy] = useState(account?.apy ?? '')
  const [institution, setInstitution] = useState(account?.institution?.name ?? '')
  const [isEmergencyFund, setIsEmergencyFund] = useState(account?.isEmergencyFund ?? false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Inline debt terms — for liability accounts, on create and edit ("enter once").
  // When editing, pre-fill from the account's linked Debt; default tracking on for
  // a new account, or to whether a linked debt already exists.
  const [trackDebt, setTrackDebt] = useState(account ? !!debt : true)
  const [apr, setApr] = useState(debt ? String(debt.apr) : '')
  const [originalLoan, setOriginalLoan] = useState(debt?.originalPrincipal ?? '')
  const [termMonths, setTermMonths] = useState(debt?.termMonths ? String(debt.termMonths) : '')
  const [debtPayment, setDebtPayment] = useState(debt && Number(debt.monthlyPayment) > 0 ? String(debt.monthlyPayment) : '')
  const [debtTerm, setDebtTerm] = useState<DebtTerm>(debt?.term ?? 'LONG_TERM')
  const [bucket, setBucket] = useState<BudgetBucket>(debt?.bucket ?? 'ESSENTIAL')
  const showDebtFields = isLiabilityKind(kind)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setBusy(true)
    let institutionId: string | undefined
    try {
      institutionId = await resolveInstitution(institution, institutions)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save institution')
      setBusy(false)
      return
    }
    setBusy(false)

    // Reconcile the linked debt. Track on → create/update its terms; track off
    // for an account that had one → remove it.
    const wantDebt = isLiabilityKind(kind) && trackDebt
    const debtPayload = wantDebt
      ? {
          name,
          term: debtTerm,
          bucket,
          // current balance comes from the linked account, so principal is moot
          principal: debt ? debt.principal : '0',
          originalPrincipal: originalLoan || undefined,
          apr: apr || '0',
          termMonths: termMonths ? Number(termMonths) : undefined,
          monthlyPayment: debtPayment || '0',
          // Derive kind on create; on edit keep what the Debt page may have refined.
          kind: debt ? debt.kind : (ACCOUNT_TO_DEBT_KIND[kind] ?? 'OTHER'),
          // The PUT replaces the whole row — carry through the advanced fields the
          // Debt page owns so editing basic terms here never wipes them.
          ...(debt
            ? {
                categoryId: debt.categoryId ?? undefined,
                payoffDate: debt.payoffDate ?? undefined,
                isZeroPromo: debt.isZeroPromo,
                promoEndsAt: debt.promoEndsAt ?? undefined,
                postPromoApr: debt.postPromoApr ?? undefined,
                notes: debt.notes ?? undefined,
                institutionId: debt.institutionId ?? undefined,
              }
            : {}),
        }
      : undefined
    onSubmit({
      id: account?.id,
      body: {
        name, kind, trackingMode, balance: balance || '0',
        apy: hasApy(kind) ? (apy || null) : null,
        isEmergencyFund, institutionId,
      },
      debt: debtPayload,
      debtId: debt?.id,
      removeDebt: !wantDebt && !!debt,
    })
  }

  return (
    <Modal title={account ? 'Edit account' : 'Add account'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="field-row">
          <Field label="Type">
            <select
              className="input"
              value={kind}
              onChange={(e) => {
                const k = e.target.value as AccountKind
                setKind(k)
                // Bank/liability accounts can't hold positions — force balance tracking.
                if (!isInvestmentKind(k)) setTrackingMode('BALANCE')
              }}
            >
              {Object.entries(KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Institution">
            <input className="input" list="insts" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. Fidelity" />
            <datalist id="insts">{institutions.map((i) => <option key={i.id} value={i.name} />)}</datalist>
          </Field>
        </div>
        {isInvestmentKind(kind) && (
          <Field label="Tracking">
            <select className="input" value={trackingMode} onChange={(e) => setTrackingMode(e.target.value as TrackingMode)}>
              <option value="BALANCE">Single balance</option>
              <option value="HOLDINGS">Holdings (sum of positions)</option>
            </select>
          </Field>
        )}
        {trackingMode === 'BALANCE' && (
          <Field label={isLiabilityKind(kind) ? 'Amount owed' : 'Current balance'}>
            <MoneyInput value={balance} onChange={setBalance} />
          </Field>
        )}
        {hasApy(kind) && (
          <Field label="APY %">
            <input className="input num" type="number" step="0.01" min="0" value={apy} onChange={(e) => setApy(e.target.value)} placeholder="e.g. 4.50" />
          </Field>
        )}
        {trackingMode === 'HOLDINGS' && (
          <p className="dim" style={{ fontSize: 13, marginBottom: 12 }}>Value comes from the holdings you add to this account.</p>
        )}
        {showDebtFields && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={trackDebt} onChange={(e) => setTrackDebt(e.target.checked)} />
              <span>Track payoff terms (APR &amp; schedule) as a debt</span>
            </label>
            {trackDebt && (
              <>
                <Field label="Bucket"><BucketSelect value={bucket} onChange={setBucket} /></Field>
                <div className="field-row">
                  <Field label="APR %"><input className="input num" type="number" step="0.01" min="0" value={apr} onChange={(e) => setApr(e.target.value)} /></Field>
                  <Field label="Original loan amount"><MoneyInput value={originalLoan} onChange={setOriginalLoan} /></Field>
                </div>
                <div className="field-row">
                  <Field label="Term (months)"><input className="input num" type="number" min="1" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} placeholder="e.g. 60" /></Field>
                  <Field label="Monthly payment"><MoneyInput value={debtPayment} onChange={setDebtPayment} placeholder="blank = amortized min" /></Field>
                </div>
                <Field label="Term type">
                  <select className="input" value={debtTerm} onChange={(e) => setDebtTerm(e.target.value as DebtTerm)}>
                    <option value="LONG_TERM">Long-term</option>
                    <option value="SHORT_TERM">Short-term</option>
                  </select>
                </Field>
                {debt && (
                  <p className="dim" style={{ fontSize: 13, margin: '-4px 0 12px' }}>
                    0% promo, sub-category &amp; payoff date live on the{' '}
                    <Link to="/debt" onClick={onClose}>Debt page</Link>.
                  </p>
                )}
              </>
            )}
          </>
        )}
        {!isLiabilityKind(kind) && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 14px', cursor: 'pointer' }}>
            <input type="checkbox" checked={isEmergencyFund} onChange={(e) => setIsEmergencyFund(e.target.checked)} />
            <span>This is my emergency fund</span>
          </label>
        )}
        {(formError || error) && <div className="error-text">{formError ?? error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={saving || busy}>{saving || busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

export function HoldingModal({
  holding, saving, onClose, onSubmit,
}: {
  holding: Holding | null
  saving: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [label, setLabel] = useState(holding?.label ?? '')
  const [ticker, setTicker] = useState(holding?.ticker ?? '')
  const [shares, setShares] = useState(holding?.shares ?? '')
  const [value, setValue] = useState(holding ? String(holding.value) : '')
  const [vestedShares, setVestedShares] = useState(holding?.vestedShares ?? '')
  const [unvestedShares, setUnvestedShares] = useState(holding?.unvestedShares ?? '')
  const [unvestedValue, setUnvestedValue] = useState(holding?.unvestedValue ?? '')

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      label, value: value || '0',
      ticker: ticker || undefined,
      shares: shares || undefined,
      vestedShares: vestedShares || undefined,
      unvestedShares: unvestedShares || undefined,
      unvestedValue: unvestedValue || undefined,
    })
  }

  return (
    <Modal title={holding ? 'Edit holding' : 'Add holding'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field-row">
          <Field label="Label"><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} required /></Field>
          <Field label="Ticker"><input className="input" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} /></Field>
        </div>
        <div className="field-row">
          <Field label="Value"><MoneyInput value={value} onChange={setValue} required /></Field>
          <Field label="Shares (enables price refresh)"><input className="input num" type="number" step="0.000001" value={shares} onChange={(e) => setShares(e.target.value)} /></Field>
        </div>
        <p className="dim" style={{ fontSize: 13, margin: '4px 0 10px' }}>RSU? Use vested/unvested below (leave shares blank).</p>
        <div className="field-row">
          <Field label="Vested shares"><input className="input num" type="number" step="0.000001" value={vestedShares} onChange={(e) => setVestedShares(e.target.value)} /></Field>
          <Field label="Unvested shares"><input className="input num" type="number" step="0.000001" value={unvestedShares} onChange={(e) => setUnvestedShares(e.target.value)} /></Field>
        </div>
        <Field label="Unvested value (excluded from liquid net worth)">
          <MoneyInput value={unvestedValue} onChange={setUnvestedValue} />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
