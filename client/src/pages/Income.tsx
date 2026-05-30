import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { IncomeSource, IntervalUnit } from '../api/types'
import { Card, Empty, Field, Loading, Modal, SectionHead } from '../components/ui'
import { intervalLabel, money } from '../lib/format'

interface DistRow {
  accountName: string
  amount: string
}

export function Income() {
  const qc = useQueryClient()
  const income = useQuery({ queryKey: ['income'], queryFn: () => api.get<IncomeSource[]>('/api/income') })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<IncomeSource | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['income'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const save = useMutation({
    mutationFn: (payload: { id?: string; body: Record<string, unknown> }) =>
      payload.id ? api.put(`/api/income/${payload.id}`, payload.body) : api.post('/api/income', payload.body),
    onSuccess: () => {
      invalidate()
      setOpen(false)
      setEditing(null)
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/income/${id}`),
    onSuccess: invalidate,
  })

  if (income.isLoading) return <Loading />
  const total = (income.data ?? []).reduce((s, i) => s + Number(i.amount), 0)

  return (
    <div>
      <h1 className="page-title">Income</h1>
      <p className="page-sub num">{money(total, true)} total monthly income</p>

      <SectionHead
        title="Income sources"
        action={
          <button
            className="btn sm"
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            + Add
          </button>
        }
      />

      {!income.data?.length ? (
        <Card>
          <Empty>No income sources yet.</Empty>
        </Card>
      ) : (
        <div className="grid">
          {income.data.map((src) => (
            <Card key={src.id}>
              <div className="row" style={{ paddingTop: 0 }}>
                <div className="main">
                  <div className="name">{src.name}</div>
                  <div className="meta num">
                    {money(src.amount, true)} {intervalLabel(src.intervalCount, src.intervalUnit)}
                  </div>
                </div>
                <div className="right">
                  <button
                    className="iconbtn"
                    onClick={() => {
                      setEditing(src)
                      setOpen(true)
                    }}
                  >
                    ✎
                  </button>
                  <button className="iconbtn" onClick={() => remove.mutate(src.id)}>
                    ✕
                  </button>
                </div>
              </div>
              {src.distributions.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div className="stat-label" style={{ marginBottom: 4 }}>
                    Distribution
                  </div>
                  {src.distributions.map((d, idx) => (
                    <div className="row" key={idx} style={{ padding: '8px 4px' }}>
                      <span className="dim">{d.accountName}</span>
                      <span className="num">{money(d.amount, true)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {open && (
        <IncomeModal
          source={editing}
          saving={save.isPending}
          error={save.isError ? 'Could not save income source.' : null}
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

function IncomeModal({
  source,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  source: IncomeSource | null
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [name, setName] = useState(source?.name ?? '')
  const [amount, setAmount] = useState(source ? String(source.amount) : '')
  const [intervalCount, setIntervalCount] = useState(String(source?.intervalCount ?? 1))
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(source?.intervalUnit ?? 'MONTH')
  const [dists, setDists] = useState<DistRow[]>(
    source?.distributions.map((d) => ({ accountName: d.accountName, amount: String(d.amount) })) ?? [],
  )

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      name,
      amount,
      intervalCount: Number(intervalCount),
      intervalUnit,
      distributions: dists
        .filter((d) => d.accountName && d.amount)
        .map((d) => ({ accountName: d.accountName, amount: d.amount })),
    })
  }

  return (
    <Modal title={source ? 'Edit income source' : 'Add income source'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="field-row">
          <Field label="Amount">
            <input
              className="input num"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
          <Field label="Every">
            <input
              className="input num"
              type="number"
              min="1"
              value={intervalCount}
              onChange={(e) => setIntervalCount(e.target.value)}
            />
          </Field>
          <Field label="Unit">
            <select className="input" value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}>
              <option value="WEEK">Week(s)</option>
              <option value="MONTH">Month(s)</option>
              <option value="YEAR">Year(s)</option>
              <option value="DAY">Day(s)</option>
            </select>
          </Field>
        </div>

        <div className="field">
          <label>Distribution (where it goes)</label>
          {dists.map((d, i) => (
            <div className="field-row" key={i} style={{ marginBottom: 8 }}>
              <input
                className="input"
                placeholder="Account"
                value={d.accountName}
                onChange={(e) => setDists(dists.map((x, j) => (j === i ? { ...x, accountName: e.target.value } : x)))}
              />
              <input
                className="input num"
                type="number"
                step="0.01"
                placeholder="Amount"
                value={d.amount}
                onChange={(e) => setDists(dists.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
              />
              <button type="button" className="iconbtn" onClick={() => setDists(dists.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn ghost sm" onClick={() => setDists([...dists, { accountName: '', amount: '' }])}>
            + Add destination
          </button>
        </div>

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
