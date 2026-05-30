import { PrismaClient, type BudgetBucket } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

// Default category tree: parents with subcategories. Fully editable in the app —
// this is just a useful starting point. bucket drives the 50/30/20 roll-up.
const CATEGORY_TREE: { name: string; bucket: BudgetBucket; children?: string[] }[] = [
  { name: 'Housing', bucket: 'ESSENTIAL', children: ['Rent / Mortgage', 'Utilities', 'Internet', 'Home Insurance'] },
  { name: 'Food', bucket: 'ESSENTIAL', children: ['Groceries'] },
  { name: 'Transportation', bucket: 'ESSENTIAL', children: ['Car Payment', 'Gas', 'Auto Insurance'] },
  { name: 'Healthcare', bucket: 'ESSENTIAL', children: ['Medical', 'Pharmacy'] },
  { name: 'Dining Out', bucket: 'DISCRETIONARY', children: ['Restaurants', 'Coffee'] },
  { name: 'Entertainment', bucket: 'DISCRETIONARY', children: ['Streaming', 'Hobbies'] },
  { name: 'Shopping', bucket: 'DISCRETIONARY', children: ['Clothing', 'Household'] },
  { name: 'Subscriptions', bucket: 'DISCRETIONARY' },
  { name: 'Savings', bucket: 'SAVINGS', children: ['Emergency Fund', 'Investments', 'Retirement'] },
]

async function seedCategories(userId: string) {
  const count = await prisma.category.count({ where: { userId } })
  if (count > 0) {
    console.log(`User already has ${count} categories — skipping category seed`)
    return
  }
  let total = 0
  for (const parent of CATEGORY_TREE) {
    const created = await prisma.category.create({
      data: { userId, name: parent.name, bucket: parent.bucket, appliesTo: 'ANY' },
    })
    total++
    for (const child of parent.children ?? []) {
      await prisma.category.create({
        data: { userId, name: child, bucket: parent.bucket, appliesTo: 'ANY', parentId: created.id },
      })
      total++
    }
  }
  console.log(`Seeded ${total} default categories`)
}

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

  await seedCategories(user.id)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
