import { Router } from 'express'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt'
import { validate } from '../middleware/validate'
import { authRateLimiter } from '../middleware/rateLimiter'
import { authenticate } from '../middleware/auth'
import { passwordSchema } from '../lib/password'

export const authRouter = Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const REFRESH_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/auth/refresh',
}

authRouter.post('/login', authRateLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }
  res.cookie('refreshToken', signRefreshToken(user.id), REFRESH_COOKIE)
  res.json({ accessToken: signAccessToken(user.id) })
})

authRouter.post('/refresh', (req, res) => {
  const token = req.cookies?.refreshToken
  if (!token) { res.status(401).json({ error: 'No refresh token' }); return }
  try {
    const { userId } = verifyRefreshToken(token)
    res.json({ accessToken: signAccessToken(userId) })
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' })
  }
})

authRouter.post('/logout', (_req, res) => {
  res.clearCookie('refreshToken', { path: '/api/auth/refresh' })
  res.json({ ok: true })
})

// Change own password. Requires auth (this router is mounted before the global
// authenticate middleware, so apply it explicitly here).
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
})

authRouter.post('/change-password', authenticate, validate(changePasswordSchema), async (req, res) => {
  const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>
  const user = await prisma.user.findUnique({ where: { id: req.userId } })
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    res.status(401).json({ error: 'Current password is incorrect' })
    return
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } })
  res.json({ ok: true })
})
