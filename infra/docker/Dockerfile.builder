# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY services/builder/package.json services/builder/tsconfig.json ./services/builder/
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts ./apps/web/
RUN npm ci
COPY packages/shared ./packages/shared
COPY services/builder ./services/builder
RUN npm run build -w @microbio/shared && npm run build -w @microbio/builder
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production BUILDER_NODE_MODULES=/app/node_modules
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /app/services/builder/package.json ./services/builder/package.json
COPY --from=build --chown=node:node /app/services/builder/dist ./services/builder/dist
USER node
CMD ["node", "services/builder/dist/index.js"]
