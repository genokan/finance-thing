import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid'
import { encrypt, decrypt } from '../lib/crypto'
import { prisma } from '../lib/prisma'

function client() {
  return new PlaidApi(new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV as keyof typeof PlaidEnvironments ?? 'sandbox'],
    baseOptions: { headers: { 'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!, 'PLAID-SECRET': process.env.PLAID_SECRET! } },
  }))
}

export async function createLinkToken(userId: string): Promise<string> {
  const res = await client().linkTokenCreate({ user: { client_user_id: userId }, client_name: 'finance-thing', products: [Products.Assets], country_codes: [CountryCode.Us], language: 'en' })
  return res.data.link_token
}

export async function exchangePublicToken(publicToken: string, institutionName: string, userId: string): Promise<void> {
  const { data } = await client().itemPublicTokenExchange({ public_token: publicToken })
  const institution = await prisma.institution.upsert({ where: { name: institutionName }, create: { name: institutionName }, update: {} })
  await prisma.plaidItem.create({ data: { userId, institutionId: institution.id, accessToken: encrypt(data.access_token), itemId: data.item_id } })
}

export async function syncAllBalances(userId: string): Promise<{ synced: number; failed: string[] }> {
  const items = await prisma.plaidItem.findMany({ where: { userId }, include: { institution: true } })
  const plaid = client()
  let synced = 0; const failed: string[] = []
  for (const item of items) {
    try {
      const { data } = await plaid.accountsGet({ access_token: decrypt(item.accessToken) })
      for (const account of data.accounts) {
        const balance = account.balances.current
        if (balance == null) continue
        const existing = await prisma.investmentAccount.findFirst({ where: { name: account.name, institutionId: item.institutionId, userId, isActive: true } })
        if (existing) await prisma.investmentAccount.update({ where: { id: existing.id }, data: { currentValue: balance, lastUpdatedAt: new Date() } })
        else await prisma.investmentAccount.create({ data: { name: account.name, type: 'CHECKING', currentValue: balance, institutionId: item.institutionId, userId, lastUpdatedAt: new Date() } })
        synced++
      }
    } catch { failed.push(item.institution.name) }
  }
  return { synced, failed }
}

export async function disconnectItem(itemId: string, userId: string): Promise<void> {
  const item = await prisma.plaidItem.findFirst({ where: { itemId, userId } })
  if (!item) throw new Error('Not found')
  await client().itemRemove({ access_token: decrypt(item.accessToken) })
  await prisma.plaidItem.delete({ where: { id: item.id } })
}
