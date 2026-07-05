#!/bin/sh
# finance-thing container entrypoint. Runs from /app/server.
#
# Boot sequence (each step announces itself):
#   1. Validate required environment variables — fail fast with names, not stack traces.
#   2. Sync the database schema (prisma db push). Opt out with AUTO_MIGRATE=false.
#   3. Seed the bootstrap admin if SEED_EMAIL/SEED_PASSWORD are set (idempotent).
#   4. exec the server so it runs as PID 1 and receives signals directly.
set -e

echo "[entrypoint] finance-thing starting (NODE_ENV=${NODE_ENV:-unset})"

missing=""
for var in DATABASE_URL JWT_SECRET JWT_REFRESH_SECRET ENCRYPTION_KEY; do
  eval "value=\${$var:-}"
  [ -z "$value" ] && missing="$missing $var"
done
if [ -n "$missing" ]; then
  echo "[entrypoint] FATAL — missing required environment variables:$missing" >&2
  echo "[entrypoint] Set them in your orchestrator (Portainer stack env, compose env_file, or -e flags)." >&2
  echo "[entrypoint] See server/.env.example in the repo for the full list and formats." >&2
  exit 1
fi

if [ "${AUTO_MIGRATE:-true}" = "true" ]; then
  echo "[entrypoint] syncing database schema (prisma db push — set AUTO_MIGRATE=false to skip)"
  /app/node_modules/.bin/prisma db push
else
  echo "[entrypoint] AUTO_MIGRATE=false — skipping schema sync"
fi

if [ -n "${SEED_EMAIL:-}" ] && [ -n "${SEED_PASSWORD:-}" ]; then
  echo "[entrypoint] ensuring bootstrap admin user exists (idempotent)"
  node dist/seed.js
fi

echo "[entrypoint] starting server on port ${PORT:-3000}"
exec node dist/index.js
