import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Account, BudgetBucket, Category, Debt, DebtKind, DebtTerm } from '../api/types'
import { AmountCell, BucketBadge, BucketSelect, Card, Empty, Field, Loading, MoneyInput, Modal, SectionHead } from '../components/ui'
import { isLiabilityKind } from './Accounts'
import { dateLabel, daysUntil, money, percent } from '../lib/format'

// Server computes principal (linked account balance when set, else manual value).
const debtPrincipal = (d: Debt) => d.principalValue

// Client mirror of the amortization formula for live preview in the form.
function minimumPayment(principal: number, aprPercent: number, termMonths: number): number {
  if (!termMonths || termMonths <= 0 || principal <= 0) return 0
  const r = aprPercent / 100 / 12
  if (r === 0) return principal / termMonths
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths))
}

const KIND_LABELS: Record<DebtKind, string> = {
  CREDIT_CARD: 'Credit card', CAR_LOAN: 'Car loan', MORTGAGE: 'Mortgage',
  STUDENT_LOAN: 'Student loan', PERSONAL: 'Personal', OTHER: 'Other',
}

export function DebtPage() {
  const qc = useQueryClient()
  const debts = useQuery({ queryKey: ['debts'], queryFn: () => api.get<Debt[]>('/api/debts') })
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/api/categories') })
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<Account[]>('/api/accounts') })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Debt | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['debts'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['insights'] })
  }
  const save = useMutation({
    mutationFn: (p: { id?: string; body: Record<string, unknown> }) =>
      p.id ? api.put(`/api/debts/${p.id}`, p.body) : api.post('/api/debts', p.body),
    onSuccess: () => { invalidate(); setOpen(false); setEditing(null) },
  })
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/api/debts/${id}`), onSuccess: invalidate })

  if (debts.isLoading || categories.isLoading || accounts.isLoading) return <Loading />
  const all = debts.data ?? []
  const liabilityAccounts = (accounts.data ?? []).filter((a) => isLiabilityKind(a.kind))
  const promos = all.filter((d) => d.isZeroPromo)
  const shortTerm = all.filter((d) => !d.isZeroPromo && d.term === 'SHORT_TERM')
  const longTerm = all.filter((d) => !d.isZeroPromo && d.term === 'LONG_TERM')
  const total = all.reduce((s, d) => s + debtPrincipal(d), 0)

  const openNew = () => { setEditing(null); setOpen(true) }
  const editRow = (d: Debt) => { setEditing(d); setOpen(true) }

  const renderRow = (d: Debt) => {
    const days = daysUntil(d.promoEndsAt ?? d.payoffDate)
    const expiring = d.isZeroPromo && days !== null && days <= 60
    return (
      <div className="row" key={d.id}>
        <div className="main">
          <div className="name">{d.name} {expiring && <span className="badge bad">{days}d left</span>}</div>
          <div className="meta num">
            <BucketBadge bucket={d.bucket} />{' '}
            <span className="badge neutral">{KIND_LABELS[d.kind]}</span>
            {d.account ? ` · 🔗 ${d.account.name}` : ''}
            {d.category ? ` · ${d.category.name}` : ''}
            {d.isZeroPromo
              ? ` · 0% until ${dateLabel(d.promoEndsAt)}${d.postPromoApr ? ` then ${percent(Number(d.postPromoApr), 2)}` : ''}`
              : ` · ${percent(Number(d.apr), 2)} APR · ${money(d.effectivePayment, true)}/mo${d.actualPayment === 0 && d.minimumPayment > 0 ? ' (min)' : ''}`}
          </div>
        </div>
        <div className="right">
          <AmountCell value={money(debtPrincipal(d))} label="Balance" />
          <button className="iconbtn" onClick={() => editRow(d)}>✎</button>
          <button className="iconbtn" onClick={() => remove.mutate(d.id)}>✕</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title">Debt</h1>
      <p className="page-sub num">{money(total)} total outstanding</p>

      <SectionHead title="0% promos" action={<button className="btn sm" onClick={openNew}>+ Add</button>} />
      <Card>{promos.length ? <div className="list">{promos.map(renderRow)}</div> : <Empty>No 0% promo balances.</Empty>}</Card>

      <SectionHead title="Short-term" />
      <Card>{shortTerm.length ? <div className="list">{shortTerm.map(renderRow)}</div> : <Empty>No short-term debt.</Empty>}</Card>

      <SectionHead title="Long-term" />
      <Card>{longTerm.length ? <div className="list">{longTerm.map(renderRow)}</div> : <Empty>No long-term debt.</Empty>}</Card>

      {open && (
        <DebtModal
          debt={editing}
          categories={categories.data ?? []}
          accounts={liabilityAccounts}
          saving={save.isPending}
          onClose={() => { setOpen(false); setEditing(null) }}
          onSubmit={(body) => save.mutate({ id: editing?.id, body })}
        />
      )}
    </div>
  )
}

function DebtModal({
  debt, categories, accounts, saving, onClose, onSubmit,
}: {
  debt: Debt | null
  categories: Category[]
  accounts: Account[]
  saving: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [name, setName] = useState(debt?.name ?? '')
  const [term, setTerm] = useState<DebtTerm>(debt?.term ?? 'LONG_TERM')
  const [kind, setKind] = useState<DebtKind>(debt?.kind ?? 'OTHER')
  const [bucket, setBucket] = useState<BudgetBucket | ''>(debt?.bucket ?? 'ESSENTIAL')
  const [categoryId, setCategoryId] = useState(debt?.categoryId ?? '')
  const [accountId, setAccountId] = useState(debt?.accountId ?? '')
  const [principal, setPrincipal] = useState(debt ? String(debt.principal) : '')
  const [originalPrincipal, setOriginalPrincipal] = useState(debt?.originalPrincipal ?? '')
  const [termMonths, setTermMonths] = useState(debt?.termMonths ? String(debt.termMonths) : '')
  const [monthlyPayment, setMonthlyPayment] = useState(debt && debt.actualPayment > 0 ? String(debt.actualPayment) : '')
  const [apr, setApr] = useState(debt ? String(debt.apr) : '')
  const [payoffDate, setPayoffDate] = useState(debt?.payoffDate ? debt.payoffDate.slice(0, 10) : '')
  const [isZeroPromo, setIsZeroPromo] = useState(debt?.isZeroPromo ?? false)
  const [promoEndsAt, setPromoEndsAt] = useState(debt?.promoEndsAt ? debt.promoEndsAt.slice(0, 10) : '')
  const [postPromoApr, setPostPromoApr] = useState(debt?.postPromoApr ?? '')
  const [notes, setNotes] = useState(debt?.notes ?? '')

  const balanceForCalc = accountId ? (accounts.find((a) => a.id === accountId)?.value ?? 0) : Number(principal || 0)
  // Amortize from the original loan amount when given; else fall back to the current balance.
  const amortBasis = Number(originalPrincipal || 0) || balanceForCalc
  const computedMin = minimumPayment(amortBasis, Number(apr || 0), Number(termMonths || 0))

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      name, term, kind,
      bucket: bucket || null,
      categoryId: categoryId || null,
      accountId: accountId || undefined,
      principal: accountId ? '0' : principal,
      originalPrincipal: originalPrincipal || undefined,
      termMonths: termMonths ? Number(termMonths) : undefined,
      monthlyPayment: monthlyPayment || '0', apr: apr || '0',
      payoffDate: payoffDate || undefined,
      isZeroPromo,
      promoEndsAt: isZeroPromo ? promoEndsAt || undefined : undefined,
      postPromoApr: isZeroPromo && postPromoApr ? postPromoApr : undefined,
      notes: notes || undefined,
    })
  }

  return (
    <Modal title={debt ? 'Edit debt' : 'Add debt'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <div className="field-row">
          <Field label="Kind">
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as DebtKind)}>
              {Object.entries(KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Term">
            <select className="input" value={term} onChange={(e) => setTerm(e.target.value as DebtTerm)}>
              <option value="LONG_TERM">Long-term</option>
              <option value="SHORT_TERM">Short-term</option>
            </select>
          </Field>
        </div>
        <Field label="Bucket">
          <BucketSelect value={bucket} onChange={setBucket} />
        </Field>
        <Field label="Sub-category / tag (optional)">
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— none —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.parentId ? '↳ ' : ''}{c.name}</option>)}
          </select>
        </Field>
        <Field label="Linked account (Plaid or manual liability)">
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">— none (enter principal manually) —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({money(a.value)})</option>)}
          </select>
        </Field>
        <div className="field-row">
          {accountId ? (
            <Field label="Current balance"><div className="input num dim" style={{ display: 'flex', alignItems: 'center' }}>From linked account</div></Field>
          ) : (
            <Field label="Current balance"><MoneyInput value={principal} onChange={setPrincipal} required /></Field>
          )}
          <Field label="Original loan amount"><MoneyInput value={originalPrincipal} onChange={setOriginalPrincipal} /></Field>
        </div>
        <Field label="Loan term (months)">
          <input className="input num" type="number" min="1" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} placeholder="e.g. 60" />
        </Field>
        <Field label="Monthly payment (blank = amortized minimum)">
          <MoneyInput value={monthlyPayment} onChange={setMonthlyPayment} placeholder={computedMin > 0 ? computedMin.toFixed(2) : undefined} />
        </Field>
        {computedMin > 0 && (
          <p className="dim num" style={{ fontSize: 12, margin: '-6px 0 12px' }}>Amortized minimum: {money(computedMin, true)}/mo</p>
        )}
        <div className="field-row">
          <Field label="APR %"><input className="input num" type="number" step="0.01" min="0" value={apr} onChange={(e) => setApr(e.target.value)} /></Field>
          <Field label="Est. payoff date"><input className="input" type="date" value={payoffDate} onChange={(e) => setPayoffDate(e.target.value)} /></Field>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={isZeroPromo} onChange={(e) => setIsZeroPromo(e.target.checked)} />
          <span>0% promotional rate</span>
        </label>
        {isZeroPromo && (
          <div className="field-row">
            <Field label="Promo ends"><input className="input" type="date" value={promoEndsAt} onChange={(e) => setPromoEndsAt(e.target.value)} /></Field>
            <Field label="Post-promo APR %"><input className="input num" type="number" step="0.01" min="0" value={postPromoApr} onChange={(e) => setPostPromoApr(e.target.value)} /></Field>
          </div>
        )}
        <Field label="Notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
