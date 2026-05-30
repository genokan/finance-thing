import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePlaidLink } from 'react-plaid-link'
import { api } from '../api/client'
import { Card } from './ui'

// Connect a bank via Plaid Link and sync balances into Accounts. Used on the
// Accounts page so linking lives next to where the accounts appear.
export function PlaidConnect() {
  const qc = useQueryClient()
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const refreshAccounts = () => {
    qc.invalidateQueries({ queryKey: ['accounts'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const sync = useMutation({
    mutationFn: () => api.post<{ synced: number; failed: string[] }>('/api/plaid/sync'),
    onSuccess: (r) => {
      setStatus(`Synced ${r.synced} account(s)${r.failed.length ? `, failed: ${r.failed.join(', ')}` : ''}.`)
      refreshAccounts()
    },
    onError: () => setStatus('Sync failed.'),
  })

  const exchange = useMutation({
    mutationFn: (vars: { publicToken: string; institutionName: string }) => api.post('/api/plaid/exchange', vars),
    onSuccess: () => {
      setStatus('Bank linked. Syncing balances…')
      sync.mutate()
    },
  })

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken, metadata) =>
      exchange.mutate({ publicToken, institutionName: metadata.institution?.name ?? 'Bank' }),
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
      setStatus('Could not start Plaid Link. Check the Plaid credentials on the server.')
    }
  }

  return (
    <Card>
      <div className="row" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <div className="main">
          <div className="name">Connect a bank</div>
          <div className="meta">Link a bank or brokerage via Plaid to auto-import account balances.</div>
        </div>
        <div className="right">
          <button className="btn sm" onClick={startLink} disabled={exchange.isPending}>+ Connect</button>
          <button className="btn ghost sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </div>
      {status && <div className="dim" style={{ marginTop: 10 }}>{status}</div>}
    </Card>
  )
}
