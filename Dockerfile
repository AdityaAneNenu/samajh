# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Samajh — three stages: install, build, run.
#
# No secret is ever baked into an image layer. The AI_* values are read from the
# environment at run time, so the same image can be deployed anywhere.
# ---------------------------------------------------------------------------

# --- dependencies ----------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Full install: the build needs the dev dependencies (TypeScript, Tailwind).
RUN npm ci --no-audit --no-fund

# --- build -----------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- run -------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Containers must listen on all interfaces, not just loopback.
ENV HOSTNAME=0.0.0.0

# Run as a non-root user that owns nothing but its own directory.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# `output: "standalone"` traces exactly the files the server needs, so no
# node_modules directory is copied into the final image.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Liveness and readiness are both served by /api/health.
CMD ["node", "server.js"]