# finance-thing

## Infrastructure
- Postgres runs in Docker on `pi5-1.opsguy.io` (container name: `postgres`), accessible at `pg1.opsguy.io:5432` from the homelab network only
- To reach Postgres from this Mac: `ssh -i ~/.ssh/id_ed25519 -f -N -L 15432:127.0.0.1:5432 bcant@pi5-1.opsguy.io`, then use `localhost:15432`
- SSH user on pi5-1: `bcant@pi5-1.opsguy.io`
- DB user: `finance_thing`, password in `server/.env` (gitignored)
- Prisma migrations: use `prisma db push` (not `migrate dev` — non-interactive environment)
- finance_thing user needs CREATEDB privilege for Prisma shadow database

## Dev Commands
- `cd server && npm run dev` — start backend (requires tunnel or homelab network access)
- `cd server && SEED_EMAIL=x SEED_PASSWORD=y npm run db:seed` — create initial user
- `cd server && npx tsc --noEmit` — type check without building
- Override DB for tunnel: `DATABASE_URL="postgresql://finance_thing:<pw>@localhost:15432/finance_thing" npx prisma ...`

## Project Structure
- `server/` — Node.js + Express + TypeScript backend
- `client/` — React + Vite frontend (not yet built)
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
