import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Expenses } from './pages/Expenses'
import { Income } from './pages/Income'
import { Accounts } from './pages/Accounts'
import { Budgets } from './pages/Budgets'
import { DebtPage } from './pages/Debt'
import { History } from './pages/History'
import { SettingsPage } from './pages/Settings'

export function App() {
  const { authed, ready } = useAuth()

  if (!ready) return <div className="loading">Loading…</div>

  if (!authed) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/income" element={<Income />} />
        <Route path="/debt" element={<DebtPage />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
