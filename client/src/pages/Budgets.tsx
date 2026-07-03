import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { BudgetBucket, BudgetOverview, Category } from '../api/types'
import { Bar, BucketBadge, Card, DeleteButton, EditButton, Field, Loading, MoneyInput, Modal, SectionHead } from '../components/ui'
import { money, percent } from '../lib/format'

// Tones match the bucket colors used everywhere else: gold / indigo / mint.
const BUCKETS: { key: BudgetBucket; label: string; target: number; tone: string }[] = [
  { key: 'ESSENTIAL', label: 'Needs (essential)', target: 50, tone: 'accent' },
  { key: 'DISCRETIONARY', label: 'Wants (discretionary)', target: 30, tone: 'info' },
  { key: 'SAVINGS', label: 'Savings', target: 20, tone: 'pos' },
]

export function Budgets() {
  const qc = useQueryClient()
  const overview = useQuery({ queryKey: ['budgets'], queryFn: () => api.get<BudgetOverview>('/api/budgets') })
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/api/categories') })
  const [modal, setModal] = useState<{ open: boolean; editing: Category | null }>({ open: false, editing: null })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['budgets'] })
    qc.invalidateQueries({ queryKey: ['categories'] })
  }
  const save = useMutation({
    mutationFn: (p: { id?: string; body: Record<string, unknown> }) =>
      p.id ? api.put(`/api/categories/${p.id}`, p.body) : api.post('/api/categories', p.body),
    onSuccess: () => { invalidate(); setModal({ open: false, editing: null }) },
  })
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/api/categories/${id}`), onSuccess: invalidate })
  const seedDefaults = useMutation({ mutationFn: () => api.post('/api/categories/seed-defaults'), onSuccess: invalidate })

  if (overview.isLoading || categories.isLoading) return <Loading />
  const ov = overview.data!
  const cats = categories.data ?? []
  const actualById = new Map(ov.categories.map((c) => [c.id, c.actual]))

  // Render parents then their children indented.
  const parents = cats.filter((c) => !c.parentId)
  const childrenOf = (id: string) => cats.filter((c) => c.parentId === id)

  return (
    <div>
      <h1 className="page-title">Budgets</h1>
      <p className="page-sub num">{money(ov.totalMonthlyIncome)}/mo net income · 50 / 30 / 20 framework</p>

      <Card>
        {BUCKETS.map((b) => {
          const row = ov.buckets.find((x) => x.bucket === b.key)
          const pct = row?.percentOfIncome ?? 0
          return (
            <div className="bar-row" key={b.key}>
              <div className="lbl">
                <span>{b.label} <span className="dim num">· {money(row?.actual ?? 0)}</span></span>
                <span className="num dim">{percent(pct)} <span style={{ opacity: 0.6 }}>/ {b.target}%</span></span>
              </div>
              <Bar pct={(pct / b.target) * 100} tone={b.tone} />
            </div>
          )
        })}
      </Card>

      <SectionHead
        title="Categories"
        action={
          <div className="cluster">
            <button className="btn ghost sm" onClick={() => seedDefaults.mutate()} disabled={seedDefaults.isPending}>
              {seedDefaults.isPending ? 'Adding…' : 'Add common categories'}
            </button>
            <button className="btn sm" onClick={() => setModal({ open: true, editing: null })}>+ Add category</button>
          </div>
        }
      />
      <p className="page-note">
        Categories work without budgets — a monthly target is optional. Use “Add common categories” for a starter set.
      </p>
      <Card>
        <div className="list">
          {parents.map((p) => (
            <div key={p.id}>
              <CategoryRow cat={p} actual={actualById.get(p.id) ?? 0} onEdit={() => setModal({ open: true, editing: p })} onDelete={() => remove.mutate(p.id)} />
              {childrenOf(p.id).map((c) => (
                <CategoryRow key={c.id} cat={c} actual={actualById.get(c.id) ?? 0} indent onEdit={() => setModal({ open: true, editing: c })} onDelete={() => remove.mutate(c.id)} />
              ))}
            </div>
          ))}
        </div>
      </Card>

      {modal.open && (
        <CategoryModal
          category={modal.editing}
          parents={parents}
          saving={save.isPending}
          onClose={() => setModal({ open: false, editing: null })}
          onSubmit={(body) => save.mutate({ id: modal.editing?.id, body })}
        />
      )}
    </div>
  )
}

function CategoryRow({
  cat, actual, indent, onEdit, onDelete,
}: {
  cat: Category
  actual: number
  indent?: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const budget = cat.monthlyBudget != null ? Number(cat.monthlyBudget) : null
  const over = budget != null && actual > budget
  return (
    <div className="row" style={indent ? { paddingLeft: 20 } : undefined}>
      <div className="main">
        {/* BucketBadge keeps bucket naming/colors identical to every other page. */}
        <div className="name">{indent ? '↳ ' : ''}{cat.name} <BucketBadge bucket={cat.bucket} /></div>
        <div className="meta num">
          {money(actual)} spent{budget != null ? ` of ${money(budget)} budget` : ' · no budget set'}
          {over ? <span className="neg"> · over</span> : null}
        </div>
      </div>
      <div className="right">
        <EditButton label={`Edit ${cat.name}`} onClick={onEdit} />
        <DeleteButton label={`Delete ${cat.name}`} onDelete={onDelete} />
      </div>
    </div>
  )
}

function CategoryModal({
  category, parents, saving, onClose, onSubmit,
}: {
  category: Category | null
  parents: Category[]
  saving: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [bucket, setBucket] = useState<BudgetBucket>(category?.bucket ?? 'ESSENTIAL')
  const [monthlyBudget, setMonthlyBudget] = useState(category?.monthlyBudget ?? '')
  const [parentId, setParentId] = useState(category?.parentId ?? '')

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      name, bucket,
      monthlyBudget: monthlyBudget === '' ? undefined : monthlyBudget,
      parentId: parentId || undefined,
    })
  }

  return (
    <Modal title={category ? 'Edit category' : 'Add category'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <div className="field-row">
          <Field label="Bucket (50/30/20)">
            <select className="input" value={bucket} onChange={(e) => setBucket(e.target.value as BudgetBucket)}>
              <option value="ESSENTIAL">Essential (needs)</option>
              <option value="DISCRETIONARY">Discretionary (wants)</option>
              <option value="SAVINGS">Savings</option>
            </select>
          </Field>
          <Field label="Monthly budget (optional)">
            <MoneyInput value={monthlyBudget} onChange={setMonthlyBudget} />
          </Field>
        </div>
        <Field label="Parent category (optional)">
          <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— none (top level) —</option>
            {parents.filter((p) => p.id !== category?.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
