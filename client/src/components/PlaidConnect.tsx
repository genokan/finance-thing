import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePlaidLink } from 'react-plaid-link'
import { api } from '../api/client'
import { Card } from './ui'

interface LinkedItem {
  itemId: string
  institution: string
  accountCount: number
  createdAt: string
}

// Connect a bank via Plaid Link, sync balances into Accounts, and manage/remove
// linked items. Lives on the Accounts page next to where the accounts appear.
export function PlaidConnect() {
  const qc = useQueryClient()
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const items = useQuery({ queryKey: ['plaid-items'], queryFn: () => api.get<LinkedItem[]>('/api/plaid/items') })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['accounts'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['plaid-items'] })
    // Liability accounts auto-spawn linked debts on sync — refresh the Debt page too.
    qc.invalidateQueries({ queryKey: ['debts'] })
  }

  const sync = useMutation({
    mutationFn: () => api.post<{ synced: number; failed: string[] }>('/api/plaid/sync'),
    onSuccess: (r) => {
      setStatus(`Synced ${r.synced} account(s)${r.failed.length ? `, failed: ${r.failed.join(', ')}` : ''}.`)
      refresh()
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

  const disconnect = useMutation({
    mutationFn: (itemId: string) => api.del(`/api/plaid/items/${itemId}`),
    onSuccess: () => {
      setStatus('Disconnected and removed its accounts.')
      refresh()
    },
    onError: () => setStatus('Could not disconnect.'),
  })

  const isOAuthReturn = typeof window !== 'undefined' && window.location.search.includes('oauth_state_id')

  const { open, ready } = usePlaidLink({
    token: linkToken,
    receivedRedirectUri: isOAuthReturn ? window.location.href : undefined,
    onSuccess: (publicToken, metadata) => {
      localStorage.removeItem('plaid_link_token')
      exchange.mutate({ publicToken, institutionName: metadata.institution?.name ?? 'Bank' })
    },
  })

  useEffect(() => {
    if (isOAuthReturn) {
      const stored = localStorage.getItem('plaid_link_token')
      if (stored) setLinkToken(stored)
    }
  }, [isOAuthReturn])

  useEffect(() => {
    if (linkToken && ready) open()
  }, [linkToken, ready, open])

  async function startLink() {
    setStatus(null)
    try {
      const { linkToken: token } = await api.get<{ linkToken: string }>('/api/plaid/link-token')
      localStorage.setItem('plaid_link_token', token)
      setLinkToken(token)
    } catch {
      setStatus('Could not start Plaid Link. Check the Plaid credentials on the server.')
    }
  }

  function onDisconnect(item: LinkedItem) {
    if (window.confirm(`Disconnect ${item.institution} and delete its ${item.accountCount} synced account(s)? This cannot be undone.`)) {
      disconnect.mutate(item.itemId)
    }
  }

  const linked = items.data ?? []

  return (
    <Card>
      <div className="row" style={{ paddingTop: 0, paddingBottom: linked.length ? 12 : 0 }}>
        <div className="main">
          <div className="name">Connect a bank</div>
          <div className="meta">Link a bank or brokerage via Plaid to auto-import account balances.</div>
        </div>
        <div className="right">
          <button className="btn sm" onClick={startLink} disabled={exchange.isPending}>+ Connect</button>
          <button className="btn ghost sm" onClick={() => sync.mutate()} disabled={sync.isPending || !linked.length}>
            {sync.isPending ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </div>

      {linked.map((item) => (
        <div className="row" key={item.itemId}>
          <div className="main">
            <div className="name">{item.institution}</div>
            <div className="meta">{item.accountCount} synced account(s)</div>
          </div>
          <div className="right">
            <button className="btn danger sm" onClick={() => onDisconnect(item)} disabled={disconnect.isPending}>
              Disconnect
            </button>
          </div>
        </div>
      ))}

      {status && <div className="dim" style={{ marginTop: 10 }}>{status}</div>}
    </Card>
  )
}
