import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid'
import type { AccountKind } from '@prisma/client'
import { encrypt, decrypt } from '../lib/crypto'
import { prisma } from '../lib/prisma'

function client() {
  const env = (process.env.PLAID_ENV ?? 'sandbox') as keyof typeof PlaidEnvironments
  return new PlaidApi(new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: { headers: { 'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!, 'PLAID-SECRET': process.env.PLAID_SECRET! } },
  }))
}

function mapKind(subtype: string | null | undefined): AccountKind {
  switch (subtype) {
    case 'checking': return 'CHECKING'
    case 'savings': return 'SAVINGS'
    case 'money market': return 'MONEY_MARKET'
    case 'hsa': return 'HSA'
    case 'ira': return 'IRA'
    case 'roth': return 'ROTH_IRA'
    case '401k': return 'PLAN_401K'
    case 'brokerage': return 'BROKERAGE'
    default: return 'OTHER'
  }
}

export async function createLinkToken(userId: string): Promise<string> {
  const res = await client().linkTokenCreate({
    user: { client_user_id: userId },
    client_name: 'finance-thing',
    products: [Products.Assets],
    country_codes: [CountryCode.Us],
    language: 'en',
  })
  return res.data.link_token
}

export async function exchangePublicToken(publicToken: string, institutionName: string, userId: string): Promise<void> {
  const { data } = await client().itemPublicTokenExchange({ public_token: publicToken })
  const institution = await prisma.institution.upsert({ where: { name: institutionName }, create: { name: institutionName }, update: {} })
  await prisma.plaidItem.create({ data: { userId, institutionId: institution.id, accessToken: encrypt(data.access_token), itemId: data.item_id } })
}

// Pull balances for the user's linked items into Account rows (one per Plaid
// account, matched by plaidItemId + name). Read-only; balances only.
export async function syncAllBalances(userId: string): Promise<{ synced: number; failed: string[] }> {
  const items = await prisma.plaidItem.findMany({ where: { userId }, include: { institution: true } })
  const plaid = client()
  let synced = 0
  const failed: string[] = []
  for (const item of items) {
    try {
      const { data } = await plaid.accountsGet({ access_token: decrypt(item.accessToken) })
      for (const acct of data.accounts) {
        const balance = acct.balances.current
        if (balance == null) continue
        const existing = await prisma.account.findFirst({ where: { userId, plaidItemId: item.id, name: acct.name } })
        if (existing) {
          await prisma.account.update({ where: { id: existing.id }, data: { balance, lastUpdatedAt: new Date() } })
        } else {
          await prisma.account.create({
            data: {
              userId,
              name: acct.name,
              kind: mapKind(acct.subtype),
              trackingMode: 'BALANCE',
              balance,
              institutionId: item.institutionId,
              plaidItemId: item.id,
              lastUpdatedAt: new Date(),
            },
          })
        }
        synced++
      }
    } catch {
      failed.push(item.institution.name)
    }
  }
  return { synced, failed }
}

export async function disconnectItem(itemId: string, userId: string): Promise<void> {
  const item = await prisma.plaidItem.findFirst({ where: { itemId, userId } })
  if (!item) throw new Error('Not found')
  await client().itemRemove({ access_token: decrypt(item.accessToken) })
  await prisma.plaidItem.delete({ where: { id: item.id } })
}
