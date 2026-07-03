import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { App } from './App'
import { ApiError } from './api/client'
import { pushToast } from './lib/toast'
import { log, installGlobalErrorLogging } from './lib/logger'
import { Toaster } from './components/Toaster'
import './ui/glass.css'
import './app.css'

installGlobalErrorLogging()

// Every failed query/mutation surfaces the server's specific message as a toast
// and ships it to Pino — no per-page error wiring needed.
function reportError(error: unknown, kind: 'query' | 'mutation') {
  // 401s are handled by the transparent refresh / logout flow — don't alarm the user.
  if (error instanceof ApiError && error.status === 401) return
  const message =
    error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Unexpected error'
  pushToast(message, 'error')
  log.error(`${kind} failed: ${message}`, { status: error instanceof ApiError ? error.status : undefined })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
  queryCache: new QueryCache({ onError: (e) => reportError(e, 'query') }),
  mutationCache: new MutationCache({ onError: (e) => reportError(e, 'mutation') }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
