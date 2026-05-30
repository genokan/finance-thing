# syntax=docker/dockerfile:1

# ---------- Stage 1: build the React client ----------
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
# Vite is configured to emit into ../server/public
RUN mkdir -p /app/server && npm run build

# ---------- Stage 2: build the server ----------
FROM node:22-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate && npm run build

# ---------- Stage 3: runtime ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/server

# Production dependencies only
COPY server/package*.json ./
RUN npm ci --omit=dev

# Prisma schema + generated client are needed at runtime
COPY server/prisma ./prisma
RUN npx prisma generate

# Compiled server + compiled client assets
COPY --from=server-build /app/server/dist ./dist
COPY --from=client-build /app/server/public ./public

# tsx is needed to run the TypeScript seed script at startup
RUN npm i -g tsx@4

EXPOSE 3000
# On boot: sync schema, seed the initial user if SEED_* are set (idempotent — skips
# if the user already exists), then start. No tunnel needed: the container runs on
# the homelab network and reaches Postgres directly.
CMD ["sh", "-c", "npx prisma db push --skip-generate && (if [ -n \"$SEED_EMAIL\" ] && [ -n \"$SEED_PASSWORD\" ]; then tsx prisma/seed.ts; fi) && node dist/index.js"]
