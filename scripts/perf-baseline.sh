#!/usr/bin/env bash
# Reproduces the F1 calendar baseline against an ephemeral Postgres.
# Never points at production or at the developer's database.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PG_NAME=ttd-f1-perf-pg
REDIS_NAME=ttd-f1-perf-redis
API_NAME=ttd-f1-perf-api
HTTP_NAME=ttd-f1-perf-http
TLS_NAME=ttd-f1-perf-tls
NETWORK=ttd-f1-perf
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/ttd-f1-perf.XXXXXX")"
DATE="$(date +%F)"
REPORT="$ROOT/docs/perf/${DATE}-linea-base.md"

cleanup() {
  local status=$?
  if [[ $status -ne 0 ]]; then
    mkdir -p "$ROOT/docs/perf"
    docker logs "$API_NAME" >"$ROOT/docs/perf/api-fail.log" 2>&1 || true
    docker logs "$HTTP_NAME" >"$ROOT/docs/perf/http-fail.log" 2>&1 || true
    docker logs "$TLS_NAME" >"$ROOT/docs/perf/tls-fail.log" 2>&1 || true
  fi
  docker rm -f "$TLS_NAME" "$HTTP_NAME" "$API_NAME" "$PG_NAME" "$REDIS_NAME" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

docker rm -f "$TLS_NAME" "$HTTP_NAME" "$API_NAME" "$PG_NAME" "$REDIS_NAME" >/dev/null 2>&1 || true
docker network rm "$NETWORK" >/dev/null 2>&1 || true
docker network create "$NETWORK" >/dev/null
docker run -d --name "$PG_NAME" --network "$NETWORK" --network-alias perf-pg \
  -e POSTGRES_USER=reflexionia -e POSTGRES_PASSWORD=perf -e POSTGRES_DB=reflexionia_perf \
  -p 127.0.0.1:54329:5432 postgres:17-alpine >/dev/null
docker run -d --name "$REDIS_NAME" --network "$NETWORK" --network-alias perf-redis \
  -p 127.0.0.1:63799:6379 redis:7-alpine >/dev/null

for _ in $(seq 1 40); do
  if docker exec "$PG_NAME" pg_isready -U reflexionia >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$PG_NAME" pg_isready -U reflexionia >/dev/null

node_run() {
  docker run --rm --network "$NETWORK" \
    -v "$ROOT:/repo" \
    -v ttd-f1_dev_node_modules:/repo/node_modules \
    -v ttd-f1_dev_api_node_modules:/repo/apps/api/node_modules \
    -v ttd-f1_dev_web_node_modules:/repo/apps/web/node_modules \
    -v ttd-f1_dev_domain_node_modules:/repo/packages/domain/node_modules \
    -v ttd-f1_dev_sdk_node_modules:/repo/packages/sdk/node_modules \
    -v "$WORKDIR:/perf" \
    -e DATABASE_URL=postgresql://reflexionia:perf@perf-pg:5432/reflexionia_perf \
    -e REDIS_URL=redis://perf-redis:6379 \
    -e PERF_SEED=ephemeral \
    -e PERF_SEED_PASSWORD="${PERF_SEED_PASSWORD}" \
    -e IN_NODE_26=1 \
    -e BUS_AUTOSTART=false \
    -e SCHEDULER_AUTOSTART=false \
    -e NODE_ENV=development \
    -e AUTH_MODE=session \
    -w /repo \
    node:26-alpine \
    /repo/scripts/node-entrypoint.sh "$@"
}

export PERF_SEED_PASSWORD
PERF_SEED_PASSWORD="$(openssl rand -hex 18)"

node_run pnpm --filter api exec prisma migrate deploy
node_run pnpm --filter @reflexionia/domain build
node_run pnpm --filter api build

seed_profile() {
  local profile="$1"
  node_run env \
    PERF_PROFILE="$profile" \
    PERF_MANIFEST=/perf/manifest.json \
    PERF_TOKEN_FILE=/perf/token \
    PERF_SESSION_FILE=/perf/session.json \
    pnpm --filter api exec tsx ../../scripts/seed-perf.ts
}

run_web() {
  local profile="$1"
  local result="$2"
  docker rm -f "$TLS_NAME" "$HTTP_NAME" >/dev/null 2>&1 || true
  # Session cookies are __Host- and Secure. The browser must speak HTTPS.
  docker run -d --name "$HTTP_NAME" --network "$NETWORK" --network-alias perf-http \
    -v "$ROOT:/repo" \
    -v ttd-f1_dev_node_modules:/repo/node_modules \
    -v ttd-f1_dev_api_node_modules:/repo/apps/api/node_modules \
    -v ttd-f1_dev_web_node_modules:/repo/apps/web/node_modules \
    -v ttd-f1_dev_domain_node_modules:/repo/packages/domain/node_modules \
    -v ttd-f1_dev_sdk_node_modules:/repo/packages/sdk/node_modules \
    -e VITE_API_PROXY=http://perf-api:3099 \
    -e IN_NODE_26=1 \
    -w /repo \
    node:26-alpine \
    /repo/scripts/node-entrypoint.sh pnpm --filter web exec vite preview --host 0.0.0.0 --port 4174 >/dev/null
  docker run -d --name "$TLS_NAME" --network "$NETWORK" --network-alias perf-web \
    --entrypoint caddy \
    caddy:2-alpine \
    reverse-proxy --from https://perf-web:4443 --to http://perf-http:4174 --internal-certs --disable-redirects >/dev/null
  local version
  version="$(docker run --rm \
    -v "$ROOT:/repo" \
    -v ttd-f1_dev_node_modules:/repo/node_modules \
    -v ttd-f1_dev_web_node_modules:/repo/apps/web/node_modules \
    node:26-alpine node -p "require('/repo/apps/web/node_modules/@playwright/test/package.json').version")"
  echo "Playwright ${version}"
  docker run --rm --network "$NETWORK" --shm-size=2g \
    -v "$ROOT:/repo" \
    -v "$WORKDIR:/perf" \
    -e PLAYWRIGHT_BASE_URL=https://perf-web:4443 \
    -e PERF_MANIFEST=/perf/manifest.json \
    -e PERF_SESSION_FILE=/perf/session.json \
    -e PERF_WEB_RESULT="/perf/${result}" \
    -e PERF_PROFILE="$profile" \
    -w /repo/apps/web \
    "mcr.microsoft.com/playwright:v${version}-jammy" \
    bash -lc "npm install --prefix /tmp/pw --no-save @playwright/test@${version} && mkdir -p /node_modules && ln -s /tmp/pw/node_modules/@playwright /node_modules/@playwright && /tmp/pw/node_modules/.bin/playwright test --config playwright.perf.config.ts"
  docker rm -f "$TLS_NAME" "$HTTP_NAME" >/dev/null 2>&1 || true
}

start_api() {
  docker rm -f "$API_NAME" >/dev/null 2>&1 || true
  docker run -d --name "$API_NAME" --network "$NETWORK" --network-alias perf-api \
    -p 127.0.0.1:3099:3099 \
    -v "$ROOT:/repo" \
    -v ttd-f1_dev_node_modules:/repo/node_modules \
    -v ttd-f1_dev_api_node_modules:/repo/apps/api/node_modules \
    -v ttd-f1_dev_web_node_modules:/repo/apps/web/node_modules \
    -v ttd-f1_dev_domain_node_modules:/repo/packages/domain/node_modules \
    -v ttd-f1_dev_sdk_node_modules:/repo/packages/sdk/node_modules \
    -e DATABASE_URL=postgresql://reflexionia:perf@perf-pg:5432/reflexionia_perf \
    -e REDIS_URL=redis://perf-redis:6379 \
    -e IN_NODE_26=1 \
    -e BUS_AUTOSTART=false \
    -e SCHEDULER_AUTOSTART=false \
    -e NODE_ENV=development \
    -e AUTH_MODE=session \
    -e PORT=3099 \
    -w /repo \
    node:26-alpine \
    /repo/scripts/node-entrypoint.sh pnpm --filter api start >/dev/null
  for _ in $(seq 1 40); do
    if curl -sf -o /dev/null http://127.0.0.1:3099/api/v1/health; then
      return
    fi
    sleep 1
  done
  docker logs "$API_NAME"
  echo "API did not become healthy" >&2
  exit 1
}

ensure_k6() {
  if command -v k6 >/dev/null 2>&1; then
    return
  fi
  local arch os asset
  arch="$(uname -m)"
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$arch" in
    arm64 | aarch64) arch=arm64 ;;
    x86_64) arch=amd64 ;;
  esac
  case "$os" in
    darwin) os=macos ;;
  esac
  asset="k6-v0.57.0-${os}-${arch}.zip"
  curl -fsSL -o "$WORKDIR/k6.zip" "https://github.com/grafana/k6/releases/download/v0.57.0/${asset}"
  unzip -q "$WORKDIR/k6.zip" -d "$WORKDIR/k6-dist"
  install -m 755 "$WORKDIR/k6-dist/k6-v0.57.0-${os}-${arch}/k6" "$WORKDIR/k6"
  export PATH="$WORKDIR:$PATH"
}

echo "Seeding profile s"
seed_profile s
echo "Building the production web bundle"
node_run env VITE_API_PROXY=http://perf-api:3099 pnpm --filter web build
echo "Starting the API"
start_api
echo "Measuring profile s"
run_web s web-s.json

docker rm -f "$API_NAME" >/dev/null 2>&1 || true
seed_profile x100
start_api
run_web x100 web-x100.json

ensure_k6
TTD_TOKEN="$(cat "$WORKDIR/token")" \
  TTD_BASE=http://127.0.0.1:3099 \
  TTD_MANIFEST="$WORKDIR/manifest.json" \
  TTD_SUMMARY_PATH="$WORKDIR/k6.json" \
  TTD_OPENS=8 \
  k6 run "$ROOT/scripts/perf/k6-vista-anual.js"

mkdir -p "$ROOT/docs/perf"
node "$ROOT/scripts/perf/write-baseline-report.mjs" \
  "$WORKDIR/manifest.json" \
  "$WORKDIR/k6.json" \
  "$WORKDIR/web-s.json" \
  "$WORKDIR/web-x100.json" \
  "$REPORT" \
  "$(git rev-parse --short HEAD)"
echo "Baseline written to $REPORT"
