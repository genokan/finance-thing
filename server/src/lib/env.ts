import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Prisma 7's Rust-free client no longer auto-loads .env as a side effect (the
// old @prisma/client did). Load it explicitly and as early as possible so
// DATABASE_URL and every other secret are present regardless of how the process
// is started (tsx dev, compiled prod, or the seed script). In production with
// secrets injected by the environment (e.g. Vault), the file is simply absent.
const envPath = resolve(process.cwd(), '.env')
if (existsSync(envPath)) process.loadEnvFile(envPath)
