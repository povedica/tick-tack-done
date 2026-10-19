# Imagen de la API (NestJS + servidor MCP en el mismo proceso, sección 4)
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile --filter api...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/domain packages/domain
COPY apps/api apps/api
RUN pnpm --filter api build && pnpm --filter api exec prisma generate

FROM node:22-alpine AS runner
WORKDIR /app
ARG GIT_COMMIT=unknown
ENV NODE_ENV=production
ENV GIT_COMMIT=$GIT_COMMIT
RUN corepack enable
COPY --from=build /app ./
RUN chown -R node:node /app
USER node
# The entrypoint applies `prisma migrate deploy` before the process listens.
CMD ["sh", "-c", "pnpm --filter api exec prisma migrate deploy && node apps/api/dist/main.js"]
