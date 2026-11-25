# syntax=docker/dockerfile:1
# Imagen de la PWA: build estático servido por Caddy/NGINX en el puerto 8080
FROM node:26-alpine AS build
WORKDIR /app
# Node 26 no trae corepack. La versión es la de packageManager.
RUN npm install -g pnpm@9.15.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/sdk/package.json packages/sdk/
COPY packages/domain/package.json packages/domain/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter web... --store-dir=/pnpm/store
COPY tsconfig.base.json ./
COPY packages/domain packages/domain
COPY packages/sdk packages/sdk
COPY apps/web apps/web
COPY integrations/raycast integrations/raycast
ARG GIT_COMMIT=unknown
ARG BUILD_TIME
ENV GIT_COMMIT=$GIT_COMMIT
ENV BUILD_TIME=$BUILD_TIME
ENV VITE_AUTH_MODE=session
ARG VITE_RECAPTCHA_SITE_KEY=
ENV VITE_RECAPTCHA_SITE_KEY=$VITE_RECAPTCHA_SITE_KEY
# Empty DSN: the PWA never loads Sentry.
ARG VITE_SENTRY_DSN=
ARG VITE_SENTRY_ENVIRONMENT=
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT
# true only when images.yml will upload them; the build fails if a map would be served.
ARG SENTRY_SOURCEMAPS=false
ENV SENTRY_SOURCEMAPS=$SENTRY_SOURCEMAPS
RUN pnpm --filter @reflexionia/domain build && pnpm --filter web build \
  && node apps/web/scripts/split-sourcemaps.mjs apps/web/dist /sourcemaps

# `--target sourcemaps --output type=local` exports the maps for sentry-cli.
FROM scratch AS sourcemaps
COPY --from=build /app/apps/web/dist /
COPY --from=build /sourcemaps /

FROM nginx:alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/security-headers.conf /etc/nginx/security-headers.conf
COPY apps/web/docker-entrypoint.d/40-deploy-sha.sh /docker-entrypoint.d/40-deploy-sha.sh
RUN chmod 755 /docker-entrypoint.d/40-deploy-sha.sh
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
