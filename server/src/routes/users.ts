import { Router } from 'express'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'
import { requireAdmin } from '../middleware/auth'
import { passwordSchema } from '../lib/password'

export const usersRouter = Router()

// All user-management routes are admin-only.
usersRouter.use(requireAdmin)

const createUserSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  isAdmin: z.boolean().default(false),
})

const resetPasswordSchema = z.object({ newPassword: passwordSchema })

usersRouter.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, isAdmin: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  res.json(users)
})

usersRouter.post('/', validate(createUserSchema), async (req, res) => {
  const data = req.body as z.infer<typeof createUserSchema>
  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) {
    res.status(409).json({ error: 'A user with that email already exists' })
    return
  }
  const user = await prisma.user.create({
    data: { email: data.email, passwordHash: await bcrypt.hash(data.password, 12), isAdmin: data.isAdmin },
    select: { id: true, email: true, isAdmin: true, createdAt: true },
  })
  res.status(201).json(user)
})

usersRouter.post('/:id/reset-password', validate(resetPasswordSchema), async (req, res) => {
  const { newPassword } = req.body as z.infer<typeof resetPasswordSchema>
  try {
    // tokenVersion bump revokes the user's existing sessions along with the reset.
    await prisma.user.update({
      where: { id: req.params.id as string },
      data: { passwordHash: await bcrypt.hash(newPassword, 12), tokenVersion: { increment: 1 } },
    })
    res.json({ ok: true })
  } catch {
    res.status(404).json({ error: 'User not found' })
  }
})

usersRouter.delete('/:id', async (req, res) => {
  const id = req.params.id as string
  if (id === req.userId) {
    res.status(400).json({ error: 'You cannot delete your own account' })
    return
  }
  try {
    await prisma.user.delete({ where: { id } })
    res.json({ ok: true })
  } catch {
    // Most likely a foreign-key violation: the user still owns financial records.
    res.status(409).json({ error: 'Cannot delete a user that still has financial data' })
  }
})
