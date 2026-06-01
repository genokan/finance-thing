import { prisma } from './prisma'

// Cross-table foreign keys arriving from request bodies must be verified against
// the requesting user, or a caller could reference (and read back, via `include`)
// another user's records — an IDOR. These helpers return true when there is
// nothing to check (falsy id) or the referenced row belongs to the user.

export async function ownsAccount(userId: string, id: string | null | undefined): Promise<boolean> {
  if (!id) return true
  return !!(await prisma.account.findFirst({ where: { id, userId }, select: { id: true } }))
}

export async function ownsCategory(userId: string, id: string | null | undefined): Promise<boolean> {
  if (!id) return true
  return !!(await prisma.category.findFirst({ where: { id, userId }, select: { id: true } }))
}

/** True when every non-null id in the list belongs to the user. */
export async function ownsAllAccounts(userId: string, ids: (string | null | undefined)[]): Promise<boolean> {
  const real = [...new Set(ids.filter((x): x is string => !!x))]
  if (real.length === 0) return true
  const count = await prisma.account.count({ where: { id: { in: real }, userId } })
  return count === real.length
}
