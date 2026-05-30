import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SEED_EMAIL
  const password = process.env.SEED_PASSWORD
  if (!email || !password) throw new Error('Set SEED_EMAIL and SEED_PASSWORD before seeding')
  // The seeded user is the bootstrap admin (idempotent — ensures isAdmin on re-run).
  const existing = await prisma.user.findUnique({ where: { email } })
  const user = existing
    ? await prisma.user.update({ where: { email }, data: { isAdmin: true } })
    : await prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 12), isAdmin: true } })
  console.log(`${existing ? 'Ensured admin' : 'Created admin user'}: ${user.email} (${user.id})`)

  // Seed a sensible default set of expense categories (global, idempotent).
  const defaults: { name: string; type: 'ESSENTIAL' | 'DISCRETIONARY' }[] = [
    { name: 'Housing', type: 'ESSENTIAL' },
    { name: 'Utilities', type: 'ESSENTIAL' },
    { name: 'Groceries', type: 'ESSENTIAL' },
    { name: 'Transportation', type: 'ESSENTIAL' },
    { name: 'Insurance', type: 'ESSENTIAL' },
    { name: 'Healthcare', type: 'ESSENTIAL' },
    { name: 'Subscriptions', type: 'DISCRETIONARY' },
    { name: 'Dining', type: 'DISCRETIONARY' },
    { name: 'Entertainment', type: 'DISCRETIONARY' },
    { name: 'Shopping', type: 'DISCRETIONARY' },
  ]
  for (const c of defaults) {
    await prisma.category.upsert({ where: { name: c.name }, create: c, update: {} })
  }
  console.log(`Seeded ${defaults.length} default categories`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
