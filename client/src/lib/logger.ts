// Browser logger. Mirrors to the console and ships to the backend so frontend
// logs land in the same Pino stream. Logging must never throw or surface to the
// user, so every failure here is swallowed.
type Level = 'error' | 'warn' | 'info'

function ship(level: Level, message: string, context?: Record<string, unknown>) {
  try {
    void fetch('/api/client-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, message, context }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* never throw from logging */
  }
}

export const log = {
  error(message: string, context?: Record<string, unknown>) {
    console.error(message, context ?? '')
    ship('error', message, context)
  },
  warn(message: string, context?: Record<string, unknown>) {
    console.warn(message, context ?? '')
    ship('warn', message, context)
  },
  info(message: string, context?: Record<string, unknown>) {
    ship('info', message, context)
  },
}

// Catch otherwise-invisible runtime failures and route them to Pino too.
export function installGlobalErrorLogging() {
  window.addEventListener('error', (e) => {
    log.error(`Uncaught error: ${e.message}`, {
      src: e.filename,
      line: e.lineno,
      col: e.colno,
      stack: e.error instanceof Error ? e.error.stack : undefined,
    })
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as { message?: string; stack?: string } | undefined
    log.error(`Unhandled promise rejection: ${reason?.message ?? String(e.reason)}`, { stack: reason?.stack })
  })
}
