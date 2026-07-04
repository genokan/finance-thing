import { createHash, createPublicKey, type JsonWebKey, type KeyObject } from 'crypto'
import jwt from 'jsonwebtoken'
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid'
import type { AccountKind } from '../generated/prisma/client'
import { encrypt, decrypt } from '../lib/crypto'
import { prisma } from '../lib/prisma'
import { ensureDebtForAccount, isLiabilityKind } from '../lib/debtAutoCreate'

function client() {
  const env = (process.env.PLAID_ENV ?? 'sandbox') as keyof typeof PlaidEnvironments
  return new PlaidApi(new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: { headers: { 'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!, 'PLAID-SECRET': process.env.PLAID_SECRET! } },
  }))
}

function mapKind(type: string | null | undefined, subtype: string | null | undefined): AccountKind {
  // Liabilities first — these are what Plaid returns for cards and loans.
  if (type === 'credit') return 'CREDIT_CARD'
  if (type === 'loan') return subtype === 'mortgage' ? 'MORTGAGE' : subtype === 'line of credit' ? 'LINE_OF_CREDIT' : 'LOAN'
  switch (subtype) {
    case 'checking': return 'CHECKING'
    case 'savings': return 'SAVINGS'
    case 'money market': return 'MONEY_MARKET'
    case 'hsa': return 'HSA'
    case 'ira': return 'IRA'
    case 'roth': return 'ROTH_IRA'
    case '401k': return 'PLAN_401K'
    case 'brokerage': return 'BROKERAGE'
    case 'credit card': return 'CREDIT_CARD'
    default: return 'OTHER'
  }
}

export async function createLinkToken(userId: string, relinkItemId?: string): Promise<string> {
  // OAuth banks require a redirect URI that is also registered in the Plaid
  // dashboard. Optional in sandbox; required for OAuth institutions in production.
  const redirectUri = process.env.PLAID_REDIRECT_URI

  // Update mode: re-authenticate an existing item (ITEM_LOGIN_REQUIRED) by
  // passing its access token instead of requesting products.
  if (relinkItemId) {
    const item = await prisma.plaidItem.findFirst({ where: { itemId: relinkItemId, userId } })
    if (!item) throw new Error('Item not found')
    const res = await client().linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'finance-thing',
      country_codes: [CountryCode.Us],
      language: 'en',
      access_token: decrypt(item.accessToken),
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    })
    return res.data.link_token
  }

  const res = await client().linkTokenCreate({
    user: { client_user_id: userId },
    client_name: 'finance-thing',
    products: [Products.Assets],
    country_codes: [CountryCode.Us],
    language: 'en',
    ...(process.env.PLAID_WEBHOOK_URL ? { webhook: process.env.PLAID_WEBHOOK_URL } : {}),
    ...(redirectUri ? { redirect_uri: redirectUri } : {}),
  })
  return res.data.link_token
}

export async function exchangePublicToken(publicToken: string, institutionName: string, userId: string): Promise<void> {
  const { data } = await client().itemPublicTokenExchange({ public_token: publicToken })
  const institution = await prisma.institution.upsert({ where: { name: institutionName }, create: { name: institutionName }, update: {} })
  await prisma.plaidItem.create({ data: { userId, institutionId: institution.id, accessToken: encrypt(data.access_token), itemId: data.item_id } })
}

// Plaid SDK errors are axios errors carrying the Plaid error body.
function plaidErrorCode(err: unknown): string | null {
  const data = (err as { response?: { data?: { error_code?: string } } })?.response?.data
  return data?.error_code ?? null
}

// Error codes that mean the user must re-authenticate via Link update mode.
const REAUTH_CODES = new Set(['ITEM_LOGIN_REQUIRED', 'ITEM_LOCKED', 'USER_PERMISSION_REVOKED', 'ACCESS_NOT_GRANTED'])

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
        const kind = mapKind(acct.type, acct.subtype)
        const existing = await prisma.account.findFirst({ where: { userId, plaidItemId: item.id, name: acct.name } })
        const row = existing
          ? await prisma.account.update({ where: { id: existing.id }, data: { balance, lastUpdatedAt: new Date() } })
          : await prisma.account.create({
              data: {
                userId,
                name: acct.name,
                kind,
                trackingMode: 'BALANCE',
                balance,
                institutionId: item.institutionId,
                plaidItemId: item.id,
                lastUpdatedAt: new Date(),
              },
            })
        // Liability accounts get a linked Debt so they surface on the Debt page
        // (idempotent — won't duplicate on re-sync).
        if (isLiabilityKind(kind)) await ensureDebtForAccount(row)
        synced++
      }
      // A successful pull proves the credentials work — clear any stale flag.
      await prisma.plaidItem.update({ where: { id: item.id }, data: { lastSyncedAt: new Date(), needsReauth: false } })
    } catch (err) {
      failed.push(item.institution.name)
      if (REAUTH_CODES.has(plaidErrorCode(err) ?? '')) {
        await prisma.plaidItem.update({ where: { id: item.id }, data: { needsReauth: true } })
      }
    }
  }
  return { synced, failed }
}

