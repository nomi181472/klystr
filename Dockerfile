# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS shell-builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_TOPOLOGY_REMOTE_ENTRY
ARG NEXT_PUBLIC_RBAC_REMOTE_ENTRY
ARG NEXT_PUBLIC_IMAGES_REMOTE_ENTRY
ARG NEXT_PUBLIC_MANIFESTS_REMOTE_ENTRY
ARG NEXT_PUBLIC_SECURITY_REMOTE_ENTRY
ENV NEXT_PUBLIC_TOPOLOGY_REMOTE_ENTRY=${NEXT_PUBLIC_TOPOLOGY_REMOTE_ENTRY}
ENV NEXT_PUBLIC_RBAC_REMOTE_ENTRY=${NEXT_PUBLIC_RBAC_REMOTE_ENTRY}
ENV NEXT_PUBLIC_IMAGES_REMOTE_ENTRY=${NEXT_PUBLIC_IMAGES_REMOTE_ENTRY}
ENV NEXT_PUBLIC_MANIFESTS_REMOTE_ENTRY=${NEXT_PUBLIC_MANIFESTS_REMOTE_ENTRY}
ENV NEXT_PUBLIC_SECURITY_REMOTE_ENTRY=${NEXT_PUBLIC_SECURITY_REMOTE_ENTRY}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS shell-runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=shell-builder --chown=nextjs:nodejs /app/public ./public
COPY --from=shell-builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=shell-builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/healthz').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "server.js"]

FROM node:22-bookworm-slim AS remote-builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG REMOTE_NAME
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN rm -f apps/${REMOTE_NAME}-remote/next.config.compiled.js \
  && npm run build:${REMOTE_NAME}-remote

FROM node:22-bookworm-slim AS remote-runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3001
ARG REMOTE_NAME
ENV REMOTE_NAME=${REMOTE_NAME}

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=remote-builder --chown=nextjs:nodejs /app/apps/${REMOTE_NAME}-remote/.next/standalone ./
COPY --from=remote-builder --chown=nextjs:nodejs /app/apps/${REMOTE_NAME}-remote/.next/static ./apps/${REMOTE_NAME}-remote/.next/static
COPY --from=remote-builder --chown=nextjs:nodejs /app/public ./apps/${REMOTE_NAME}-remote/public

USER nextjs
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health/healthz').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["sh", "-c", "node apps/${REMOTE_NAME}-remote/server.js"]

# Preserve the original default target for `docker build .` and existing CI.
FROM shell-runner AS runner
