import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Category, Debt, DebtKind, DebtTerm } from '../api/types'
import { Card, Empty, Field, Loading, Modal, SectionHead } from '../components/ui'
import { dateLabel, daysUntil, money, percent } from '../lib/format'

const KIND_LABELS: Record<DebtKind, string> = {
  CREDIT_CARD: 'Credit card', CAR_LOAN: 'Car loan', MORTGAGE: 'Mortgage',
  STUDENT_LOAN: 'Student loan', PERSONAL: 'Personal', OTHER: 'Other',
}

export function DebtPage() {
  const qc = useQueryClient()
  const debts = useQuery({ queryKey: ['debts'], queryFn: () => api.get<Debt[]>('/api/debts') })
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/api/categories') })
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

  if (debts.isLoading || categories.isLoading) return <Loading />
  const all = debts.data ?? []
  const promos = all.filter((d) => d.isZeroPromo)
  const shortTerm = all.filter((d) => !d.isZeroPromo && d.term === 'SHORT_TERM')
  const longTerm = all.filter((d) => !d.isZeroPromo && d.term === 'LONG_TERM')
  const total = all.reduce((s, d) => s + Number(d.principal), 0)

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
            <span className="badge neutral">{KIND_LABELS[d.kind]}</span>
            {d.category ? ` · ${d.category.name}` : ''}
            {d.isZeroPromo
              ? ` · 0% until ${dateLabel(d.promoEndsAt)}${d.postPromoApr ? ` then ${percent(Number(d.postPromoApr), 2)}` : ''}`
              : ` · ${percent(Number(d.apr), 2)} APR · ${money(d.monthlyPayment, true)}/mo`}
          </div>
        </div>
        <div className="right">
          <div className="amt num">{money(d.principal)}</div>
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
          saving={save.isPending}
          onClose={() => { setOpen(false); setEditing(null) }}
          onSubmit={(body) => save.mutate({ id: editing?.id, body })}
        />
      )}
    </div>
  )
}

function DebtModal({
  debt, categories, saving, onClose, onSubmit,
}: {
  debt: Debt | null
  categories: Category[]
  saving: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [name, setName] = useState(debt?.name ?? '')
  const [term, setTerm] = useState<DebtTerm>(debt?.term ?? 'LONG_TERM')
  const [kind, setKind] = useState<DebtKind>(debt?.kind ?? 'OTHER')
  const [categoryId, setCategoryId] = useState(debt?.categoryId ?? '')
  const [principal, setPrincipal] = useState(debt ? String(debt.principal) : '')
  const [monthlyPayment, setMonthlyPayment] = useState(debt ? String(debt.monthlyPayment) : '')
  const [apr, setApr] = useState(debt ? String(debt.apr) : '')
  const [payoffDate, setPayoffDate] = useState(debt?.payoffDate ? debt.payoffDate.slice(0, 10) : '')
  const [isZeroPromo, setIsZeroPromo] = useState(debt?.isZeroPromo ?? false)
  const [promoEndsAt, setPromoEndsAt] = useState(debt?.promoEndsAt ? debt.promoEndsAt.slice(0, 10) : '')
  const [postPromoApr, setPostPromoApr] = useState(debt?.postPromoApr ?? '')
  const [notes, setNotes] = useState(debt?.notes ?? '')

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      name, term, kind,
      categoryId: categoryId || undefined,
      principal, monthlyPayment: monthlyPayment || '0', apr: apr || '0',
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
        <Field label="Category (essential / wants)">
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— none —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.parentId ? '↳ ' : ''}{c.name}</option>)}
          </select>
        </Field>
        <div className="field-row">
          <Field label="Principal"><input className="input num" type="number" step="0.01" min="0" value={principal} onChange={(e) => setPrincipal(e.target.value)} required /></Field>
          <Field label="Monthly payment"><input className="input num" type="number" step="0.01" min="0" value={monthlyPayment} onChange={(e) => setMonthlyPayment(e.target.value)} /></Field>
        </div>
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