/** Clear the re-auth flag after a successful Link update-mode session. */
export async function markItemRelinked(itemId: string, userId: string): Promise<void> {
  const item = await prisma.plaidItem.findFirst({ where: { itemId, userId } })
  if (!item) throw new Error('Not found')
  await prisma.plaidItem.update({ where: { id: item.id }, data: { needsReauth: false } })
}

// Plaid signs webhooks with an ES256 JWT in the Plaid-Verification header;
// the claim carries a SHA-256 of the exact request body. Keys are fetched by
// kid and cached — Plaid rotates them rarely.
const webhookKeyCache = new Map<string, KeyObject>()

export async function verifyPlaidWebhook(rawBody: Buffer | undefined, verificationJwt: string | undefined): Promise<boolean> {
  if (!rawBody || !verificationJwt) return false
  const decoded = jwt.decode(verificationJwt, { complete: true })
  if (!decoded || typeof decoded === 'string') return false
  const { alg, kid } = decoded.header
  if (alg !== 'ES256' || !kid) return false

  let key = webhookKeyCache.get(kid)
  if (!key) {
    const { data } = await client().webhookVerificationKeyGet({ key_id: kid })
    key = createPublicKey({ key: data.key as unknown as JsonWebKey, format: 'jwk' })
    webhookKeyCache.set(kid, key)
  }

  try {
    // maxAge bounds replay: Plaid issues the JWT per delivery.
    const payload = jwt.verify(verificationJwt, key, { algorithms: ['ES256'], maxAge: '5m' }) as { request_body_sha256?: string }
    return payload.request_body_sha256 === createHash('sha256').update(rawBody).digest('hex')
  } catch {
    return false
  }
}

/**
 * Plaid ITEM webhooks flip the re-auth flag. Even verified, the payload is
 * treated as a hint: it can only toggle a flag on an item_id that already
 * exists, never expose or modify financial data.
 */
export async function handleWebhook(body: { webhook_type?: string; webhook_code?: string; item_id?: string }): Promise<void> {
  if (body.webhook_type !== 'ITEM' || !body.item_id) return
  const needsReauth =
    body.webhook_code === 'ERROR' ||
    body.webhook_code === 'PENDING_EXPIRATION' ||
    body.webhook_code === 'PENDING_DISCONNECT' ||
    body.webhook_code === 'USER_PERMISSION_REVOKED'
  const repaired = body.webhook_code === 'LOGIN_REPAIRED'
  if (!needsReauth && !repaired) return
  await prisma.plaidItem.updateMany({ where: { itemId: body.item_id }, data: { needsReauth } })
}

export async function listItems(userId: string) {
  const items = await prisma.plaidItem.findMany({
    where: { userId },
    include: { institution: true, _count: { select: { accounts: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return items.map((i) => ({
    itemId: i.itemId,
    institution: i.institution.name,
    accountCount: i._count.accounts,
    createdAt: i.createdAt,
    needsReauth: i.needsReauth,
    lastSyncedAt: i.lastSyncedAt,
  }))
}

// Remove a linked item and every account it synced. The Plaid API call is
// best-effort — local data is always cleaned up so the user can disconnect even
// if Plaid is unreachable or the token is already invalid.
export async function disconnectItem(itemId: string, userId: string): Promise<void> {
  const item = await prisma.plaidItem.findFirst({ where: { itemId, userId } })
  if (!item) throw new Error('Not found')
  try {
    await client().itemRemove({ access_token: decrypt(item.accessToken) })
  } catch (err) {
    console.error('Plaid itemRemove failed (continuing with local cleanup):', err instanceof Error ? err.message : err)
  }
  await prisma.account.deleteMany({ where: { userId, plaidItemId: item.id } })
  await prisma.plaidItem.delete({ where: { id: item.id } })
}
