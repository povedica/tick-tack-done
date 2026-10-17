# Imagen de la PWA: build estático servido por Caddy/NGINX en el puerto 8080
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/sdk/package.json packages/sdk/
RUN pnpm install --frozen-lockfile --filter web...
COPY tsconfig.base.json ./
COPY packages/sdk packages/sdk
COPY apps/web apps/web
RUN pnpm --filter web build

FROM nginx:alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
