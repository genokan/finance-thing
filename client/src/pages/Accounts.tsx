import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Account, AccountKind, Holding, Institution, TrackingMode } from '../api/types'
import { Card, Empty, Field, Loading, Modal, SectionHead } from '../components/ui'
import { PlaidConnect } from '../components/PlaidConnect'
import { dateLabel, money } from '../lib/format'

const KIND_LABELS: Record<AccountKind, string> = {
  CHECKING: 'Checking', SAVINGS: 'Savings', MONEY_MARKET: 'Money Market', BROKERAGE: 'Brokerage',
  IRA: 'IRA', ROTH_IRA: 'Roth IRA', PLAN_401K: '401(k)', DEFINED_CONTRIBUTION: 'DC Plan',
  HSA: 'HSA', RSU: 'RSU', OTHER: 'Other',
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

  const [acctModal, setAcctModal] = useState<{ open: boolean; editing: Account | null }>({ open: false, editing: null })
  const [holdingModal, setHoldingModal] = useState<{ accountId: string; editing: Holding | null } | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['accounts'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['institutions'] })
  }

  const saveAccount = useMutation({
    mutationFn: (p: { id?: string; body: Record<string, unknown> }) =>
      p.id ? api.put(`/api/accounts/${p.id}`, p.body) : api.post('/api/accounts', p.body),
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

  const total = useMemo(() => (accounts.data ?? []).reduce((s, a) => s + a.value, 0), [accounts.data])
  const unvested = useMemo(() => (accounts.data ?? []).reduce((s, a) => s + a.unvestedValue, 0), [accounts.data])

  const grouped = useMemo(() => {
    const map = new Map<string, Account[]>()
    for (const a of accounts.data ?? []) {
      const key = a.institution?.name ?? 'Other'
      map.set(key, [...(map.get(key) ?? []), a])
    }
    return [...map.entries()]
  }, [accounts.data])

  if (accounts.isLoading || institutions.isLoading) return <Loading />

  return (
    <div>
      <h1 className="page-title">Accounts</h1>
      <p className="page-sub num">
        {money(total)} across {accounts.data?.length ?? 0} accounts{unvested > 0 ? ` · ${money(unvested)} unvested` : ''}
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
                    <div className="name">{a.name} <span className="badge neutral">{KIND_LABELS[a.kind]}</span></div>
                    <div className="meta">
                      {a.trackingMode === 'HOLDINGS' ? `${a.holdings.length} holding(s)` : 'Balance-tracked'}
                      {a.lastUpdatedAt ? ` · updated ${dateLabel(a.lastUpdatedAt)}` : ''}
                      {a.unvestedValue > 0 ? <span className="num"> · {money(a.unvestedValue)} unvested</span> : null}
                    </div>
                  </div>
                  <div className="right">
                    <div className="amt num">{money(a.value)}</div>
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
          institutions={institutions.data ?? []}
          saving={saveAccount.isPending}
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

function AccountModal({
  account, institutions, saving, onClose, onSubmit,
}: {
  account: Account | null
  institutions: Institution[]
  saving: boolean
  onClose: () => void
  onSubmit: (p: { id?: string; body: Record<string, unknown> }) => void
}) {
  const [name, setName] = useState(account?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'CHECKING')
  const [trackingMode, setTrackingMode] = useState<TrackingMode>(account?.trackingMode ?? 'BALANCE')
  const [balance, setBalance] = useState(account ? String(account.balance) : '')
  const [institution, setInstitution] = useState(account?.institution?.name ?? '')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    let institutionId: string | undefined
    try { institutionId = await resolveInstitution(institution, institutions) } finally { setBusy(false) }
    onSubmit({ id: account?.id, body: { name, kind, trackingMode, balance: balance || '0', institutionId } })
  }

  return (
    <Modal title={account ? 'Edit account' : 'Add account'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="field-row">
          <Field label="Type">
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
              {Object.entries(KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Institution">
            <input className="input" list="insts" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. Fidelity" />
            <datalist id="insts">{institutions.map((i) => <option key={i.id} value={i.name} />)}</datalist>
          </Field>
        </div>
        <Field label="Tracking">
          <select className="input" value={trackingMode} onChange={(e) => setTrackingMode(e.target.value as TrackingMode)}>
            <option value="BALANCE">Single balance</option>
            <option value="HOLDINGS">Holdings (sum of positions)</option>
          </select>
        </Field>
        {trackingMode === 'BALANCE' && (
          <Field label="Current balance">
            <input className="input num" type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </Field>
        )}
        {trackingMode === 'HOLDINGS' && (
          <p className="dim" style={{ fontSize: 13, marginBottom: 12 }}>Value comes from the holdings you add to this account.</p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={saving || busy}>{saving || busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

function HoldingModal({
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
          <Field label="Value"><input className="input num" type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} required /></Field>
          <Field label="Shares (enables price refresh)"><input className="input num" type="number" step="0.000001" value={shares} onChange={(e) => setShares(e.target.value)} /></Field>
        </div>
        <p className="dim" style={{ fontSize: 13, margin: '4px 0 10px' }}>RSU? Use vested/unvested below (leave shares blank).</p>
        <div className="field-row">
          <Field label="Vested shares"><input className="input num" type="number" step="0.000001" value={vestedShares} onChange={(e) => setVestedShares(e.target.value)} /></Field>
          <Field label="Unvested shares"><input className="input num" type="number" step="0.000001" value={unvestedShares} onChange={(e) => setUnvestedShares(e.target.value)} /></Field>
        </div>
        <Field label="Unvested value (excluded from liquid net worth)">
          <input className="input num" type="number" step="0.01" value={unvestedValue} onChange={(e) => setUnvestedValue(e.target.value)} />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
