import jwt from 'jsonwebtoken'

interface TokenPayload {
  userId: string
}

export function signAccessToken(userId: string): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  return jwt.sign({ userId } satisfies TokenPayload, secret, { expiresIn: '15m' })
}

export function signRefreshToken(userId: string): string {
  const secret = process.env.JWT_REFRESH_SECRET
  if (!secret) throw new Error('JWT_REFRESH_SECRET not set')
  return jwt.sign({ userId }, secret, { expiresIn: '7d' })
}

export function verifyAccessToken(token: string): TokenPayload {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  return jwt.verify(token, secret) as TokenPayload
}

export function verifyRefreshToken(token: string): TokenPayload {
  const secret = process.env.JWT_REFRESH_SECRET
  if (!secret) throw new Error('JWT_REFRESH_SECRET not set')
  return jwt.verify(token, secret) as TokenPayload
}
