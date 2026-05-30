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

EXPOSE 3000
# Apply schema then start (db push is safe/idempotent against the external DB)
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
