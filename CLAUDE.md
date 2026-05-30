# finance-thing

## Infrastructure
- Postgres runs in Docker on `pi5-1.opsguy.io`, reachable directly at `pg1.opsguy.io:5432` (this laptop and the homelab can both reach it — no tunnel needed)
- DB user: `finance_thing`, password in `server/.env` (gitignored). DATABASE_URL already points at `pg1.opsguy.io:5432`
- Prisma: use `prisma db push` (not `migrate dev`)
- finance_thing user needs CREATEDB privilege for Prisma shadow database

## Dev Commands
- `npm run dev` — from repo root, starts frontend (Vite, 3000) + backend (Express API, 3001) via concurrently. Vite proxies `/api` → 3001. Open http://localhost:3000. (Prod: single container serves everything on 3000 via Express.)
- `npm run seed` (root) or `cd server && SEED_EMAIL=x SEED_PASSWORD=y npm run db:seed` — create initial user
- `npm run build` (root) — build client then server
- `npm run install:all` (root) — install root + server + client deps
- `cd server && npx tsc --noEmit` — type check without building

## Project Structure
- `server/` — Node.js + Express + TypeScript backend
- `client/` — React + Vite + TypeScript frontend (Vite builds into `server/public/` for prod static serving)
- Single Docker container serves both in production
- External Postgres — not included in docker-compose

## Secrets & Security
- All secrets in `server/.env` (gitignored) — never commit
- Plaid tokens encrypted AES-256-GCM before DB storage
- PlaidItem requires userId — always scope Plaid queries by userId to prevent IDOR
- Production secrets will be stored in Vault on pi5-1.opsguy.io (not yet configured)

## Workflow Preferences
- User prefers direct inline execution over subagent review loops
- Don't ask permission before each individual file write — batch work and execute
- Don't stop to commit between every small change — commit logical chunks
- Don't ask clarifying questions mid-implementation — make reasonable decisions and proceed
