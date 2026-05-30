import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '../lib/jwt'

declare global {
  namespace Express {
    interface Request {
      userId: string
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' })
    return
  }
  try {
    const token = header.slice(7)
    const payload = verifyAccessToken(token)
    req.userId = payload.userId
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
