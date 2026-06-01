import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, env } from 'prisma/config'

// Prisma 7 no longer auto-loads .env. Load it (when present) so the CLI —
// db push / generate / seed — can read DATABASE_URL. In production the file is
// absent and the value comes from the injected environment instead.
const envPath = resolve(process.cwd(), '.env')
if (existsSync(envPath)) process.loadEnvFile(envPath)

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
