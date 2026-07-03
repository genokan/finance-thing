import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../api/client'
import type { SnapshotListItem, SnapshotSeriesPoint } from '../api/types'
import { AmountCell, Card, Empty, Loading, SectionHead } from '../components/ui'
import { money, monthLabel } from '../lib/format'

const axisStyle = { fill: '#8888a0', fontSize: 12 }

export function History() {
  const list = useQuery({ queryKey: ['snapshots'], queryFn: () => api.get<SnapshotListItem[]>('/api/snapshots') })
  // One request for the whole chart — the server pre-aggregates each month.
  const series = useQuery({ queryKey: ['snapshot-series'], queryFn: () => api.get<SnapshotSeriesPoint[]>('/api/snapshots/series') })

  if (list.isLoading || series.isLoading) return <Loading />

  const ordered = list.data ?? []
  const points = (series.data ?? []).map((p) => ({ ...p, label: monthLabel(p.year, p.month) }))

  if (points.length < 2) {
    return (
      <div>
        <h1 className="page-title">History</h1>
        <p className="page-sub">Net worth and portfolio trends over time</p>
        <Card>
          <Empty>
            Record at least two monthly snapshots to see trends — the “Snapshot” button on the Overview page saves one,
            and each month is captured automatically once it ends.
            {points.length === 1 && <div className="num" style={{ marginTop: 8 }}>1 snapshot recorded so far.</div>}
          </Empty>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title">History</h1>
      <p className="page-sub">{points.length} monthly snapshots</p>

      <SectionHead title="Net worth" />
      <Card className="chart-card">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="#242432" vertical={false} />
            <XAxis dataKey="label" tick={axisStyle} stroke="#242432" />
            <YAxis tick={axisStyle} stroke="#242432" tickFormatter={(v) => money(v)} width={70} />
            <Tooltip
              contentStyle={{ background: '#17171f', border: '1px solid #242432', borderRadius: 8 }}
              formatter={(v: number) => money(v)}
              labelStyle={{ color: '#8888a0' }}
            />
            <Line type="monotone" dataKey="netWorth" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} name="Net worth" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <SectionHead title="Assets vs debt" />
      <Card className="chart-card">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="inv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="dbt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#242432" vertical={false} />
            <XAxis dataKey="label" tick={axisStyle} stroke="#242432" />
            <YAxis tick={axisStyle} stroke="#242432" tickFormatter={(v) => money(v)} width={70} />
            <Tooltip
              contentStyle={{ background: '#17171f', border: '1px solid #242432', borderRadius: 8 }}
              formatter={(v: number) => money(v)}
              labelStyle={{ color: '#8888a0' }}
            />
            <Area type="monotone" dataKey="assets" stroke="#10b981" fill="url(#inv)" strokeWidth={2} name="Assets" />
            <Area type="monotone" dataKey="debt" stroke="#f43f5e" fill="url(#dbt)" strokeWidth={2} name="Debt" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <SectionHead title="Snapshots" />
      <Card>
        <div className="list">
          {ordered.map((s) => (
            <div className="row" key={s.id}>
              <div className="name">{monthLabel(s.year, s.month)}</div>
              <AmountCell value={money(s.netWorth)} label="Net worth" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
