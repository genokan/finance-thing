import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Account, Contribution, ContributionKind, IncomeSource, IntervalUnit, PayFrequency } from '../api/types'
import { AmountCell, Card, DeleteButton, EditButton, Empty, Field, Loading, MoneyInput, Modal, SectionHead } from '../components/ui'
import { intervalLabel, money } from '../lib/format'

const KIND_LABELS: Record<ContributionKind, string> = {
  RETIREMENT: 'Retirement', SAVINGS: 'Savings', BROKERAGE: 'Brokerage', EXTRA_DEBT: 'Extra debt', OTHER: 'Other',
}

const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  WEEKLY: 52, BIWEEKLY: 26, SEMIMONTHLY: 24, MONTHLY: 12, ANNUAL: 1,
}

export function Contributions() {
  const qc = useQueryClient()
  const contributions = useQuery({ queryKey: ['contributions'], queryFn: () => api.get<Contribution[]>('/api/contributions') })
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<Account[]>('/api/accounts') })
  const income = useQuery({ queryKey: ['income'], queryFn: () => api.get<IncomeSource[]>('/api/income') })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Contribution | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['contributions'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }
  const save = useMutation({
    mutationFn: (p: { id?: string; body: Record<string, unknown> }) =>
      p.id ? api.put(`/api/contributions/${p.id}`, p.body) : api.post('/api/contributions', p.body),
    onSuccess: () => { invalidate(); setOpen(false); setEditing(null) },
  })
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/api/contributions/${id}`), onSuccess: invalidate })

  if (contributions.isLoading || accounts.isLoading || income.isLoading) return <Loading />
  const items = contributions.data ?? []
  const total = items.reduce((s, c) => s + c.monthlyEquivalent, 0)

  // Payroll deductions with a linked account are contributions too — entered
  // once (on Income), shown here read-only so nothing wealth-building is hidden.
  const accountName = new Map((accounts.data ?? []).map((a) => [a.id, a.name]))
  const payroll = (income.data ?? []).flatMap((src) =>
    src.deductions
      .filter((d) => d.linkedAccountId)
      .map((d) => ({
        key: `${src.id}-${d.name}`,
        name: d.name,
        source: src.name,
        preTax: d.preTax,
        accountLabel: accountName.get(d.linkedAccountId!) ?? 'Linked account',
        monthly: (Number(d.amount) * PERIODS_PER_YEAR[src.payFrequency]) / 12,
      })),
  )
  const payrollTotal = payroll.reduce((s, p) => s + p.monthly, 0)

  return (
    <div>
      <h1 className="page-title">Contributions</h1>
      <p className="page-sub num">
        {money(total, true)}/mo from take-home
        {payrollTotal > 0 ? ` · ${money(payrollTotal, true)}/mo via payroll` : ''} · savings &amp; investing
      </p>
      <p className="page-note">
        Money you move into assets (retirement, savings, brokerage) or extra debt principal. Builds net worth — not counted as outflow.
      </p>

      <SectionHead title="Recurring contributions" action={<button className="btn sm" onClick={() => { setEditing(null); setOpen(true) }}>+ Add</button>} />
      <Card>
        {!items.length ? <Empty>No contributions yet. Add your monthly savings or investing.</Empty> : (
          <div className="list">
            {items.map((c) => (
              <div className="row" key={c.id}>
                <div className="main">
                  <div className="name">{c.name} <span className="badge good">{KIND_LABELS[c.kind]}</span></div>
                  <div className="meta">
                    {c.destinationAccount ? `→ ${c.destinationAccount.name} · ` : ''}
                    {money(c.amount, true)} {intervalLabel(c.intervalCount, c.intervalUnit)}
                  </div>
                </div>
                <div className="right">
                  <AmountCell value={money(c.monthlyEquivalent, true)} label="Per month" />
                  <EditButton label={`Edit ${c.name}`} onClick={() => { setEditing(c); setOpen(true) }} />
                  <DeleteButton label={`Delete ${c.name}`} onDelete={() => remove.mutate(c.id)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {payroll.length > 0 && (
        <>
          <SectionHead
            title="Via payroll"
            action={<Link to="/income" className="dim" style={{ fontSize: 13 }}>Edit on Income →</Link>}
          />
          <Card>
            <div className="list">
              {payroll.map((p) => (
                <div className="row" key={p.key}>
                  <div className="main">
                    <div className="name">
                      {p.name} <span className="badge neutral">{p.preTax ? 'pre-tax' : 'post-tax'}</span>
                    </div>
                    <div className="meta">→ {p.accountLabel} · withheld from {p.source}</div>
                  </div>
                  <AmountCell value={money(p.monthly, true)} label="Per month" />
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {open && (
        <ContributionModal
          contribution={editing}
          accounts={accounts.data ?? []}
          saving={save.isPending}
          onClose={() => { setOpen(false); setEditing(null) }}
          onSubmit={(body) => save.mutate({ id: editing?.id, body })}
        />
      )}
    </div>
  )
}

function ContributionModal({
  contribution, accounts, saving, onClose, onSubmit,
}: {
  contribution: Contribution | null
  accounts: Account[]
  saving: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [name, setName] = useState(contribution?.name ?? '')
  const [amount, setAmount] = useState(contribution ? String(contribution.amount) : '')
  const [kind, setKind] = useState<ContributionKind>(contribution?.kind ?? 'SAVINGS')
  const [intervalCount, setIntervalCount] = useState(String(contribution?.intervalCount ?? 1))
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(contribution?.intervalUnit ?? 'MONTH')
  const [destinationAccountId, setDestinationAccountId] = useState(contribution?.destinationAccountId ?? '')
  const [notes, setNotes] = useState(contribution?.notes ?? '')

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      name, amount, kind,
      intervalCount: Number(intervalCount), intervalUnit,
      destinationAccountId: destinationAccountId || null,
      notes: notes || undefined,
    })
  }

  return (
    <Modal title={contribution ? 'Edit contribution' : 'Add contribution'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <div className="field-row">
          <Field label="Amount"><MoneyInput value={amount} onChange={setAmount} required /></Field>
          <Field label="Type">
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as ContributionKind)}>
              {Object.entries(KIND_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </div>
        <div className="field-row">
          <Field label="Every"><input className="input num" type="number" min="1" value={intervalCount} onChange={(e) => setIntervalCount(e.target.value)} required /></Field>
          <Field label="Unit">
            <select className="input" value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}>
              <option value="DAY">Day(s)</option><option value="WEEK">Week(s)</option><option value="MONTH">Month(s)</option><option value="YEAR">Year(s)</option>
            </select>
          </Field>
        </div>
        <Field label="Destination account (optional)">
          <select className="input" value={destinationAccountId} onChange={(e) => setDestinationAccountId(e.target.value)}>
            <option value="">— none —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
