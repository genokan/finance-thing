import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Debt, DebtType } from '../api/types'
import { Card, Empty, Field, Loading, Modal, SectionHead } from '../components/ui'
import { dateLabel, daysUntil, money, percent } from '../lib/format'

export function DebtPage() {
  const qc = useQueryClient()
  const debts = useQuery({ queryKey: ['debts'], queryFn: () => api.get<Debt[]>('/api/debts') })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Debt | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['debts'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['insights'] })
  }

  const save = useMutation({
    mutationFn: (payload: { id?: string; body: Record<string, unknown> }) =>
      payload.id ? api.put(`/api/debts/${payload.id}`, payload.body) : api.post('/api/debts', payload.body),
    onSuccess: () => {
      invalidate()
      setOpen(false)
      setEditing(null)
    },
  })

  const remove = useMutation({ mutationFn: (id: string) => api.del(`/api/debts/${id}`), onSuccess: invalidate })

  if (debts.isLoading) return <Loading />

  const all = debts.data ?? []
  const shortTerm = all.filter((d) => d.type === 'SHORT_TERM')
  const longTerm = all.filter((d) => d.type === 'LONG_TERM')
  const total = all.reduce((s, d) => s + Number(d.principal), 0)

  function openNew() {
    setEditing(null)
    setOpen(true)
  }

  return (
    <div>
      <h1 className="page-title">Debt</h1>
      <p className="page-sub num">{money(total)} total outstanding</p>

      <SectionHead
        title="0% promos & short-term"
        action={
          <button className="btn sm" onClick={openNew}>
            + Add
          </button>
        }
      />
      <Card>
        {shortTerm.length === 0 ? (
          <Empty>No short-term debt.</Empty>
        ) : (
          <div className="list">
            {shortTerm.map((d) => {
              const days = daysUntil(d.payoffDate)
              const expiring = days !== null && days <= 60
              return (
                <div className="row" key={d.id}>
                  <div className="main">
                    <div className="name">
                      {d.name}{' '}
                      {expiring && <span className="badge bad">{days}d left</span>}
                    </div>
                    <div className="meta num">
                      Pay off by {dateLabel(d.payoffDate)}
                      {d.promoApr ? ` · then ${percent(Number(d.promoApr), 2)} APR` : ''}
                    </div>
                  </div>
                  <div className="right">
                    <div className="amt num">{money(d.principal)}</div>
                    <button className="iconbtn" onClick={() => { setEditing(d); setOpen(true) }}>✎</button>
                    <button className="iconbtn" onClick={() => remove.mutate(d.id)}>✕</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <SectionHead title="Long-term debt" />
      <Card>
        {longTerm.length === 0 ? (
          <Empty>No long-term debt.</Empty>
        ) : (
          <div className="list">
            {longTerm.map((d) => (
              <div className="row" key={d.id}>
                <div className="main">
                  <div className="name">{d.name}</div>
                  <div className="meta num">
                    {percent(Number(d.apr), 2)} APR · {money(d.monthlyPayment, true)}/mo
                    {d.payoffDate ? ` · payoff ${dateLabel(d.payoffDate)}` : ''}
                  </div>
                </div>
                <div className="right">
                  <div className="amt num">{money(d.principal)}</div>
                  <button className="iconbtn" onClick={() => { setEditing(d); setOpen(true) }}>✎</button>
                  <button className="iconbtn" onClick={() => remove.mutate(d.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {open && (
        <DebtModal
          debt={editing}
          saving={save.isPending}
          error={save.isError ? 'Could not save debt.' : null}
          onClose={() => { setOpen(false); setEditing(null) }}
          onSubmit={(body) => save.mutate({ id: editing?.id, body })}
        />
      )}
    </div>
  )
}

function DebtModal({
  debt,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  debt: Debt | null
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [name, setName] = useState(debt?.name ?? '')
  const [type, setType] = useState<DebtType>(debt?.type ?? 'LONG_TERM')
  const [principal, setPrincipal] = useState(debt ? String(debt.principal) : '')
  const [monthlyPayment, setMonthlyPayment] = useState(debt ? String(debt.monthlyPayment) : '')
  const [apr, setApr] = useState(debt ? String(debt.apr) : '')
  const [payoffDate, setPayoffDate] = useState(debt?.payoffDate ? debt.payoffDate.slice(0, 10) : '')
  const [promoApr, setPromoApr] = useState(debt?.promoApr ? String(debt.promoApr) : '')
  const [notes, setNotes] = useState(debt?.notes ?? '')

  const isShort = type === 'SHORT_TERM'

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      name,
      type,
      principal,
      monthlyPayment: monthlyPayment || '0',
      apr: apr || '0',
      payoffDate: payoffDate || undefined,
      promoApr: isShort && promoApr ? promoApr : undefined,
      notes: notes || undefined,
    })
  }

  return (
    <Modal title={debt ? 'Edit debt' : 'Add debt'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="field-row">
          <Field label="Type">
            <select className="input" value={type} onChange={(e) => setType(e.target.value as DebtType)}>
              <option value="LONG_TERM">Long-term</option>
              <option value="SHORT_TERM">Short-term / 0% promo</option>
            </select>
          </Field>
          <Field label="Principal">
            <input className="input num" type="number" step="0.01" min="0" value={principal} onChange={(e) => setPrincipal(e.target.value)} required />
          </Field>
        </div>
        <div className="field-row">
          <Field label="APR %">
            <input className="input num" type="number" step="0.01" min="0" value={apr} onChange={(e) => setApr(e.target.value)} />
          </Field>
          <Field label="Monthly payment">
            <input className="input num" type="number" step="0.01" min="0" value={monthlyPayment} onChange={(e) => setMonthlyPayment(e.target.value)} />
          </Field>
        </div>
        <div className="field-row">
          <Field label={isShort ? 'Pay-off-by date' : 'Est. payoff date'}>
            <input className="input" type="date" value={payoffDate} onChange={(e) => setPayoffDate(e.target.value)} />
          </Field>
          {isShort && (
            <Field label="Post-promo APR %">
              <input className="input num" type="number" step="0.01" min="0" value={promoApr} onChange={(e) => setPromoApr(e.target.value)} />
            </Field>
          )}
        </div>
        <Field label="Notes">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
