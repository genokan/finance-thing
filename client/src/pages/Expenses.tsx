import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { BudgetBucket, Category, Expense, ExpenseKind, IntervalUnit } from '../api/types'
import { BucketBadge, BucketSelect, Card, Empty, Field, Loading, MoneyInput, Modal, SectionHead } from '../components/ui'
import { dateLabel, intervalLabel, money } from '../lib/format'

interface FormState {
  name: string
  amount: string
  kind: ExpenseKind
  intervalCount: string
  intervalUnit: IntervalUnit
  dueDate: string
  bucket: BudgetBucket | ''
  categoryId: string
  notes: string
  renewsAt: string
  expiresAt: string
}

const EMPTY: FormState = {
  name: '', amount: '', kind: 'RECURRING', intervalCount: '1', intervalUnit: 'MONTH',
  dueDate: '', bucket: 'ESSENTIAL', categoryId: '', notes: '', renewsAt: '', expiresAt: '',
}

export function Expenses() {
  const qc = useQueryClient()
  const expenses = useQuery({ queryKey: ['expenses'], queryFn: () => api.get<Expense[]>('/api/expenses') })
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/api/categories') })

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['expenses'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['budgets'] })
    qc.invalidateQueries({ queryKey: ['insights'] })
  }
  const save = useMutation({
    mutationFn: (p: { id?: string; body: Record<string, unknown> }) =>
      p.id ? api.put(`/api/expenses/${p.id}`, p.body) : api.post('/api/expenses', p.body),
    onSuccess: () => { invalidate(); setOpen(false); setEditing(null) },
  })
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/api/expenses/${id}`), onSuccess: invalidate })

  const recurring = (expenses.data ?? []).filter((e) => e.kind === 'RECURRING')
  const oneTime = (expenses.data ?? []).filter((e) => e.kind === 'ONE_TIME')
  const total = useMemo(() => recurring.reduce((s, e) => s + e.monthlyEquivalent, 0), [recurring])

  if (expenses.isLoading || categories.isLoading) return <Loading />

  return (
    <div>
      <h1 className="page-title">Expenses</h1>
      <p className="page-sub num">{money(total, true)}/mo recurring · {recurring.length + oneTime.length} items</p>

      <SectionHead
        title="Recurring"
        action={<button className="btn sm" onClick={() => { setEditing(null); setOpen(true) }}>+ Add</button>}
      />
      <Card>
        {!recurring.length ? <Empty>No recurring expenses yet.</Empty> : (
          <div className="list">
            {recurring.map((e) => (
              <div className="row" key={e.id}>
                <div className="main">
                  <div className="name">{e.name}</div>
                  <div className="meta">
                    <BucketBadge bucket={e.bucket} />
                    {e.category ? <span className="dim"> · {e.category.name}</span> : null}
                    {' '}· {money(e.amount, true)} {intervalLabel(e.intervalCount, e.intervalUnit)}
                  </div>
                </div>
                <div className="right">
                  <div className="amt num">{money(e.monthlyEquivalent, true)}/mo</div>
                  <button className="iconbtn" onClick={() => { setEditing(e); setOpen(true) }}>✎</button>
                  <button className="iconbtn" onClick={() => remove.mutate(e.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <SectionHead title="One-time / upcoming" />
      <Card>
        {!oneTime.length ? <Empty>No one-time expenses. Add a planned purchase or trip.</Empty> : (
          <div className="list">
            {oneTime.map((e) => (
              <div className="row" key={e.id}>
                <div className="main">
                  <div className="name">{e.name}</div>
                  <div className="meta">
                    <BucketBadge bucket={e.bucket} />
                    {e.category ? <span className="dim"> · {e.category.name}</span> : null}
                    <span className="num"> · due {dateLabel(e.dueDate)}</span>
                  </div>
                </div>
                <div className="right">
                  <div className="amt num">{money(e.amount, true)}</div>
                  <button className="iconbtn" onClick={() => { setEditing(e); setOpen(true) }}>✎</button>
                  <button className="iconbtn" onClick={() => remove.mutate(e.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {open && (
        <ExpenseModal
          expense={editing}
          categories={categories.data ?? []}
          saving={save.isPending}
          onClose={() => { setOpen(false); setEditing(null) }}
          onSubmit={(body) => save.mutate({ id: editing?.id, body })}
        />
      )}
    </div>
  )
}

function ExpenseModal({
  expense, categories, saving, onClose, onSubmit,
}: {
  expense: Expense | null
  categories: Category[]
  saving: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const qc = useQueryClient()
  const [f, setF] = useState<FormState>(
    expense
      ? {
          name: expense.name, amount: String(expense.amount), kind: expense.kind,
          intervalCount: String(expense.intervalCount), intervalUnit: expense.intervalUnit,
          dueDate: expense.dueDate ? expense.dueDate.slice(0, 10) : '',
          bucket: expense.bucket ?? '',
          categoryId: expense.categoryId ?? '', notes: expense.notes ?? '',
          renewsAt: expense.renewsAt ? expense.renewsAt.slice(0, 10) : '',
          expiresAt: expense.expiresAt ? expense.expiresAt.slice(0, 10) : '',
        }
      : EMPTY,
  )
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  // Inline sub-category creation so you don't have to leave the form. The new
  // tag inherits whichever bucket is currently selected.
  const [addingCat, setAddingCat] = useState(false)
  const [catName, setCatName] = useState('')
  const createCat = useMutation({
    mutationFn: () => api.post<Category>('/api/categories', { name: catName, bucket: f.bucket || 'ESSENTIAL' }),
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      setF((prev) => ({ ...prev, categoryId: cat.id }))
      setAddingCat(false)
      setCatName('')
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const body: Record<string, unknown> = {
      name: f.name, amount: f.amount, kind: f.kind,
      bucket: f.bucket || null,
      categoryId: f.categoryId || null, notes: f.notes || undefined,
    }
    if (f.kind === 'RECURRING') {
      body.intervalCount = Number(f.intervalCount)
      body.intervalUnit = f.intervalUnit
      body.renewsAt = f.renewsAt || undefined
      body.expiresAt = f.expiresAt || undefined
    } else {
      body.dueDate = f.dueDate || undefined
    }
    onSubmit(body)
  }

  return (
    <Modal title={expense ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name"><input className="input" value={f.name} onChange={set('name')} required /></Field>
        <div className="field-row">
          <Field label="Amount"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required /></Field>
          <Field label="Type">
            <select className="input" value={f.kind} onChange={set('kind')}>
              <option value="RECURRING">Recurring</option>
              <option value="ONE_TIME">One-time / upcoming</option>
            </select>
          </Field>
        </div>
        <Field label="Bucket">
          <BucketSelect value={f.bucket} onChange={(v) => setF({ ...f, bucket: v })} />
        </Field>
        <Field label="Sub-category / tag (optional)">
          {addingCat ? (
            <div className="field-row">
              <input className="input" placeholder="e.g. Groceries, Dining out" value={catName} onChange={(e) => setCatName(e.target.value)} autoFocus />
              <button type="button" className="btn sm" disabled={!catName || createCat.isPending} onClick={() => createCat.mutate()}>Add</button>
              <button type="button" className="iconbtn" onClick={() => setAddingCat(false)}>✕</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <select className="input" value={f.categoryId} onChange={set('categoryId')} style={{ flex: 1 }}>
                <option value="">— none —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.parentId ? '↳ ' : ''}{c.name}</option>)}
              </select>
              <button type="button" className="btn ghost sm" onClick={() => setAddingCat(true)}>+ New</button>
            </div>
          )}
        </Field>
        {f.kind === 'RECURRING' ? (
          <>
            <div className="field-row">
              <Field label="Every"><input className="input num" type="number" min="1" value={f.intervalCount} onChange={set('intervalCount')} required /></Field>
              <Field label="Unit">
                <select className="input" value={f.intervalUnit} onChange={set('intervalUnit')}>
                  <option value="DAY">Day(s)</option><option value="WEEK">Week(s)</option><option value="MONTH">Month(s)</option><option value="YEAR">Year(s)</option>
                </select>
              </Field>
            </div>
            <div className="field-row">
              <Field label="Renews on"><input className="input" type="date" value={f.renewsAt} onChange={set('renewsAt')} /></Field>
              <Field label="Expires on"><input className="input" type="date" value={f.expiresAt} onChange={set('expiresAt')} /></Field>
            </div>
          </>
        ) : (
          <Field label="Due date"><input className="input" type="date" value={f.dueDate} onChange={set('dueDate')} /></Field>
        )}
        <Field label="Notes"><input className="input" value={f.notes} onChange={set('notes')} /></Field>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
