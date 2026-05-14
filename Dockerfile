# syntax=docker/dockerfile:1.7
# ---- Web (Next.js standalone) ----
FROM node:20-alpine AS base
# yt-dlp + python3 are needed by `probeYoutube` (sync probe in POST /api/reels).
# Install yt-dlp + bgutil-ytdlp-pot-provider plugin via pip so we can use the
# Proof-of-Origin token sidecar to bypass YouTube's bot check from datacenter IPs.
RUN apk add --no-cache libc6-compat python3 py3-pip ca-certificates \
  && pip3 install --break-system-packages --no-cache-dir -U yt-dlp bgutil-ytdlp-pot-provider
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# --- deps: install all workspace deps from manifests only (cacheable) ---
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY apps/remotion/package.json apps/remotion/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/services/package.json packages/services/
RUN pnpm install --frozen-lockfile

# --- build: copy sources & build Next standalone output ---
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app /app
COPY . .
RUN pnpm --filter @rush/web build

# --- runtime: minimal image ---
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat python3 py3-pip ca-certificates \
  && pip3 install --break-system-packages --no-cache-dir -U yt-dlp bgutil-ytdlp-pot-provider
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output: server.js at apps/web/, traced node_modules at root
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
# (no public/ yet — uncomment when added)
# COPY --from=build /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

