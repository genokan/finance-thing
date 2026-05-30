import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '../lib/jwt'
import { prisma } from '../lib/prisma'

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

// Gate routes that only an admin user may access. Assumes `authenticate` ran first.
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } })
  if (!user?.isAdmin) {
    res.status(403).json({ error: 'Admin access required' })
    return
  }
  next()
}
