import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  const now = new Date()

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="hero">
            <div className="label">Liquid net worth</div>
            <div className={`value num ${d.liquidNetWorth >= 0 ? '' : 'neg'}`}>{money(d.liquidNetWorth)}</div>
            <div className="sub num">
              Total incl. unvested RSUs: <span className="accent">{money(d.totalNetWorth)}</span>
            </div>
          </div>
        </div>
        <button className="btn" onClick={() => record.mutate()} disabled={record.isPending}>
          {record.isPending ? 'Recording…' : `Record ${monthLabel(now.getFullYear(), now.getMonth() + 1)}`}
        </button>
      </div>

      {record.isSuccess && <div className="dim" style={{ marginBottom: 8 }}>Snapshot saved.</div>}
      {record.isError && <div className="error-text">Could not record snapshot.</div>}

      <div className="grid cols-3" style={{ marginTop: 16 }}>
        <Stat label="Net monthly income" value={money(d.netMonthlyIncome)} />
        <Stat label="Monthly outflow" value={money(d.totalExpenses)} />
        <Stat label="Monthly surplus" value={money(surplus)} tone={surplus >= 0 ? 'pos' : 'neg'} />
      </div>

      <div className="grid cols-3" style={{ marginTop: 14 }}>
        <Stat label="Liquid cash" value={money(d.liquidCash)} />
        <Stat label="Vested investments" value={money(d.vestedInvestments)} />
        <Stat label="Unvested RSUs" value={money(d.unvestedRSUs)} />
      </div>

      <SectionHead title="50 / 30 / 20" />
      <Card>
        <BudgetBar label="Needs (essential)" pct={d.fiftyThirtyTwenty.needsPercent} target={50} tone="accent" />
        <BudgetBar label="Wants (discretionary)" pct={d.fiftyThirtyTwenty.wantsPercent} target={30} tone="accent" />
        <BudgetBar label="Savings / surplus" pct={d.fiftyThirtyTwenty.savingsPercent} target={20} tone="pos" />
      </Card>

      {i && (
        <>
          <SectionHead title="Financial insights" />
          <div className="grid cols-2">
            <Card>
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
                {money(i.emergencyFund.liquidCash)} cash / {money(i.emergencyFund.monthlyEssentialExpenses)} essential
                per mo. Target 3–6 months.
              </div>
            </Card>

            <Card>
              <div className="stat-label">Benchmark safe rate</div>
              <div className="stat-value num accent">{percent(i.benchmarkRate, 2)}</div>
              <div className="dim" style={{ marginTop: 6, fontSize: 13 }}>
                Debt opportunity cost is measured against this rate. Set it in Settings.
              </div>
            </Card>
          </div>

          <SectionHead title="Debt opportunity cost" />
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
                        {p.daysRemaining} days left ({dateLabel(p.payoffDate)}). Rate jumps to {percent(p.promoApr, 2)}.
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
