# Imagen de la PWA: build estático servido por Caddy/NGINX en el puerto 8080
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/sdk/package.json packages/sdk/
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile --filter web...
COPY tsconfig.base.json ./
COPY packages/domain packages/domain
COPY packages/sdk packages/sdk
COPY apps/web apps/web
ENV VITE_AUTH_MODE=session
RUN pnpm --filter web build

FROM nginx:alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
