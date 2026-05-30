import { Router } from 'express'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate'
import { requireAdmin } from '../middleware/auth'

export const usersRouter = Router()

// All user-management routes are admin-only.
usersRouter.use(requireAdmin)

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  isAdmin: z.boolean().default(false),
})

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
