// Dev entrypoint (`npm run db:seed`, prisma migrate seed) — the real seed
// lives in src/seed.ts so production runs the compiled dist/seed.js instead.
import '../src/seed'
