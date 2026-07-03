import jwt from 'jsonwebtoken'

interface AccessPayload {
  userId: string
}

// Refresh tokens carry the user's tokenVersion; bumping it (password change,
// admin reset) invalidates every outstanding refresh token at once. Access
// tokens stay stateless — their 15-minute TTL bounds the exposure window.
interface RefreshPayload {
  userId: string
  tokenVersion: number
}

export function signAccessToken(userId: string): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  return jwt.sign({ userId } satisfies AccessPayload, secret, { expiresIn: '15m' })
}

export function signRefreshToken(userId: string, tokenVersion: number): string {
  const secret = process.env.JWT_REFRESH_SECRET
  if (!secret) throw new Error('JWT_REFRESH_SECRET not set')
  return jwt.sign({ userId, tokenVersion } satisfies RefreshPayload, secret, { expiresIn: '7d' })
}

export function verifyAccessToken(token: string): AccessPayload {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  return jwt.verify(token, secret) as AccessPayload
}

export function verifyRefreshToken(token: string): RefreshPayload {
  const secret = process.env.JWT_REFRESH_SECRET
  if (!secret) throw new Error('JWT_REFRESH_SECRET not set')
  const payload = jwt.verify(token, secret) as Partial<RefreshPayload>
  // Tokens issued before tokenVersion existed lack the claim — treat as v0.
  return { userId: payload.userId as string, tokenVersion: payload.tokenVersion ?? 0 }
}
