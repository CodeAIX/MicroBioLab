# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts ./apps/web/
COPY services/builder/package.json services/builder/tsconfig.json ./services/builder/
RUN npm ci
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY apps/web ./apps/web
RUN npm run build -w @microbio/shared && npm run build -w @microbio/web && npm run build -w @microbio/api
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=8080 WEB_ROOT=/app/apps/web/dist MIGRATIONS_DIR=/app/db/migrations
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /app/apps/api/dist ./dist
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --chown=node:node db/migrations ./db/migrations
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
