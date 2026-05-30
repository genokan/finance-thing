import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
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
import type { SnapshotListItem } from '../api/types'
import { Card, Empty, Loading, SectionHead } from '../components/ui'
import { money, monthLabel } from '../lib/format'

interface SnapshotDetail {
  year: number
  month: number
  netWorth: string
  accounts: { value: string }[]
  debts: { principal: string }[]
}

const axisStyle = { fill: '#8888a0', fontSize: 12 }

export function History() {
  const list = useQuery({ queryKey: ['snapshots'], queryFn: () => api.get<SnapshotListItem[]>('/api/snapshots') })

  // Oldest → newest for charting.
  const ordered = useMemo(
    () => [...(list.data ?? [])].sort((a, b) => a.year - b.year || a.month - b.month),
    [list.data],
  )

  const details = useQueries({
    queries: ordered.map((s) => ({
      queryKey: ['snapshot', s.year, s.month],
      queryFn: () => api.get<SnapshotDetail>(`/api/snapshots/${s.year}/${s.month}`),
    })),
  })

  const series = useMemo(() => {
    return details
      .map((d) => d.data)
      .filter((d): d is SnapshotDetail => !!d)
      .map((d) => ({
        label: monthLabel(d.year, d.month),
        netWorth: Number(d.netWorth),
        investments: d.accounts.reduce((s, a) => s + Number(a.value), 0),
        debt: d.debts.reduce((s, x) => s + Number(x.principal), 0),
      }))
  }, [details])

  if (list.isLoading) return <Loading />

  if (ordered.length < 2) {
    return (
      <div>
        <h1 className="page-title">History</h1>
        <p className="page-sub">Net worth and portfolio trends over time</p>
        <Card>
          <Empty>
            Record at least two monthly snapshots to see trends. Use “Record this month” on the dashboard.
            {ordered.length === 1 && <div className="num" style={{ marginTop: 8 }}>1 snapshot recorded so far.</div>}
          </Empty>
        </Card>
      </div>
    )
  }

  const loadingDetails = details.some((d) => d.isLoading)

  return (
    <div>
      <h1 className="page-title">History</h1>
      <p className="page-sub">{ordered.length} monthly snapshots</p>

      {loadingDetails ? (
        <Loading />
      ) : (
        <>
          <SectionHead title="Net worth" />
          <Card className="chart-card">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
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

          <SectionHead title="Investments vs debt" />
          <Card className="chart-card">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
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
                <Area type="monotone" dataKey="investments" stroke="#10b981" fill="url(#inv)" strokeWidth={2} name="Investments" />
                <Area type="monotone" dataKey="debt" stroke="#f43f5e" fill="url(#dbt)" strokeWidth={2} name="Debt" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}

      <SectionHead title="Snapshots" />
      <Card>
        <div className="list">
          {[...ordered].reverse().map((s) => (
            <div className="row" key={s.id}>
              <div className="name">{monthLabel(s.year, s.month)}</div>
              <div className="amt num">{money(s.netWorth)}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
