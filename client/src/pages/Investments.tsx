import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Institution, Investment, InvestmentType } from '../api/types'
import { Card, Empty, Field, Loading, Modal, SectionHead } from '../components/ui'
import { dateLabel, money } from '../lib/format'

const TYPE_LABELS: Record<InvestmentType, string> = {
  BROKERAGE: 'Brokerage',
  IRA: 'IRA',
  ROTH_IRA: 'Roth IRA',
  PLAN_401K: '401(k)',
  DEFINED_CONTRIBUTION: 'DC Plan',
  RSU: 'RSU',
  SAVINGS: 'Savings',
  MONEY_MARKET: 'Money Market',
  CHECKING: 'Checking',
}

async function resolveInstitution(name: string, existing: Institution[]): Promise<string | undefined> {
  const trimmed = name.trim()
  if (!trimmed) return undefined
  const match = existing.find((i) => i.name.toLowerCase() === trimmed.toLowerCase())
  if (match) return match.id
  const created = await api.post<Institution>('/api/institutions', { name: trimmed })
  return created.id
}

export function Investments() {
  const qc = useQueryClient()
  const accounts = useQuery({ queryKey: ['investments'], queryFn: () => api.get<Investment[]>('/api/investments') })
  const institutions = useQuery({ queryKey: ['institutions'], queryFn: () => api.get<Institution[]>('/api/institutions') })

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Investment | null>(null)
  const [csvOpen, setCsvOpen] = useState(false)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['investments'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['institutions'] })
  }

  const save = useMutation({
    mutationFn: (payload: { id?: string; body: Record<string, unknown> }) =>
      payload.id ? api.put(`/api/investments/${payload.id}`, payload.body) : api.post('/api/investments', payload.body),
    onSuccess: () => {
      invalidate()
      setOpen(false)
      setEditing(null)
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/investments/${id}`),
    onSuccess: invalidate,
  })

  const refresh = useMutation({
    mutationFn: () => api.post<{ updated: number; failed: string[] }>('/api/investments/refresh-prices'),
    onSuccess: invalidate,
  })

  const grouped = useMemo(() => {
    const map = new Map<string, Investment[]>()
    for (const a of accounts.data ?? []) {
      const key = a.institution?.name ?? 'Other'
      map.set(key, [...(map.get(key) ?? []), a])
    }
    return [...map.entries()]
  }, [accounts.data])

  if (accounts.isLoading || institutions.isLoading) return <Loading />

  const vested = (accounts.data ?? []).reduce((s, a) => s + Number(a.currentValue), 0)
  const unvested = (accounts.data ?? []).reduce((s, a) => s + Number(a.unvestedValue ?? 0), 0)

  return (
    <div>
      <h1 className="page-title">Investments</h1>
      <p className="page-sub num">
        {money(vested)} current{unvested > 0 ? ` · ${money(unvested)} unvested` : ''}
      </p>

      <SectionHead
        title="Accounts"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              {refresh.isPending ? 'Refreshing…' : '↻ Prices'}
            </button>
            <button className="btn ghost sm" onClick={() => setCsvOpen(true)}>
              Import CSV
            </button>
            <button
              className="btn sm"
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              + Add
            </button>
          </div>
        }
      />

      {refresh.isSuccess && (
        <div className="dim" style={{ marginBottom: 10 }}>
          Updated {refresh.data.updated} account(s)
          {refresh.data.failed.length > 0 ? `, failed: ${refresh.data.failed.join(', ')}` : ''}.
        </div>
      )}

      {!accounts.data?.length ? (
        <Card>
          <Empty>No investment accounts yet.</Empty>
        </Card>
      ) : (
        grouped.map(([inst, list]) => (
          <div key={inst}>
            <div className="stat-label" style={{ margin: '18px 0 8px' }}>
              {inst}
            </div>
            <Card>
              <div className="list">
                {list.map((a) => (
                  <div className="row" key={a.id}>
                    <div className="main">
                      <div className="name">
                        {a.name} {a.ticker && <span className="dim">· {a.ticker}</span>}
                      </div>
                      <div className="meta">
                        <span className="badge neutral">{TYPE_LABELS[a.type]}</span>
                        {a.type === 'RSU' && a.unvestedValue ? (
                          <span className="num"> · {money(a.unvestedValue)} unvested</span>
                        ) : null}
                        {a.lastUpdatedAt ? <span className="num"> · updated {dateLabel(a.lastUpdatedAt)}</span> : null}
                      </div>
                    </div>
                    <div className="right">
                      <div className="amt num">{money(a.currentValue)}</div>
                      <button
                        className="iconbtn"
                        onClick={() => {
                          setEditing(a)
                          setOpen(true)
                        }}
                      >
                        ✎
                      </button>
                      <button className="iconbtn" onClick={() => remove.mutate(a.id)}>
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ))
      )}

      {open && (
        <InvestmentModal
          account={editing}
          institutions={institutions.data ?? []}
          saving={save.isPending}
          error={save.isError ? 'Could not save account.' : null}
          onClose={() => {
            setOpen(false)
            setEditing(null)
          }}
          onSubmit={save.mutate}
        />
      )}

      {csvOpen && <CsvModal onClose={() => setCsvOpen(false)} onDone={invalidate} />}
    </div>
  )
}

function InvestmentModal({
  account,
  institutions,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  account: Investment | null
  institutions: Institution[]
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (p: { id?: string; body: Record<string, unknown> }) => void
}) {
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<InvestmentType>(account?.type ?? 'BROKERAGE')
  const [ticker, setTicker] = useState(account?.ticker ?? '')
  const [shares, setShares] = useState(account?.shares ? String(account.shares) : '')
  const [vestedShares, setVestedShares] = useState(account?.vestedShares ? String(account.vestedShares) : '')
  const [unvestedShares, setUnvestedShares] = useState(account?.unvestedShares ? String(account.unvestedShares) : '')
  const [unvestedValue, setUnvestedValue] = useState(account?.unvestedValue ? String(account.unvestedValue) : '')
  const [currentValue, setCurrentValue] = useState(account?.currentValue ? String(account.currentValue) : '')
  const [institution, setInstitution] = useState(account?.institution?.name ?? '')
  const [resolving, setResolving] = useState(false)

  const isRSU = type === 'RSU'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setResolving(true)
    let institutionId: string | undefined
    try {
      institutionId = await resolveInstitution(institution, institutions)
    } finally {
      setResolving(false)
    }
    const body: Record<string, unknown> = {
      name,
      type,
      currentValue,
      ticker: ticker || undefined,
      institutionId,
    }
    if (isRSU) {
      body.vestedShares = vestedShares || undefined
      body.unvestedShares = unvestedShares || undefined
      body.unvestedValue = unvestedValue || undefined
    } else {
      body.shares = shares || undefined
    }
    onSubmit({ id: account?.id, body })
  }

  return (
    <Modal title={account ? 'Edit account' : 'Add account'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="field-row">
          <Field label="Type">
            <select className="input" value={type} onChange={(e) => setType(e.target.value as InvestmentType)}>
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Institution">
            <input
              className="input"
              list="institutions"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="e.g. Fidelity"
            />
            <datalist id="institutions">
              {institutions.map((i) => (
                <option key={i.id} value={i.name} />
              ))}
            </datalist>
          </Field>
        </div>

        <div className="field-row">
          <Field label={isRSU ? 'Vested value' : 'Current value'}>
            <input
              className="input num"
              type="number"
              step="0.01"
              min="0"
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
              required
            />
          </Field>
          <Field label="Ticker (optional)">
            <input className="input" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} />
          </Field>
        </div>

        {isRSU ? (
          <>
            <div className="field-row">
              <Field label="Vested shares">
                <input className="input num" type="number" step="0.000001" value={vestedShares} onChange={(e) => setVestedShares(e.target.value)} />
              </Field>
              <Field label="Unvested shares">
                <input className="input num" type="number" step="0.000001" value={unvestedShares} onChange={(e) => setUnvestedShares(e.target.value)} />
              </Field>
            </div>
            <Field label="Unvested value (excluded from liquid net worth)">
              <input className="input num" type="number" step="0.01" min="0" value={unvestedValue} onChange={(e) => setUnvestedValue(e.target.value)} />
            </Field>
          </>
        ) : (
          <Field label="Shares (optional — enables price refresh)">
            <input className="input num" type="number" step="0.000001" value={shares} onChange={(e) => setShares(e.target.value)} />
          </Field>
        )}

        {error && <div className="error-text">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={saving || resolving}>
            {saving || resolving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CsvModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState('')
  const importMut = useMutation({
    mutationFn: () => api.post<{ imported: number; errors: { row: number; message: string }[] }>('/api/investments/import-csv', { csv }),
    onSuccess: () => onDone(),
  })

  return (
    <Modal title="Import accounts from CSV" onClose={onClose}>
      <p className="page-sub">
        Columns: <code>account_name, institution, type, value, ticker, shares</code>. Type must be one of the account
        types (e.g. IRA, BROKERAGE).
      </p>
      <Field label="Paste CSV">
        <textarea className="input" rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} />
      </Field>

      {importMut.isSuccess && (
        <div className="dim">
          Imported {importMut.data.imported} account(s).
          {importMut.data.errors.length > 0 && (
            <ul style={{ marginTop: 6, paddingLeft: 18 }}>
              {importMut.data.errors.map((er, i) => (
                <li key={i} className="error-text">
                  Row {er.row}: {er.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {importMut.isError && <div className="error-text">Import failed. Check your CSV format.</div>}

      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          {importMut.isSuccess ? 'Done' : 'Cancel'}
        </button>
        <button type="button" className="btn" disabled={!csv || importMut.isPending} onClick={() => importMut.mutate()}>
          {importMut.isPending ? 'Importing…' : 'Import'}
        </button>
      </div>
    </Modal>
  )
}
