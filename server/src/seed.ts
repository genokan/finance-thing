import bcrypt from 'bcryptjs'
import { prisma } from './lib/prisma'
import { DEFAULT_CATEGORIES } from './lib/defaultCategories'

// Idempotent bootstrap: ensure the admin user (SEED_EMAIL/SEED_PASSWORD) and
// its default categories exist. Lives in src so it compiles into dist and can
// run in the production container without a TypeScript runtime.

async function seedCategories(userId: string) {
  const count = await prisma.category.count({ where: { userId } })
  if (count > 0) {
    console.log(`User already has ${count} categories — skipping category seed`)
    return
  }
  let total = 0
  for (const parent of DEFAULT_CATEGORIES) {
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
