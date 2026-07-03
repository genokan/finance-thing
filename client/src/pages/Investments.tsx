import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Account, AccountKind, Holding, Institution } from '../api/types'
import { AmountCell, Card, DeleteButton, EditButton, Empty, Loading, SectionHead } from '../components/ui'
import { AccountModal, HoldingModal, KIND_LABELS } from './Accounts'
import { dateLabel, money } from '../lib/format'

// Investment accounts only — a focused lens over the Account registry for
// managing positions. Account setup itself still happens on the Accounts page.
const INVESTMENT_KINDS: AccountKind[] = ['BROKERAGE', 'IRA', 'ROTH_IRA', 'PLAN_401K', 'DEFINED_CONTRIBUTION', 'HSA', 'RSU']

export function Investments() {
  const qc = useQueryClient()
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<Account[]>('/api/accounts') })
  const institutions = useQuery({ queryKey: ['institutions'], queryFn: () => api.get<Institution[]>('/api/institutions') })
  const [holdingModal, setHoldingModal] = useState<{ accountId: string; editing: Holding | null } | null>(null)
  const [accountModalOpen, setAccountModalOpen] = useState(false)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['accounts'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['institutions'] })
  }

  const createAccount = useMutation({
    mutationFn: (p: { id?: string; body: Record<string, unknown> }) => api.post('/api/accounts', p.body),
    onSuccess: () => { invalidate(); setAccountModalOpen(false) },
  })
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

  const investmentAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => INVESTMENT_KINDS.includes(a.kind)),
    [accounts.data],
  )
  const total = investmentAccounts.reduce((s, a) => s + a.value, 0)
  const unvested = investmentAccounts.reduce((s, a) => s + a.unvestedValue, 0)

  if (accounts.isLoading || institutions.isLoading) return <Loading />

  return (
    <div>
      <h1 className="page-title">Investments</h1>
      <p className="page-sub num">
        {money(total)} invested{unvested > 0 ? ` · ${money(unvested)} unvested` : ''}
      </p>

      <SectionHead
        title="Investment accounts"
        action={
          <div className="cluster">
            <button className="btn ghost sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              {refresh.isPending ? 'Refreshing…' : '↻ Prices'}
            </button>
            <button className="btn sm" onClick={() => setAccountModalOpen(true)}>+ Add account</button>
          </div>
        }
      />

      {refresh.isSuccess && (
        <div className="note">
          Updated {refresh.data.updated} holding(s){refresh.data.failed.length ? `, failed: ${refresh.data.failed.join(', ')}` : ''}.
        </div>
      )}

      {!investmentAccounts.length ? (
        <Card>
          <Empty>
            No investment accounts yet. Add one on the <Link to="/accounts" className="accent">Accounts</Link> page
            (choose a brokerage/IRA/401k/RSU type), then manage its holdings here.
          </Empty>
        </Card>
      ) : (
        investmentAccounts.map((a) => (
          <Card key={a.id}>
            <div className="row lead">
              <div className="main">
                <div className="name">{a.name} <span className="badge neutral">{KIND_LABELS[a.kind]}</span></div>
                <div className="meta">
                  {a.institution?.name ?? 'No institution'}
                  {a.lastUpdatedAt ? ` · updated ${dateLabel(a.lastUpdatedAt)}` : ''}
                  {a.unvestedValue > 0 ? <span className="num"> · {money(a.unvestedValue)} unvested</span> : null}
                </div>
              </div>
              <AmountCell value={money(a.value)} label="Value" />
            </div>

            {a.trackingMode === 'HOLDINGS' ? (
              <div style={{ marginTop: 8 }}>
                {a.holdings.map((h) => (
                  <div className="row sub" key={h.id}>
                    <div className="main">
                      <span>{h.label}</span> {h.ticker && <span className="dim">· {h.ticker}</span>}
                      {h.unvestedValue ? <span className="dim num"> · {money(h.unvestedValue)} unvested</span> : null}
                    </div>
                    <div className="right">
                      <span className="num">{money(h.value)}</span>
                      <EditButton label={`Edit ${h.label}`} onClick={() => setHoldingModal({ accountId: a.id, editing: h })} />
                      <DeleteButton label={`Delete ${h.label}`} onDelete={() => removeHolding.mutate({ accountId: a.id, id: h.id })} />
                    </div>
                  </div>
                ))}
                <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => setHoldingModal({ accountId: a.id, editing: null })}>
                  + Add holding
                </button>
              </div>
            ) : (
              <div className="note" style={{ marginTop: 6, marginBottom: 0 }}>
                Balance-tracked — switch to “Holdings” tracking on the{' '}
                <Link to="/accounts" className="accent">Accounts</Link> page to add positions.
              </div>
            )}
          </Card>
        ))
      )}

      {holdingModal && (
        <HoldingModal
          holding={holdingModal.editing}
          saving={saveHolding.isPending}
          onClose={() => setHoldingModal(null)}
          onSubmit={(body) => saveHolding.mutate({ accountId: holdingModal.accountId, id: holdingModal.editing?.id, body })}
        />
      )}

      {accountModalOpen && (
        <AccountModal
          account={null}
          institutions={institutions.data ?? []}
          defaultKind="BROKERAGE"
          saving={createAccount.isPending}
          onClose={() => setAccountModalOpen(false)}
          onSubmit={createAccount.mutate}
        />
      )}
    </div>
  )
}
