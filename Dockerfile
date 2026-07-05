# syntax=docker/dockerfile:1

# Fully JS/WASM dependency tree (bcryptjs, Prisma 7's WASM compiler) — no
# native modules, so multi-arch builds never compile anything under QEMU.
#
# npm workspaces: the single lockfile lives at the repo root, so installs run
# from the root with the workspace package.json manifests in place.

# ---------- Stage 1: build client + server ----------
FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci
COPY client/ client/
COPY server/ server/
# Generate the Prisma client first (server tsc needs its types), then build
# the client (Vite emits into server/public) and compile the server. The dummy
# DATABASE_URL only satisfies prisma.config.ts — generate never connects.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run db:generate -w server && npm run build

# ---------- Stage 2: runtime ----------
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Prisma's schema engine (db push) needs OpenSSL to negotiate TLS/detect libssl.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Server production dependencies only. The prisma CLI stays for the boot-time
# `db push`; the generated client is already compiled inside dist (Prisma 7 is
# WASM — nothing platform-specific to regenerate).
COPY package*.json ./
COPY client/package.json client/
COPY server/package.json server/
# After installing, drop the bundled npm/corepack toolchain: nothing at
# runtime needs it (prisma runs from its bin link) and its bundled deps
# (sigstore, picomatch, …) otherwise show up in vulnerability scans.
RUN npm ci --omit=dev -w server && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn*

# Prisma schema + config for the boot-time `db push`
COPY server/prisma server/prisma
COPY server/prisma.config.ts server/

# Compiled server (includes dist/seed.js + generated client) + client assets
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/public server/public
COPY --chmod=755 docker/entrypoint.sh /app/entrypoint.sh

# Unprivileged user — the app only reads from disk, so root ownership is fine
# (a recursive chown would duplicate the node_modules layer).
USER node
WORKDIR /app/server

EXPOSE 3000

# Liveness probe via node's built-in fetch (slim has no wget/curl); the
# endpoint also verifies the database connection.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The entrypoint script announces each boot step (env validation → schema
# sync → optional seed → exec server). A script instead of an inline sh -c
# chain: orchestrator UIs (Portainer) flatten CMD strings and mangle the
# quoting if re-applied, and exec gives the server PID 1 signal handling.
ENTRYPOINT ["/app/entrypoint.sh"]
