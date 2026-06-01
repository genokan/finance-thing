import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Dashboard as DashboardData, Insights } from '../api/types'
import { Bar, Card, Loading, SectionHead, Stat } from '../components/ui'
import { money, percent, monthLabel, dateLabel } from '../lib/format'

function recordCurrentMonth() {
  const now = new Date()
  return api.post('/api/snapshots', { year: now.getFullYear(), month: now.getMonth() + 1 })
}

const VERDICT_META = {
  PAY_OFF: { badge: 'bad', label: 'Pay off', icon: '🔴' },
  BALANCED: { badge: 'neutral', label: 'Balanced', icon: '⚖️' },
  KEEP: { badge: 'good', label: 'Keep', icon: '🟢' },
} as const

export function Dashboard() {
  const qc = useQueryClient()
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardData>('/api/dashboard') })
  const insights = useQuery({ queryKey: ['insights'], queryFn: () => api.get<Insights>('/api/insights') })

  const record = useMutation({
    mutationFn: recordCurrentMonth,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['snapshots'] })
    },
  })

  if (dash.isLoading || insights.isLoading) return <Loading />
  if (dash.isError || !dash.data) return <div className="empty">Failed to load dashboard.</div>

  const d = dash.data
  const i = insights.data
  const surplus = d.netMonthlyIncome - d.totalExpenses
  const savingsRate = d.netMonthlyIncome > 0 ? (surplus / d.netMonthlyIncome) * 100 : 0
  const now = new Date()

  return (
    <div>
      <div className="topbar">
        <div className="hero">
          <div className="label">Liquid net worth</div>
          <div className={`value num ${d.liquidNetWorth >= 0 ? '' : 'neg'}`}>{money(d.liquidNetWorth)}</div>
          <div className="sub num">
            Total incl. unvested RSUs: <span className="accent">{money(d.totalNetWorth)}</span>
          </div>
        </div>
        <button className="btn ghost" onClick={() => record.mutate()} disabled={record.isPending}>
          {record.isPending ? 'Recording…' : `Snapshot ${monthLabel(now.getFullYear(), now.getMonth() + 1)}`}
        </button>
      </div>

      {record.isSuccess && <div className="dim" style={{ marginBottom: 8 }}>Snapshot saved to History.</div>}
      {record.isError && <div className="error-text">Could not record snapshot.</div>}

      {/* Monthly cash flow — the CSV's "Net Income / Expenses / Savings" summary */}
      <SectionHead title="Monthly cash flow" />
      <div className="grid cols-4">
        <Stat label="Net income" value={money(d.netMonthlyIncome)} sub="after taxes / month" to="/income" />
        <Stat label="Outflow" value={money(d.totalExpenses)} sub="recurring expenses" to="/expenses" />
        <Stat
          label="Surplus"
          value={money(surplus)}
          tone={surplus >= 0 ? 'pos' : 'neg'}
          sub={`${percent(savingsRate)} of income`}
          to="/budgets"
        />
        <Stat label="Total debt" value={money(d.totalDebt)} tone={d.totalDebt > 0 ? 'neg' : undefined} sub="balances owed" to="/debt" />
      </div>

      {/* Net-worth composition — the CSV's "Cash Total / Investment Total" buckets */}
      <SectionHead title="Net worth breakdown" />
      <div className="grid cols-4">
        <Stat label="Liquid cash" value={money(d.liquidCash)} sub="checking / savings" to="/accounts" />
        <Stat label="Vested investments" value={money(d.vestedInvestments)} sub="brokerage / retirement" to="/investments" />
        <Stat label="Unvested RSUs" value={money(d.unvestedRSUs)} sub="not yet vested" to="/investments" />
        <Stat label="Debt" value={money(-d.totalDebt)} tone={d.totalDebt > 0 ? 'neg' : undefined} sub="reduces net worth" to="/debt" />
      </div>

      {/* 50/30/20 — needs / wants / savings, with dollar amounts */}
      <SectionHead title="50 / 30 / 20 budget" action={<Link to="/budgets" className="dim" style={{ fontSize: 13 }}>Manage →</Link>} />
      <Card>
        <BudgetSplit
          needs={d.essentialExpenses}
          wants={d.discretionaryExpenses}
          savings={Math.max(0, surplus)}
          ftt={d.fiftyThirtyTwenty}
        />
      </Card>

      {i && (
        <>
          <SectionHead title="Financial insights" />
          <div className="grid cols-2">
            <Link to="/accounts" className="card stat-card clickable">
              <div className="stat-label">Emergency fund</div>
              <div className="stat-value num">
                {i.emergencyFund.monthsCovered.toFixed(1)} mo{' '}
                <span
                  className={`badge ${
                    i.emergencyFund.status === 'ADEQUATE' ? 'good' : i.emergencyFund.status === 'MINIMUM' ? 'warn' : 'bad'
                  }`}
                >
                  {i.emergencyFund.status}
                </span>
              </div>
              <div className="dim num" style={{ marginTop: 6, fontSize: 13 }}>
                {money(i.emergencyFund.liquidCash)} {i.emergencyFund.designated ? 'in your emergency fund' : 'liquid cash'} /{' '}
                {money(i.emergencyFund.monthlyEssentialExpenses)} essential per mo. Target 3–6 months.
              </div>
              <span className="stat-arrow">→</span>
            </Link>

            <Link to="/settings" className="card stat-card clickable">
              <div className="stat-label">Benchmark safe rate</div>
              <div className="stat-value num accent">{percent(i.benchmarkRate, 2)}</div>
              <div className="dim" style={{ marginTop: 6, fontSize: 13 }}>
                Debt opportunity cost is measured against this rate. Click to adjust in Settings.
              </div>
              <span className="stat-arrow">→</span>
            </Link>
          </div>

          <SectionHead title="Debt opportunity cost" action={<Link to="/debt" className="dim" style={{ fontSize: 13 }}>View debts →</Link>} />
          <Card>
            {i.debtAnalysis.length === 0 ? (
              <div className="dim">No active debts to analyze.</div>
            ) : (
              i.debtAnalysis.map((da) => {
                const m = VERDICT_META[da.verdict]
                return (
                  <div className="insight" key={da.id}>
                    <span className="ico">{m.icon}</span>
                    <div className="body">
                      <div className="t">
                        {da.name} <span className={`badge ${m.badge}`}>{m.label}</span>
                      </div>
                      <div className="d num">
                        APR {percent(da.apr, 2)} vs benchmark {percent(da.benchmark, 2)} —{' '}
                        {da.opportunityCostPercent > 0
                          ? `costs ${percent(da.opportunityCostPercent, 2)} more than you can safely earn`
                          : `you're ahead by ${percent(Math.abs(da.opportunityCostPercent), 2)} keeping it`}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </Card>

          {(i.promoAlerts.length > 0 || i.highAprDebts.length > 0) && (
            <>
              <SectionHead title="Action items" />
              <Card>
                {i.highAprDebts.map((h) => (
                  <div className="insight" key={`apr-${h.id}`}>
                    <span className="ico">⚠️</span>
                    <div className="body">
                      <div className="t">High-interest debt: {h.name}</div>
                      <div className="d num">
                        {percent(h.apr, 2)} APR on {money(h.principal)} — prioritize payoff.
                      </div>
                    </div>
                  </div>
                ))}
                {i.promoAlerts.map((p) => (
                  <div className="insight" key={`promo-${p.id}`}>
                    <span className="ico">⏳</span>
                    <div className="body">
                      <div className="t">0% promo ending: {p.name}</div>
                      <div className="d num">
                        {p.daysRemaining} days left ({dateLabel(p.promoEndsAt)}). Rate jumps to {percent(p.postPromoApr, 2)}.
                      </div>
                    </div>
                  </div>
                ))}
              </Card>
            </>
          )}
        </>
      )}

      {d.upcomingAlerts.length > 0 && (
        <>
          <SectionHead title="Upcoming renewals & expirations" />
          <Card>
            {d.upcomingAlerts.map((a) => (
              <div className="row" key={a.id}>
                <div className="main">
                  <div className="name">{a.name}</div>
                  <div className="meta">
                    {a.renewsAt ? `Renews ${dateLabel(a.renewsAt)}` : ''}
                    {a.expiresAt ? `${a.renewsAt ? ' · ' : ''}Expires ${dateLabel(a.expiresAt)}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}

function BudgetSplit({
  needs,
  wants,
  savings,
  ftt,
}: {
  needs: number
  wants: number
  savings: number
  ftt: { needsPercent: number; wantsPercent: number; savingsPercent: number }
}) {
  const total = needs + wants + savings || 1
  const w = (n: number) => `${Math.max(0, (n / total) * 100)}%`
  return (
    <div>
      <div className="meter">
        <span style={{ width: w(needs), background: 'linear-gradient(90deg, var(--accent-dim), var(--accent))' }} />
        <span style={{ width: w(wants), background: 'linear-gradient(90deg, var(--indigo), #9d90ff)' }} />
        <span style={{ width: w(savings), background: 'linear-gradient(90deg, #1f9e76, var(--positive))' }} />
      </div>
      <div className="legend" style={{ marginBottom: 18 }}>
        <span><span className="dot" style={{ background: 'var(--accent)' }} />Needs {money(needs)}</span>
        <span><span className="dot" style={{ background: 'var(--indigo)' }} />Wants {money(wants)}</span>
        <span><span className="dot" style={{ background: 'var(--positive)' }} />Savings {money(savings)}</span>
      </div>

      <BudgetBar label="Needs (essential)" pct={ftt.needsPercent} target={50} tone="accent" />
      <BudgetBar label="Wants (discretionary)" pct={ftt.wantsPercent} target={30} tone="accent" />
      <BudgetBar label="Savings / surplus" pct={ftt.savingsPercent} target={20} tone="pos" />
    </div>
  )
}

function BudgetBar({ label, pct, target, tone }: { label: string; pct: number; target: number; tone: string }) {
  return (
    <div className="bar-row">
      <div className="lbl">
        <span>{label}</span>
        <span className="num dim">
          {percent(pct)} <span style={{ opacity: 0.6 }}>/ {target}%</span>
        </span>
      </div>
      <Bar pct={(pct / target) * 100} tone={tone} />
    </div>
  )
}
