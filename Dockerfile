# syntax=docker/dockerfile:1

# ── Build ────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/engine/package.json ./packages/engine/
COPY apps/server/package.json  ./apps/server/
COPY apps/web/package.json     ./apps/web/
RUN npm ci

COPY . .
RUN npm run build

# Deja sólo las dependencias de producción para copiar al runtime.
RUN npm prune --omit=dev

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV MEDIA_DIR=/data/media

RUN apk add --no-cache tini \
 && mkdir -p /data/media \
 && chown -R node:node /data

COPY --from=build --chown=node:node /app/node_modules      ./node_modules
COPY --from=build --chown=node:node /app/package.json      ./package.json
COPY --from=build --chown=node:node /app/packages          ./packages
COPY --from=build --chown=node:node /app/apps/server/dist  ./apps/server/dist
COPY --from=build --chown=node:node /app/apps/server/package.json ./apps/server/
# Applied at boot. Without these the container starts against an empty database.
COPY --from=build --chown=node:node /app/apps/server/migrations ./apps/server/migrations
COPY --from=build --chown=node:node /app/apps/web/dist     ./apps/web/dist

USER node
EXPOSE 3000
VOLUME ["/data/media"]

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/server/dist/main.js"]
