import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Category, Expense, IntervalUnit } from '../api/types'
import { Card, Empty, Field, Loading, Modal, SectionHead } from '../components/ui'
import { intervalLabel, money } from '../lib/format'

interface FormState {
  name: string
  amount: string
  intervalCount: string
  intervalUnit: IntervalUnit
  categoryId: string
  notes: string
  renewsAt: string
  expiresAt: string
}

const EMPTY: FormState = {
  name: '',
  amount: '',
  intervalCount: '1',
  intervalUnit: 'MONTH',
  categoryId: '',
  notes: '',
  renewsAt: '',
  expiresAt: '',
}

export function Expenses() {
  const qc = useQueryClient()
  const expenses = useQuery({ queryKey: ['expenses'], queryFn: () => api.get<Expense[]>('/api/expenses') })
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/api/categories') })

  const [editing, setEditing] = useState<Expense | null>(null)
  const [open, setOpen] = useState(false)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['expenses'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['insights'] })
  }

  const save = useMutation({
    mutationFn: (payload: { id?: string; body: Record<string, unknown> }) =>
      payload.id ? api.put(`/api/expenses/${payload.id}`, payload.body) : api.post('/api/expenses', payload.body),
    onSuccess: () => {
      invalidate()
      setOpen(false)
      setEditing(null)
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/expenses/${id}`),
    onSuccess: invalidate,
  })

  const total = useMemo(
    () => (expenses.data ?? []).reduce((s, e) => s + e.monthlyEquivalent, 0),
    [expenses.data],
  )

  function openNew() {
    setEditing(null)
    setOpen(true)
  }
  function openEdit(e: Expense) {
    setEditing(e)
    setOpen(true)
  }

  if (expenses.isLoading || categories.isLoading) return <Loading />

  return (
    <div>
      <h1 className="page-title">Expenses</h1>
      <p className="page-sub num">
        {money(total, true)}/mo across {expenses.data?.length ?? 0} recurring items
      </p>

      <SectionHead
        title="Recurring expenses"
        action={
          <button className="btn sm" onClick={openNew}>
            + Add
          </button>
        }
      />

      <Card>
        {!expenses.data?.length ? (
          <Empty>No expenses yet. Add your first recurring cost.</Empty>
        ) : (
          <div className="list">
            {expenses.data.map((e) => (
              <div className="row" key={e.id}>
                <div className="main">
                  <div className="name">{e.name}</div>
                  <div className="meta">
                    <span className={`badge ${e.category.type === 'ESSENTIAL' ? 'neutral' : 'warn'}`}>
                      {e.category.name}
                    </span>{' '}
                    · {money(e.amount, true)} {intervalLabel(e.intervalCount, e.intervalUnit)}
                  </div>
                </div>
                <div className="right">
                  <div className="amt num">{money(e.monthlyEquivalent, true)}/mo</div>
                  <button className="iconbtn" onClick={() => openEdit(e)} title="Edit">
                    ✎
                  </button>
                  <button className="iconbtn" onClick={() => remove.mutate(e.id)} title="Delete">
                    ✕
                  </button>
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
          error={save.isError ? 'Could not save expense.' : null}
          onClose={() => {
            setOpen(false)
            setEditing(null)
          }}
          onSubmit={(body) => save.mutate({ id: editing?.id, body })}
        />
      )}
    </div>
  )
}

function ExpenseModal({
  expense,
  categories,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  expense: Expense | null
  categories: Category[]
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [f, setF] = useState<FormState>(
    expense
      ? {
          name: expense.name,
          amount: String(expense.amount),
          intervalCount: String(expense.intervalCount),
          intervalUnit: expense.intervalUnit,
          categoryId: expense.categoryId,
          notes: expense.notes ?? '',
          renewsAt: expense.renewsAt ? expense.renewsAt.slice(0, 10) : '',
          expiresAt: expense.expiresAt ? expense.expiresAt.slice(0, 10) : '',
        }
      : { ...EMPTY, categoryId: categories[0]?.id ?? '' },
  )

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      name: f.name,
      amount: f.amount,
      intervalCount: Number(f.intervalCount),
      intervalUnit: f.intervalUnit,
      categoryId: f.categoryId,
      notes: f.notes || undefined,
      renewsAt: f.renewsAt || undefined,
      expiresAt: f.expiresAt || undefined,
    })
  }

  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  return (
    <Modal title={expense ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name">
          <input className="input" value={f.name} onChange={set('name')} required />
        </Field>
        <div className="field-row">
          <Field label="Amount">
            <input className="input num" type="number" step="0.01" min="0" value={f.amount} onChange={set('amount')} required />
          </Field>
          <Field label="Category">
            <select className="input" value={f.categoryId} onChange={set('categoryId')} required>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="field-row">
          <Field label="Every">
            <input className="input num" type="number" min="1" value={f.intervalCount} onChange={set('intervalCount')} required />
          </Field>
          <Field label="Unit">
            <select className="input" value={f.intervalUnit} onChange={set('intervalUnit')}>
              <option value="DAY">Day(s)</option>
              <option value="WEEK">Week(s)</option>
              <option value="MONTH">Month(s)</option>
              <option value="YEAR">Year(s)</option>
            </select>
          </Field>
        </div>
        <div className="field-row">
          <Field label="Renews on">
            <input className="input" type="date" value={f.renewsAt} onChange={set('renewsAt')} />
          </Field>
          <Field label="Expires on">
            <input className="input" type="date" value={f.expiresAt} onChange={set('expiresAt')} />
          </Field>
        </div>
        <Field label="Notes">
          <input className="input" value={f.notes} onChange={set('notes')} />
        </Field>

        {error && <div className="error-text">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
