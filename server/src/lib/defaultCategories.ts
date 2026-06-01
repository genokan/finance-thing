import type { BudgetBucket } from '../generated/prisma/client'

// Common starter categories (no budget required to use them). Shared by the seed
// script and the "add common categories" endpoint. bucket drives 50/30/20.
export const DEFAULT_CATEGORIES: { name: string; bucket: BudgetBucket; children?: string[] }[] = [
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
