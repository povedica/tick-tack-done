# syntax=docker/dockerfile:1
# Imagen de la API (NestJS + servidor MCP en el mismo proceso, sección 4)
FROM node:26-alpine AS deps
WORKDIR /app
# Node 26 no trae corepack. La versión es la de packageManager.
RUN npm install -g pnpm@9.15.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
COPY packages/domain/package.json packages/domain/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter api... --store-dir=/pnpm/store

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/domain packages/domain
COPY apps/api apps/api
RUN pnpm --filter api build && pnpm --filter api exec prisma generate \
    && cp apps/api/src/auth/common-passwords.txt apps/api/dist/auth/common-passwords.txt

# pnpm 9 deploy isolates production dependencies, including the generated client.
RUN pnpm --filter api deploy --prod /runtime \
    && cp -R apps/api/dist /runtime/dist \
    && cp -R apps/api/prisma /runtime/prisma \
    && for client in /runtime/node_modules/.pnpm/@prisma+client*/node_modules; do \
         cp -R node_modules/.pnpm/@prisma+client*/node_modules/.prisma/. "$client/.prisma/"; \
       done

FROM node:26-alpine AS runner
WORKDIR /app
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown
ENV NODE_ENV=production
ENV GIT_COMMIT=$GIT_COMMIT
ENV BUILD_TIME=$BUILD_TIME
COPY --from=build --chown=node:node /runtime ./
USER node
# The entrypoint applies `prisma migrate deploy` before the process listens.
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma && node dist/main.js"]
