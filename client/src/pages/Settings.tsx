import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePlaidLink } from 'react-plaid-link'
import { api } from '../api/client'
import type { Settings } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Card, Field, Loading, SectionHead } from '../components/ui'

export function SettingsPage() {
  const qc = useQueryClient()
  const { logout } = useAuth()
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/api/settings') })

  const [rate, setRate] = useState('')
  useEffect(() => {
    if (settings.data) setRate(settings.data.benchmarkRate ?? '')
  }, [settings.data])

  const save = useMutation({
    mutationFn: () => api.put('/api/settings', { benchmarkRate: rate === '' ? undefined : rate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['insights'] })
    },
  })

  if (settings.isLoading) return <Loading />

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">{settings.data?.email}</p>

      <SectionHead title="Benchmark rate" />
      <Card>
        <p className="page-sub" style={{ marginBottom: 14 }}>
          Your best current safe return (e.g. high-yield savings APY). Debt opportunity-cost analysis is measured
          against this rate.
        </p>
        <Field label="Benchmark APY %">
          <input
            className="input num"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            style={{ maxWidth: 200 }}
          />
        </Field>
        {save.isSuccess && <div className="dim">Saved.</div>}
        {save.isError && <div className="error-text">Could not save.</div>}
        <button className="btn" onClick={() => save.mutate()} disabled={save.isPending} style={{ marginTop: 8 }}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </Card>

      <SectionHead title="Linked accounts" />
      <PlaidSection />

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
