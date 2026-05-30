import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { login as apiLogin, logout as apiLogout, setOnAuthLost, tryRestoreSession } from '../api/client'

interface AuthState {
  authed: boolean
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setOnAuthLost(() => setAuthed(false))
    tryRestoreSession()
      .then((ok) => setAuthed(ok))
      .finally(() => setReady(true))
  }, [])

  async function login(email: string, password: string) {
    await apiLogin(email, password)
    setAuthed(true)
  }

  async function logout() {
    await apiLogout()
    setAuthed(false)
  }

  return <AuthContext.Provider value={{ authed, ready, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
