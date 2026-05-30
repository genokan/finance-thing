// Lightweight typed API client.
// Access token lives in memory only; the refresh token is an httpOnly cookie
// managed by the server. On a 401 we transparently try one refresh + retry.

let accessToken: string | null = null
let onAuthLost: (() => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

export function setOnAuthLost(fn: () => void) {
  onAuthLost = fn
}

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function refresh(): Promise<boolean> {
  const res = await fetch('/api/auth/refresh', { method: 'POST' })
  if (!res.ok) return false
  const data = (await res.json()) as { accessToken: string }
  accessToken = data.accessToken
  return true
}

async function raw(method: string, path: string, body?: unknown, isRetry = false): Promise<Response> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  // Try a single transparent refresh on auth failure (but never for auth routes).
  if (res.status === 401 && !isRetry && !path.startsWith('/api/auth/')) {
    const ok = await refresh()
    if (ok) return raw(method, path, body, true)
    onAuthLost?.()
  }
  return res
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data && (data as { error: string }).error) ||
      `Request failed (${res.status})`
    throw new ApiError(res.status, message, data)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => raw('GET', path).then((r) => parse<T>(r)),
  post: <T>(path: string, body?: unknown) => raw('POST', path, body ?? {}).then((r) => parse<T>(r)),
  put: <T>(path: string, body?: unknown) => raw('PUT', path, body ?? {}).then((r) => parse<T>(r)),
  del: <T>(path: string) => raw('DELETE', path).then((r) => parse<T>(r)),
}

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await parse<{ accessToken: string }>(res)
  accessToken = data.accessToken
  return data.accessToken
}

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' })
  accessToken = null
}

export async function tryRestoreSession(): Promise<boolean> {
  return refresh()
}
