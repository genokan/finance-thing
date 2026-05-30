import { NavLink, Outlet } from 'react-router-dom'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '◎', end: true },
  { to: '/expenses', label: 'Expenses', icon: '↻', end: false },
  { to: '/income', label: 'Income', icon: '↓', end: false },
  { to: '/investments', label: 'Investments', icon: '▲', end: false },
  { to: '/debt', label: 'Debt', icon: '▼', end: false },
  { to: '/history', label: 'History', icon: '∿', end: false },
  { to: '/settings', label: 'Settings', icon: '⚙', end: false },
]

// Bottom nav on mobile shows the most-used subset.
const MOBILE_NAV = NAV.filter((n) => ['/', '/expenses', '/investments', '/debt', '/history'].includes(n.to))

export function Layout() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          finance<span>·</span>thing
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>
            <span className="ico">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
        <div className="spacer" />
      </aside>

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
