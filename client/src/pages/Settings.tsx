import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import type { FilingStatus, ManagedInstitution, ManagedUser, Settings } from '../api/types'
import { Card, Empty, Field, Loading, Modal, SectionHead } from '../components/ui'
import { dateLabel } from '../lib/format'
import { PASSWORD_RULES, validatePassword } from '../lib/password'

export function SettingsPage() {
  const qc = useQueryClient()
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

      <ChangePasswordSection />

      <InstitutionsSection />

      <p className="dim" style={{ marginTop: 18, fontSize: 13 }}>
        Connect banks via Plaid on the <strong>Accounts</strong> page.
      </p>

      {settings.data?.isAdmin && <UsersSection />}
    </div>
  )
}

function PasswordInput({ value, onChange, autoComplete }: { value: string; onChange: (v: string) => void; autoComplete?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input"
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ paddingRight: 52 }}
        required
      />
      <button
        type="button"
        className="iconbtn"
        onClick={() => setShow((s) => !s)}
        style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 12 }}
      >
        {show ? 'hide' : 'show'}
      </button>
    </div>
  )
}

function ChangePasswordSection() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  const change = useMutation({
    mutationFn: () => api.post('/api/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: () => { setCurrent(''); setNext(''); setConfirm(''); setError(null) },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not change password'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const policy = validatePassword(next)
    if (policy) { setError(policy); return }
    if (next !== confirm) { setError('New passwords do not match'); return }
    change.mutate()
  }

  return (
    <>
      <SectionHead title="Password" />
      <form className="card" onSubmit={submit} style={{ maxWidth: 460 }}>
        <Field label="Current password"><PasswordInput value={current} onChange={setCurrent} autoComplete="current-password" /></Field>
        <Field label="New password"><PasswordInput value={next} onChange={setNext} autoComplete="new-password" /></Field>
        <Field label="Confirm new password"><PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" /></Field>
        <p className="dim" style={{ fontSize: 12, margin: '-6px 0 12px' }}>{PASSWORD_RULES}</p>
        {error && <div className="error-text">{error}</div>}
        {change.isSuccess && <div className="dim">Password updated.</div>}
        <button className="btn" type="submit" disabled={change.isPending} style={{ marginTop: 4 }}>
          {change.isPending ? 'Updating…' : 'Change password'}
        </button>
      </form>
    </>
  )
}

function InstitutionsSection() {
  const qc = useQueryClient()
  const institutions = useQuery({ queryKey: ['institutions'], queryFn: () => api.get<ManagedInstitution[]>('/api/institutions') })
  const [renaming, setRenaming] = useState<ManagedInstitution | null>(null)

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/institutions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['institutions'] }),
  })

  const list = institutions.data ?? []

  return (
    <>
      <SectionHead title="Institutions" />
      <p className="page-sub" style={{ marginTop: -4 }}>
        Created automatically when you add accounts. Rename to tidy duplicates; delete only when nothing links to them.
      </p>
      <Card>
        {institutions.isLoading ? (
          <div className="dim">Loading…</div>
        ) : !list.length ? (
          <Empty>No institutions yet. They appear here once you add accounts.</Empty>
        ) : (
          <div className="list">
            {list.map((inst) => {
              const uses = inst._count.accounts + inst._count.debts + inst._count.plaidItems
              return (
                <div className="row" key={inst.id}>
                  <div className="main">
                    <div className="name">{inst.name}</div>
                    <div className="meta">{uses === 0 ? 'unused' : `${uses} linked account${uses === 1 ? '' : 's'}`}</div>
                  </div>
                  <div className="right">
                    <button className="btn ghost sm" onClick={() => setRenaming(inst)}>Rename</button>
                    <button className="iconbtn" title="Delete institution" onClick={() => remove.mutate(inst.id)}>✕</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {renaming && <RenameInstitutionModal institution={renaming} onClose={() => setRenaming(null)} />}
    </>
  )
}

function RenameInstitutionModal({ institution, onClose }: { institution: ManagedInstitution; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(institution.name)
  const rename = useMutation({
    mutationFn: () => api.put(`/api/institutions/${institution.id}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['institutions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      onClose()
    },
  })

  return (
    <Modal title={`Rename — ${institution.name}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); rename.mutate() }}>
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={rename.isPending || !name.trim()}>{rename.isPending ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

function UsersSection() {
  const qc = useQueryClient()
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<ManagedUser[]>('/api/users') })

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetting, setResetting] = useState<ManagedUser | null>(null)

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
    const policy = validatePassword(password)
    if (policy) { setError(policy); return }
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
                    {u.isAdmin ? <span className="badge warn">admin</span> : <span className="badge neutral">user</span>} · added {dateLabel(u.createdAt)}
                  </div>
                </div>
                <div className="right">
                  <button className="btn ghost sm" onClick={() => setResetting(u)}>Reset password</button>
                  <button className="iconbtn" title="Delete user" onClick={() => remove.mutate(u.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <form className="card" style={{ marginTop: 14 }} onSubmit={submit}>
        <div className="stat-label" style={{ marginBottom: 12 }}>Add user</div>
        <div className="field-row">
          <Field label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Password"><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" /></Field>
        </div>
        <p className="dim" style={{ fontSize: 12, margin: '-6px 0 12px' }}>{PASSWORD_RULES}</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
          <span>Grant admin access</span>
        </label>
        {error && <div className="error-text">{error}</div>}
        <button className="btn" type="submit" disabled={create.isPending}>{create.isPending ? 'Adding…' : 'Add user'}</button>
      </form>

      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
    </>
  )
}

function ResetPasswordModal({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const reset = useMutation({
    mutationFn: () => api.post(`/api/users/${user.id}/reset-password`, { newPassword: pw }),
    onSuccess: onClose,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not reset password'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const policy = validatePassword(pw)
    if (policy) { setError(policy); return }
    reset.mutate()
  }

  return (
    <Modal title={`Reset password — ${user.email}`} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="New password"><PasswordInput value={pw} onChange={setPw} autoComplete="new-password" /></Field>
        <p className="dim" style={{ fontSize: 12, margin: '-6px 0 12px' }}>{PASSWORD_RULES}</p>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={reset.isPending}>{reset.isPending ? 'Resetting…' : 'Reset password'}</button>
        </div>
      </form>
    </Modal>
  )
}
