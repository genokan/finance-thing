import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../api/client'
import type { Modifier, ProjectionResponse, Scenario, SnapshotListItem } from '../api/types'
import { Card, Empty, Field, Loading, Modal, MoneyInput, SectionHead, Stat } from '../components/ui'
import { money, monthLabel } from '../lib/format'

const axisStyle = { fill: '#8888a0', fontSize: 12 }
const HORIZONS = [
  { label: '5y', months: 60 },
  { label: '10y', months: 120 },
  { label: '20y', months: 240 },
  { label: '30y', months: 360 },
]
const SCENARIO_COLORS = ['#2fe0a6', '#3fd0e0', '#ff8fb0', '#c9a2ff', '#ffd166', '#7dd87d']
const BASELINE_COLOR = 'var(--accent)'
const WHATIF_COLOR = '#8b7bff'
const ACTUAL_COLOR = '#9a9bb4'

const compact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })

interface Knobs {
  horizonMonths: number
  savingsRatePct: number
  investmentReturnPct: number
}

export function Future() {
  const qc = useQueryClient()
  const [knobs, setKnobs] = useState<Knobs>({ horizonMonths: 120, savingsRatePct: 50, investmentReturnPct: 7 })
  const [debounced, setDebounced] = useState(knobs)
  const [modifiers, setModifiers] = useState<Modifier[]>([])
  const [activeIds, setActiveIds] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)

  // Sliders fire per-pixel; give the API a beat to breathe.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(knobs), 300)
    return () => clearTimeout(t)
  }, [knobs])

  const scenarios = useQuery({ queryKey: ['scenarios'], queryFn: () => api.get<Scenario[]>('/api/scenarios') })
  const snapshots = useQuery({ queryKey: ['snapshots'], queryFn: () => api.get<SnapshotListItem[]>('/api/snapshots') })

  const projection = useQuery({
    queryKey: ['projection', debounced, modifiers, activeIds],
    queryFn: () => api.post<ProjectionResponse>('/api/projections', { ...debounced, modifiers, scenarioIds: activeIds }),
    placeholderData: keepPreviousData,
  })

  const saveScenario = useMutation({
    mutationFn: (body: { name: string; notes?: string; modifiers: Modifier[] }) => api.post<Scenario>('/api/scenarios', body),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['scenarios'] })
      setModifiers([])
      setActiveIds((ids) => [...ids, created.id])
      setSaving(false)
    },
  })

  const deleteScenario = useMutation({
    mutationFn: (id: string) => api.del(`/api/scenarios/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['scenarios'] })
      setActiveIds((ids) => ids.filter((x) => x !== id))
    },
  })

  const p = projection.data

  // One row per month offset; snapshots land at x ≤ 0, projections at x ≥ 0.
  const rows = useMemo(() => {
    if (!p) return []
    const byX = new Map<number, Record<string, number>>()
    const row = (x: number) => {
      let r = byX.get(x)
      if (!r) {
        r = { x }
        byX.set(x, r)
      }
      return r
    }
    for (const s of snapshots.data ?? []) {
      const x = (s.year - p.startYear) * 12 + (s.month - p.startMonth)
      if (x <= 0) row(x).actual = Number(s.netWorth)
    }
    for (const pt of p.baseline.points) row(pt.month).baseline = pt.netWorth
    for (const pt of p.whatIf?.points ?? []) row(pt.month).whatIf = pt.netWorth
    for (const s of p.scenarios) for (const pt of s.points) row(pt.month)[`s_${s.id}`] = pt.netWorth
    return [...byX.values()].sort((a, b) => a.x! - b.x!)
  }, [p, snapshots.data])

  if (projection.isLoading && !p) return <Loading />
  if (projection.isError || !p) return <div className="empty">Failed to load projection.</div>

  const fmtMonth = (m: number) => {
    const total = p.startYear * 12 + (p.startMonth - 1) + m
    return monthLabel(Math.floor(total / 12), (total % 12) + 1)
  }

  const primary = p.whatIf ?? p.baseline
  const atMonth = (months: number) => primary.points.find((pt) => pt.month === Math.min(months, p.assumptions.horizonMonths))?.netWorth
  const horizonBase = p.baseline.points[p.baseline.points.length - 1]?.netWorth ?? 0
  const horizonPrimary = primary.points[primary.points.length - 1]?.netWorth ?? 0
  const delta = horizonPrimary - horizonBase
  const activeScenarioMeta = p.scenarios.map((s, idx) => ({ ...s, color: SCENARIO_COLORS[idx % SCENARIO_COLORS.length]! }))

  return (
    <div>
      <h1 className="page-title">Future</h1>
      <p className="page-sub">
        Where you're headed on today's numbers — and what changes if you change something.
      </p>

      <div className="grid cols-4">
        <Stat label="Net worth in 5 years" value={money(atMonth(60))} sub={p.whatIf ? 'with what-ifs' : 'baseline'} />
        <Stat
          label={`At horizon (${fmtMonth(p.assumptions.horizonMonths)})`}
          value={money(horizonPrimary)}
          sub={p.whatIf ? 'with what-ifs' : 'baseline'}
        />
        <Stat
          label="Debt-free"
          value={primary.debtFreeMonth != null ? fmtMonth(primary.debtFreeMonth) : '—'}
          sub={
            primary.debtFreeMonth != null
              ? `${Math.ceil((primary.debtFreeMonth / 12) * 10) / 10} years out`
              : (primary.points[primary.points.length - 1]?.debt ?? 0) > 0
                ? 'not within horizon'
                : 'no active debt'
          }
        />
        <Stat
          label="What-ifs change the ending by"
          value={p.whatIf ? money(delta) : '—'}
          tone={p.whatIf ? (delta >= 0 ? 'pos' : 'neg') : undefined}
          sub={p.whatIf ? 'vs baseline at horizon' : 'add a what-if below'}
        />
      </div>

      <SectionHead
        title="Net worth trajectory"
        action={
          <span className="dim" style={{ fontSize: 13 }}>
            {money(p.netMonthlyIncome)}/mo net income · {money(p.monthlyExpenses)}/mo expenses
          </span>
        }
      />
      <Card className="chart-card">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="#242432" vertical={false} />
            <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tick={axisStyle} stroke="#242432" tickFormatter={fmtMonth} />
            <YAxis tick={axisStyle} stroke="#242432" tickFormatter={(v) => compact.format(v)} width={70} />
            <Tooltip
              contentStyle={{ background: '#17171f', border: '1px solid #242432', borderRadius: 8 }}
              formatter={(v: number) => money(v)}
              labelFormatter={(x: number) => (x <= 0 ? `${fmtMonth(x)} (recorded)` : fmtMonth(x))}
              labelStyle={{ color: '#8888a0' }}
            />
            <ReferenceLine x={0} stroke="#8888a0" strokeDasharray="4 4" label={{ value: 'now', fill: '#8888a0', fontSize: 11, position: 'insideTopLeft' }} />
            <Line type="monotone" dataKey="actual" stroke={ACTUAL_COLOR} strokeWidth={2} dot={{ r: 2.5 }} name="Recorded" connectNulls />
            <Line type="monotone" dataKey="baseline" stroke={BASELINE_COLOR} strokeWidth={2.5} dot={false} name="Baseline" />
            {p.whatIf && <Line type="monotone" dataKey="whatIf" stroke={WHATIF_COLOR} strokeWidth={2.5} dot={false} name="With what-ifs" />}
            {activeScenarioMeta.map((s) => (
              <Line key={s.id} type="monotone" dataKey={`s_${s.id}`} stroke={s.color} strokeWidth={2} dot={false} name={s.name} />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <div className="legend" style={{ marginTop: 10 }}>
          <span><span className="dot" style={{ background: ACTUAL_COLOR }} />Recorded</span>
          <span><span className="dot" style={{ background: 'var(--accent)' }} />Baseline</span>
          {p.whatIf && <span><span className="dot" style={{ background: WHATIF_COLOR }} />With what-ifs</span>}
          {activeScenarioMeta.map((s) => (
            <span key={s.id}><span className="dot" style={{ background: s.color }} />{s.name}</span>
          ))}
        </div>
        <div className="dim" style={{ fontSize: 12, marginTop: 10 }}>
          Fixed rates, nominal dollars, flat income &amp; expenses, no tax on gains, unvested RSUs excluded.
        </div>
      </Card>

      <SectionHead title="Assumptions" />
      <Card>
        <div className="knob-row">
          <div className="knob" style={{ flex: 'none' }}>
            <div className="lbl"><span>Horizon</span></div>
            <div className="seg">
              {HORIZONS.map((h) => (
                <button
                  type="button"
                  key={h.months}
                  className={`seg-btn ${knobs.horizonMonths === h.months ? 'active' : ''}`}
                  onClick={() => setKnobs((k) => ({ ...k, horizonMonths: h.months }))}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>
          <div className="knob">
            <div className="lbl">
              <span>Investment return</span>
              <span className="val num">{knobs.investmentReturnPct.toFixed(1)}%/yr</span>
            </div>
            <input
              type="range" className="slider" min={0} max={12} step={0.5}
              value={knobs.investmentReturnPct}
              onChange={(e) => setKnobs((k) => ({ ...k, investmentReturnPct: Number(e.target.value) }))}
            />
          </div>
          <div className="knob">
            <div className="lbl">
              <span>Unallocated income saved</span>
              <span className="val num">{knobs.savingsRatePct}%</span>
            </div>
            <input
              type="range" className="slider" min={0} max={100} step={5}
              value={knobs.savingsRatePct}
              onChange={(e) => setKnobs((k) => ({ ...k, savingsRatePct: Number(e.target.value) }))}
            />
          </div>
        </div>
      </Card>

      <SectionHead
        title="What-ifs"
        action={
          <span style={{ display: 'flex', gap: 8 }}>
            {modifiers.length > 0 && (
              <button className="btn ghost sm" onClick={() => setSaving(true)}>Save as scenario</button>
            )}
            <button className="btn sm" onClick={() => setAdding(true)}>+ Add what-if</button>
          </span>
        }
      />
      <Card>
        {modifiers.length === 0 ? (
          <Empty>
            Try one: a windfall, a rental property, an extra $500/mo invested — and watch the line move.
          </Empty>
        ) : (
          <div className="chips">
            {modifiers.map((m, i) => (
              <span className="chip active" style={{ color: WHATIF_COLOR }} key={i}>
                <span style={{ color: 'var(--text)' }}>{describeModifier(m, fmtMonth)}</span>
                <button
                  className="x" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                  onClick={() => setModifiers((ms) => ms.filter((_, j) => j !== i))}
                  aria-label="Remove"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {(p.whatIf ?? p.baseline).debtPayoffs.length > 0 && (
          <div className="dim num" style={{ fontSize: 13, marginTop: 14 }}>
            {(p.whatIf ?? p.baseline).debtPayoffs.map((d) => `${d.name} paid off ${fmtMonth(d.month)}`).join(' · ')}
          </div>
        )}
      </Card>

      <SectionHead title="Saved scenarios" />
      <Card>
        {(scenarios.data ?? []).length === 0 ? (
          <Empty>Build a set of what-ifs above and save it — scenarios overlay the chart for side-by-side comparison.</Empty>
        ) : (
          <div className="chips">
            {(scenarios.data ?? []).map((s) => {
              const active = activeIds.includes(s.id)
              const color = active ? activeScenarioMeta.find((m) => m.id === s.id)?.color : undefined
              return (
                <span
                  key={s.id}
                  className={`chip ${active ? 'active' : ''}`}
                  style={color ? { color } : undefined}
                  onClick={() => setActiveIds((ids) => (active ? ids.filter((x) => x !== s.id) : [...ids, s.id]))}
                  role="button"
                >
                  {color && <span className="swatch" style={{ background: color }} />}
                  <span style={{ color: active ? 'var(--text)' : undefined }}>{s.name}</span>
                  <span className="dim num">({s.modifiers.length})</span>
                  <button
                    className="x" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                    onClick={(e) => { e.stopPropagation(); deleteScenario.mutate(s.id) }}
                    aria-label={`Delete ${s.name}`}
                  >
                    ×
                  </button>
                </span>
              )
            })}
          </div>
        )}
        {deleteScenario.isError && <div className="error-text">Could not delete scenario.</div>}
      </Card>

      {adding && <ModifierModal onClose={() => setAdding(false)} onAdd={(m) => { setModifiers((ms) => [...ms, m]); setAdding(false) }} />}
      {saving && (
        <SaveScenarioModal
          onClose={() => setSaving(false)}
          pending={saveScenario.isPending}
          error={saveScenario.isError}
          onSave={(name, notes) => saveScenario.mutate({ name, notes: notes || undefined, modifiers })}
        />
      )}
    </div>
  )
}

function describeModifier(m: Modifier, fmtMonth: (x: number) => string): string {
  if (m.type === 'ONE_TIME') {
    const dir = m.amount >= 0 ? 'windfall' : 'expense'
    return `${m.label || dir} ${money(Math.abs(m.amount))} · ${fmtMonth(m.month)}`
  }
  if (m.type === 'RECURRING') {
    if (m.annualReturnPct != null) return `${m.label || 'invest'} ${money(m.monthlyAmount)}/mo @ ${m.annualReturnPct}%`
    return `${m.label || (m.monthlyAmount >= 0 ? 'extra income' : 'extra spending')} ${money(Math.abs(m.monthlyAmount))}/mo`
  }
  const fin = m.downPayment != null && m.downPayment < m.cost ? `, ${money(m.downPayment)} down` : ''
  return `${m.label || 'asset'} ${money(m.cost)}${fin} @ ${m.annualReturnPct}%`
}

type ModifierKind = 'ONE_TIME' | 'RECURRING' | 'NEW_ASSET'
const KIND_TABS: { value: ModifierKind; label: string }[] = [
  { value: 'ONE_TIME', label: 'One-time' },
  { value: 'RECURRING', label: 'Recurring' },
  { value: 'NEW_ASSET', label: 'Buy an asset' },
]

function ModifierModal({ onClose, onAdd }: { onClose: () => void; onAdd: (m: Modifier) => void }) {
  const [kind, setKind] = useState<ModifierKind>('ONE_TIME')
  const [label, setLabel] = useState('')
  const [month, setMonth] = useState('1')
  const [amount, setAmount] = useState('')
  const [direction, setDirection] = useState<'in' | 'out'>('out')
  // Recurring
  const [flavor, setFlavor] = useState<'invest' | 'income' | 'spending'>('invest')
  const [returnPct, setReturnPct] = useState('7')
  const [endMonth, setEndMonth] = useState('')
  // New asset
  const [cost, setCost] = useState('')
  const [down, setDown] = useState('')
  const [apr, setApr] = useState('6.5')
  const [term, setTerm] = useState('360')
  const [cashFlow, setCashFlow] = useState('')
  const [appreciation, setAppreciation] = useState('3')

  const now = new Date()
  const preview = (mStr: string) => {
    const m = Number(mStr)
    if (!Number.isFinite(m) || m < 1) return ''
    const total = now.getFullYear() * 12 + now.getMonth() + m
    return monthLabel(Math.floor(total / 12), (total % 12) + 1)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const m = Math.max(1, Math.round(Number(month) || 1))
    const lbl = label.trim() || undefined
    if (kind === 'ONE_TIME') {
      const a = Number(amount)
      if (!a || a <= 0) return
      onAdd({ type: 'ONE_TIME', month: m, amount: direction === 'in' ? a : -a, label: lbl })
    } else if (kind === 'RECURRING') {
      const a = Number(amount)
      if (!a || a <= 0) return
      const end = endMonth ? Math.max(m, Math.round(Number(endMonth))) : null
      if (flavor === 'invest') {
        onAdd({ type: 'RECURRING', startMonth: m, endMonth: end, monthlyAmount: a, annualReturnPct: Number(returnPct) || 0, label: lbl })
      } else {
        onAdd({ type: 'RECURRING', startMonth: m, endMonth: end, monthlyAmount: flavor === 'income' ? a : -a, label: lbl })
      }
    } else {
      const c = Number(cost)
      if (!c || c <= 0) return
      const d = down === '' ? null : Math.min(Number(down), c)
      const financed = d != null && d < c
      onAdd({
        type: 'NEW_ASSET',
        month: m,
        cost: c,
        annualReturnPct: Number(appreciation) || 0,
        downPayment: d,
        financeAprPct: financed ? Number(apr) || 0 : null,
        financeTermMonths: financed ? Math.max(1, Math.round(Number(term) || 360)) : null,
        monthlyCashFlow: cashFlow === '' ? null : Number(cashFlow),
        label: lbl,
      })
    }
  }

  return (
    <Modal title="Add a what-if" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="seg" style={{ marginBottom: 14 }}>
          {KIND_TABS.map((t) => (
            <button type="button" key={t.value} className={`seg-btn ${kind === t.value ? 'active' : ''}`} onClick={() => setKind(t.value)}>
              {t.label}
            </button>
          ))}
        </div>

        <Field label="Label (optional)">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind === 'NEW_ASSET' ? 'Rental property' : kind === 'RECURRING' ? 'Extra brokerage' : 'New roof'} />
        </Field>

        <Field label={`${kind === 'RECURRING' ? 'Starts' : 'When'} — months from now${preview(month) ? ` (${preview(month)})` : ''}`}>
          <input className="input num" type="number" min={1} max={480} value={month} onChange={(e) => setMonth(e.target.value)} required />
        </Field>

        {kind === 'ONE_TIME' && (
          <>
            <Field label="Direction">
              <div className="seg">
                <button type="button" className={`seg-btn ${direction === 'out' ? 'active' : ''}`} onClick={() => setDirection('out')}>Expense</button>
                <button type="button" className={`seg-btn ${direction === 'in' ? 'active' : ''}`} onClick={() => setDirection('in')}>Windfall</button>
              </div>
            </Field>
            <Field label="Amount">
              <MoneyInput value={amount} onChange={setAmount} required />
            </Field>
          </>
        )}

        {kind === 'RECURRING' && (
          <>
            <Field label="What kind of flow?">
              <div className="seg">
                <button type="button" className={`seg-btn ${flavor === 'invest' ? 'active' : ''}`} onClick={() => setFlavor('invest')}>Invested</button>
                <button type="button" className={`seg-btn ${flavor === 'income' ? 'active' : ''}`} onClick={() => setFlavor('income')}>Extra income</button>
                <button type="button" className={`seg-btn ${flavor === 'spending' ? 'active' : ''}`} onClick={() => setFlavor('spending')}>Extra spending</button>
              </div>
            </Field>
            <Field label="Amount per month">
              <MoneyInput value={amount} onChange={setAmount} required />
            </Field>
            {flavor === 'invest' && (
              <Field label="Grows at (%/yr)">
                <input className="input num" type="number" step="0.5" min={-50} max={100} value={returnPct} onChange={(e) => setReturnPct(e.target.value)} required />
              </Field>
            )}
            <Field label={`Ends — months from now (optional${endMonth && preview(endMonth) ? `, ${preview(endMonth)}` : ''})`}>
              <input className="input num" type="number" min={1} max={480} value={endMonth} onChange={(e) => setEndMonth(e.target.value)} placeholder="never" />
            </Field>
          </>
        )}

        {kind === 'NEW_ASSET' && (
          <>
            <Field label="Purchase price">
              <MoneyInput value={cost} onChange={setCost} required />
            </Field>
            <Field label="Down payment (blank = pay in full)">
              <MoneyInput value={down} onChange={setDown} placeholder="full price" />
            </Field>
            {down !== '' && Number(down) < Number(cost || 0) && (
              <div className="field-row">
                <Field label="Loan APR (%)">
                  <input className="input num" type="number" step="0.1" min={0} value={apr} onChange={(e) => setApr(e.target.value)} />
                </Field>
                <Field label="Term (months)">
                  <input className="input num" type="number" min={1} max={600} value={term} onChange={(e) => setTerm(e.target.value)} />
                </Field>
              </div>
            )}
            <Field label="Appreciation / return (%/yr)">
              <input className="input num" type="number" step="0.5" min={-50} max={100} value={appreciation} onChange={(e) => setAppreciation(e.target.value)} required />
            </Field>
            <Field label="Monthly cash flow it produces (optional, e.g. net rent)">
              <MoneyInput value={cashFlow} onChange={setCashFlow} min="" placeholder="0" />
            </Field>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn">Add</button>
        </div>
      </form>
    </Modal>
  )
}

function SaveScenarioModal({
  onClose,
  onSave,
  pending,
  error,
}: {
  onClose: () => void
  onSave: (name: string, notes: string) => void
  pending: boolean
  error: boolean
}) {
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  return (
    <Modal title="Save scenario" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onSave(name.trim(), notes.trim())
        }}
      >
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Buy rental in 2028" required autoFocus />
        </Field>
        <Field label="Notes (optional)">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <div className="error-text">Could not save scenario.</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
