import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Account, IncomeSource, IncomeType, PayFrequency, TaxMode, FilingStatus, Deduction, Distribution } from '../api/types'
import { Card, Empty, Field, Loading, MoneyInput, Modal, SectionHead } from '../components/ui'
import { money, percent } from '../lib/format'

const FREQ_LABELS: Record<PayFrequency, string> = {
  WEEKLY: 'Weekly', BIWEEKLY: 'Bi-weekly', SEMIMONTHLY: 'Semi-monthly', MONTHLY: 'Monthly', ANNUAL: 'Annual',
}

export function Income() {
  const qc = useQueryClient()
  const income = useQuery({ queryKey: ['income'], queryFn: () => api.get<IncomeSource[]>('/api/income') })
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<Account[]>('/api/accounts') })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<IncomeSource | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['income'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['budgets'] })
  }
  const save = useMutation({
    mutationFn: (p: { id?: string; body: Record<string, unknown> }) =>
      p.id ? api.put(`/api/income/${p.id}`, p.body) : api.post('/api/income', p.body),
    onSuccess: () => { invalidate(); setOpen(false); setEditing(null) },
  })
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/api/income/${id}`), onSuccess: invalidate })

  if (income.isLoading || accounts.isLoading) return <Loading />
  const netMonthly = (income.data ?? []).reduce((s, i) => s + i.tax.netMonthly, 0)

  return (
    <div>
      <h1 className="page-title">Income</h1>
      <p className="page-sub num">{money(netMonthly)} net/mo take-home</p>

      <SectionHead title="Income sources" action={<button className="btn sm" onClick={() => { setEditing(null); setOpen(true) }}>+ Add</button>} />

      {!income.data?.length ? (
        <Card><Empty>No income sources yet.</Empty></Card>
      ) : (
        <div className="grid">
          {income.data.map((src) => (
            <Card key={src.id}>
              <div className="row" style={{ paddingTop: 0 }}>
                <div className="main">
                  <div className="name">{src.name} <span className="badge neutral">{src.type}</span></div>
                  <div className="meta num">{money(src.tax.grossAnnual)}/yr gross · {FREQ_LABELS[src.payFrequency]}</div>
                </div>
                <div className="right">
                  <button className="iconbtn" onClick={() => { setEditing(src); setOpen(true) }}>✎</button>
                  <button className="iconbtn" onClick={() => remove.mutate(src.id)}>✕</button>
                </div>
              </div>

              <TaxBreakdownView src={src} />

              {src.distributions.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div className="stat-label" style={{ marginBottom: 4 }}>Distribution</div>
                  {src.distributions.map((d, i) => (
                    <div className="row" key={i} style={{ padding: '6px 4px' }}>
                      <span className="dim">{d.account?.name ?? 'Unassigned'}</span>
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
          accounts={accounts.data ?? []}
          saving={save.isPending}
          onClose={() => { setOpen(false); setEditing(null) }}
          onSubmit={(body) => save.mutate({ id: editing?.id, body })}
        />
      )}
    </div>
  )
}

function TaxBreakdownView({ src }: { src: IncomeSource }) {
  const t = src.tax
  const rows: [string, number][] = [
    ['Gross (annual)', t.grossAnnual],
    ['Federal', -t.federal],
    ['Social Security', -t.socialSecurity],
    ['Medicare', -t.medicare],
    ['State', -t.state],
    ['Pre-tax deductions', -t.preTaxDeductions],
    ['Post-tax deductions', -t.postTaxDeductions],
  ]
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
      <div className="stat-label" style={{ marginBottom: 4 }}>
        Tax breakdown <span className="badge neutral">{t.mode === 'BRACKET' ? 'Bracket' : 'Flat'}</span>
        {' '}<span className="dim num">{percent(t.effectiveRate * 100, 1)} effective</span>
      </div>
      {rows.filter(([, v]) => v !== 0).map(([label, v]) => (
        <div className="row" key={label} style={{ padding: '5px 4px' }}>
          <span className="dim">{label}</span>
          <span className={`num ${v < 0 ? 'neg' : ''}`}>{money(v)}</span>
        </div>
      ))}
      <div className="row" style={{ padding: '6px 4px' }}>
        <span>Net take-home</span>
        <span className="num pos">{money(t.netAnnual)}/yr · {money(t.netMonthly)}/mo</span>
      </div>
    </div>
  )
}

interface DeductionRow { name: string; amount: string; preTax: boolean; linkedAccountId: string }
interface DistRow { accountId: string; amount: string }

function IncomeModal({
  source, accounts, saving, onClose, onSubmit,
}: {
  source: IncomeSource | null
  accounts: Account[]
  saving: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const [name, setName] = useState(source?.name ?? '')
  const [type, setType] = useState<IncomeType>(source?.type ?? 'W2')
  const [grossAnnual, setGrossAnnual] = useState(source?.grossAnnual ?? '')
  const [grossPerPaycheck, setGrossPerPaycheck] = useState(source?.grossPerPaycheck ?? '')
  const [payFrequency, setPayFrequency] = useState<PayFrequency>(source?.payFrequency ?? 'BIWEEKLY')
  const [taxMode, setTaxMode] = useState<TaxMode>(source?.taxMode ?? 'FLAT')
  const [flatPct, setFlatPct] = useState(source?.flatEffectiveRate ? String(Number(source.flatEffectiveRate) * 100) : '')
  const [filingStatus, setFilingStatus] = useState<FilingStatus | ''>(source?.filingStatus ?? '')
  const [statePct, setStatePct] = useState(source?.stateRate ? String(Number(source.stateRate) * 100) : '')
  const [deductions, setDeductions] = useState<DeductionRow[]>(
    (source?.deductions ?? []).map((d: Deduction) => ({ name: d.name, amount: String(d.amount), preTax: d.preTax, linkedAccountId: d.linkedAccountId ?? '' })),
  )
  const [dists, setDists] = useState<DistRow[]>(
    (source?.distributions ?? []).map((d: Distribution) => ({ accountId: d.accountId ?? '', amount: String(d.amount) })),
  )

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      name, type, payFrequency, taxMode,
      grossAnnual: grossAnnual || undefined,
      grossPerPaycheck: grossPerPaycheck || undefined,
      flatEffectiveRate: taxMode === 'FLAT' && flatPct ? Number(flatPct) / 100 : undefined,
      filingStatus: filingStatus || undefined,
      stateRate: statePct ? Number(statePct) / 100 : undefined,
      deductions: deductions.filter((d) => d.name && d.amount).map((d) => ({
        name: d.name, amount: d.amount, preTax: d.preTax, linkedAccountId: d.linkedAccountId || undefined,
      })),
      distributions: dists.filter((d) => d.amount).map((d) => ({ accountId: d.accountId || undefined, amount: d.amount })),
    })
  }

  return (
    <Modal title={source ? 'Edit income source' : 'Add income source'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field-row">
          <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="Type">
            <select className="input" value={type} onChange={(e) => setType(e.target.value as IncomeType)}>
              <option value="W2">W-2</option><option value="SELF_1099">1099</option><option value="OTHER">Other</option>
            </select>
          </Field>
        </div>
        <div className="field-row">
          <Field label="Gross annual"><MoneyInput value={grossAnnual} onChange={setGrossAnnual} placeholder="or use per-paycheck" /></Field>
          <Field label="Gross / paycheck"><MoneyInput value={grossPerPaycheck} onChange={setGrossPerPaycheck} /></Field>
        </div>
        <Field label="Pay frequency">
          <select className="input" value={payFrequency} onChange={(e) => setPayFrequency(e.target.value as PayFrequency)}>
            {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>

        <div className="stat-label" style={{ margin: '8px 0 6px' }}>Tax estimation</div>
        <Field label="Mode">
          <select className="input" value={taxMode} onChange={(e) => setTaxMode(e.target.value as TaxMode)}>
            <option value="FLAT">Flat effective rate (quick)</option>
            <option value="BRACKET">Bracket-based (federal + FICA + state)</option>
          </select>
        </Field>
        {taxMode === 'FLAT' ? (
          <Field label="Effective tax rate %"><input className="input num" type="number" step="0.1" min="0" max="100" value={flatPct} onChange={(e) => setFlatPct(e.target.value)} /></Field>
        ) : (
          <div className="field-row">
            <Field label="Filing status">
              <select className="input" value={filingStatus} onChange={(e) => setFilingStatus(e.target.value as FilingStatus | '')}>
                <option value="">Use my default</option>
                <option value="SINGLE">Single</option>
                <option value="MARRIED_JOINT">Married filing jointly</option>
                <option value="MARRIED_SEPARATE">Married filing separately</option>
                <option value="HEAD_OF_HOUSEHOLD">Head of household</option>
              </select>
            </Field>
            <Field label="State rate %"><input className="input num" type="number" step="0.01" min="0" max="100" value={statePct} onChange={(e) => setStatePct(e.target.value)} /></Field>
          </div>
        )}

        <div className="stat-label" style={{ margin: '8px 0 6px' }}>Deductions (per paycheck)</div>
        {deductions.map((d, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <div className="field-row">
              <input className="input" placeholder="e.g. 401k" value={d.name} onChange={(e) => setDeductions(deductions.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <MoneyInput value={d.amount} onChange={(v) => setDeductions(deductions.map((x, j) => j === i ? { ...x, amount: v } : x))} placeholder="Amount" />
              <button type="button" className="iconbtn" onClick={() => setDeductions(deductions.filter((_, j) => j !== i))}>✕</button>
            </div>
            <div className="field-row" style={{ marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={d.preTax} onChange={(e) => setDeductions(deductions.map((x, j) => j === i ? { ...x, preTax: e.target.checked } : x))} /> Pre-tax
              </label>
              <select className="input" value={d.linkedAccountId} onChange={(e) => setDeductions(deductions.map((x, j) => j === i ? { ...x, linkedAccountId: e.target.value } : x))}>
                <option value="">Link account (optional)</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
        ))}
        <button type="button" className="btn ghost sm" onClick={() => setDeductions([...deductions, { name: '', amount: '', preTax: true, linkedAccountId: '' }])}>+ Add deduction</button>

        <div className="stat-label" style={{ margin: '14px 0 6px' }}>Distribution (where net pay goes)</div>
        {dists.map((d, i) => (
          <div className="field-row" key={i} style={{ marginBottom: 8 }}>
            <select className="input" value={d.accountId} onChange={(e) => setDists(dists.map((x, j) => j === i ? { ...x, accountId: e.target.value } : x))}>
              <option value="">Select account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <MoneyInput value={d.amount} onChange={(v) => setDists(dists.map((x, j) => j === i ? { ...x, amount: v } : x))} placeholder="Amount" />
            <button type="button" className="iconbtn" onClick={() => setDists(dists.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button type="button" className="btn ghost sm" onClick={() => setDists([...dists, { accountId: '', amount: '' }])}>+ Add destination</button>

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
