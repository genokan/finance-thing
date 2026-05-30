import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePlaidLink } from 'react-plaid-link'
import { api, ApiError } from '../api/client'
import type { FilingStatus, ManagedUser, Settings } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Card, Field, Loading, SectionHead } from '../components/ui'
import { dateLabel } from '../lib/format'

export function SettingsPage() {
  const qc = useQueryClient()
  const { logout } = useAuth()
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/api/settings') })

  const [rate, setRate] = useState('')
  const [filingStatus, setFilingStatus] = useState<FilingStatus | ''>('')
  const [statePct, setStatePct] = useState('')
  useEffect(() => {
    if (settings.data) {
      setRate(settings.data.benchmarkRate ?? '')
      setFilingStatus(settings.data.filingStatus ?? '')
      setStatePct(settings.data.stateRate != null ? String(Number(settings.data.stateRate) * 100) : '')
    }
  }, [settings.data])

  const save = useMutation({
    mutationFn: () =>
      api.put('/api/settings', {
        benchmarkRate: rate === '' ? undefined : rate,
        filingStatus: filingStatus || undefined,
        stateRate: statePct === '' ? undefined : Number(statePct) / 100,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['insights'] })
      qc.invalidateQueries({ queryKey: ['income'] })
    },
  })

  if (settings.isLoading) return <Loading />

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">{settings.data?.email}</p>

      <SectionHead title="Preferences" />
      <Card>
        <Field label="Benchmark APY %">
          <input className="input num" type="number" step="0.01" min="0" max="100" value={rate} onChange={(e) => setRate(e.target.value)} style={{ maxWidth: 220 }} />
        </Field>
        <p className="dim" style={{ fontSize: 13, margin: '-6px 0 14px' }}>
          Your best current safe return (e.g. HYSA APY). Used for debt opportunity-cost analysis.
        </p>

        <div className="field-row" style={{ maxWidth: 460 }}>
          <Field label="Tax filing status (default)">
            <select className="input" value={filingStatus} onChange={(e) => setFilingStatus(e.target.value as FilingStatus | '')}>
              <option value="">— not set —</option>
              <option value="SINGLE">Single</option>
              <option value="MARRIED_JOINT">Married filing jointly</option>
              <option value="MARRIED_SEPARATE">Married filing separately</option>
              <option value="HEAD_OF_HOUSEHOLD">Head of household</option>
            </select>
          </Field>
          <Field label="State tax rate %">
            <input className="input num" type="number" step="0.01" min="0" max="100" value={statePct} onChange={(e) => setStatePct(e.target.value)} />
          </Field>
        </div>
        <p className="dim" style={{ fontSize: 13, margin: '-6px 0 14px' }}>
          Defaults for bracket-based income tax estimates (each income source can override).
        </p>

        {save.isSuccess && <div className="dim">Saved.</div>}
        {save.isError && <div className="error-text">Could not save.</div>}
        <button className="btn" onClick={() => save.mutate()} disabled={save.isPending} style={{ marginTop: 4 }}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </Card>

      <SectionHead title="Linked accounts" />
      <PlaidSection />

      {settings.data?.isAdmin && <UsersSection />}

      <SectionHead title="Account" />
      <Card>
        <button className="btn ghost" onClick={() => logout()}>
          Sign out
        </button>
      </Card>
    </div>
  )
}

function PlaidSection() {
  const qc = useQueryClient()
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const exchange = useMutation({
    mutationFn: (vars: { publicToken: string; institutionName: string }) =>
      api.post('/api/plaid/exchange', vars),
    onSuccess: () => {
      setStatus('Account linked. Syncing balances…')
      sync.mutate()
    },
  })

  const sync = useMutation({
    mutationFn: () => api.post<{ synced: number; failed: string[] }>('/api/plaid/sync'),
    onSuccess: (r) => {
      setStatus(`Synced ${r.synced} account(s)${r.failed.length ? `, failed: ${r.failed.join(', ')}` : ''}.`)
      qc.invalidateQueries({ queryKey: ['investments'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: () => setStatus('Sync failed.'),
  })

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken, metadata) => {
      exchange.mutate({ publicToken, institutionName: metadata.institution?.name ?? 'Bank' })
    },
  })

  useEffect(() => {
    if (linkToken && ready) open()
  }, [linkToken, ready, open])

  async function startLink() {
    setStatus(null)
    try {
      const { linkToken: token } = await api.get<{ linkToken: string }>('/api/plaid/link-token')
      setLinkToken(token)
    } catch {
      setStatus('Could not start Plaid Link. Check Plaid credentials on the server.')
    }
  }

  return (
    <Card>
      <p className="page-sub" style={{ marginBottom: 14 }}>
        Connect a bank or brokerage via Plaid to auto-sync balances. Balances import as investment accounts.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" onClick={startLink} disabled={exchange.isPending}>
          + Connect account
        </button>
        <button className="btn ghost" onClick={() => sync.mutate()} disabled={sync.isPending}>
          {sync.isPending ? 'Syncing…' : 'Sync balances'}
        </button>
      </div>
      {status && <div className="dim" style={{ marginTop: 10 }}>{status}</div>}
    </Card>
  )
}

function UsersSection() {
  const qc = useQueryClient()
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<ManagedUser[]>('/api/users') })

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => api.post('/api/users', { email, password, isAdmin }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setEmail('')
      setPassword('')
      setIsAdmin(false)
      setError(null)
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not create user'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not delete user'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    create.mutate()
  }

  return (
    <>
      <SectionHead title="Users" />
      <Card>
        {users.isLoading ? (
          <div className="dim">Loading…</div>
        ) : (
          <div className="list">
            {(users.data ?? []).map((u) => (
              <div className="row" key={u.id}>
                <div className="main">
                  <div className="name">{u.email}</div>
                  <div className="meta">
                    {u.isAdmin ? <span className="badge warn">admin</span> : <span className="badge neutral">user</span>}{' '}
                    · added {dateLabel(u.createdAt)}
                  </div>
                </div>
                <div className="right">
                  <button className="iconbtn" title="Delete user" onClick={() => remove.mutate(u.id)}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <form className="card" style={{ marginTop: 14 }} onSubmit={submit}>
        <div className="stat-label" style={{ marginBottom: 12 }}>
          Add user
        </div>
        <div className="field-row">
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </Field>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
          <span>Grant admin access</span>
        </label>
        {error && <div className="error-text">{error}</div>}
        <button className="btn" type="submit" disabled={create.isPending}>
          {create.isPending ? 'Adding…' : 'Add user'}
        </button>
      </form>
    </>
  )
}
