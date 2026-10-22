# Imagen de la PWA: build estático servido por Caddy/NGINX en el puerto 8080
FROM node:26-alpine AS build
WORKDIR /app
# Node 26 no trae corepack. La versión es la de packageManager.
RUN npm install -g pnpm@9.15.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/sdk/package.json packages/sdk/
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile --filter web...
COPY tsconfig.base.json ./
COPY packages/domain packages/domain
COPY packages/sdk packages/sdk
COPY apps/web apps/web
ARG GIT_COMMIT=unknown
ARG BUILD_TIME
ENV GIT_COMMIT=$GIT_COMMIT
ENV BUILD_TIME=$BUILD_TIME
ENV VITE_AUTH_MODE=session
RUN pnpm --filter @reflexionia/domain build && pnpm --filter web build

FROM nginx:alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
