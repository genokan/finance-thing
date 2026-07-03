import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Brand } from './Brand'

const NAV = [
  { to: '/', label: 'Overview', icon: '◎', end: true },
  { to: '/future', label: 'Future', icon: '✦', end: false },
  { to: '/accounts', label: 'Accounts', icon: '▤', end: false },
  { to: '/investments', label: 'Investments', icon: '▲', end: false },
  { to: '/debt', label: 'Debt', icon: '▼', end: false },
  { to: '/expenses', label: 'Outflow', icon: '↻', end: false },
  { to: '/income', label: 'Income', icon: '↓', end: false },
]

// Bottom nav on mobile shows the most-used subset.
const MOBILE_NAV = NAV.filter((n) => ['/', '/future', '/accounts', '/debt', '/income'].includes(n.to))

function UserMenu() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<{ email: string }>('/api/settings') })
  const email = settings.data?.email ?? ''
  const initial = email ? email[0]!.toUpperCase() : '?'

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="usermenu" ref={ref}>
      <button className="usermenu-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="avatar">{initial}</span>
        <span className="usermenu-email">{email}</span>
        <span className="dim">▾</span>
      </button>
      {open && (
        <div className="menu">
          <div className="head">
            <div className="label">Signed in as</div>
            <div className="val num">{email}</div>
          </div>
          <button className="menu-item" onClick={() => { setOpen(false); navigate('/settings') }}>⚙ Settings</button>
          <button className="menu-item danger" onClick={() => logout()}>⎋ Sign out</button>
        </div>
      )}
    </div>
  )
}

export function Layout() {
  return (
    <div className="app">
      <header className="topnav">
        <div className="topnav-inner">
          <Brand />
          <nav className="topnav-links">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>
                <span className="ico">{n.icon}</span>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <UserMenu />
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <nav className="bottomnav">
        {MOBILE_NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="ico">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
