#!/usr/bin/env bash
# Summary and range against an ephemeral x100 seed.
# Drops the database on exit. Never uses port 4173, production, or the developer's data.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PG_NAME=ttd-f6-pg
REDIS_NAME=ttd-f6-redis
API_NAME=ttd-f6-api
NETWORK=ttd-f6
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/ttd-f6.XXXXXX")"

cleanup() {
  command docker rm -f "$API_NAME" "$PG_NAME" "$REDIS_NAME" >/dev/null 2>&1 || true
  command docker network rm "$NETWORK" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

command docker rm -f "$API_NAME" "$PG_NAME" "$REDIS_NAME" >/dev/null 2>&1 || true
command docker network rm "$NETWORK" >/dev/null 2>&1 || true
command docker network create "$NETWORK" >/dev/null
command docker run -d --name "$PG_NAME" --network "$NETWORK" --network-alias perf-pg \
  -e POSTGRES_USER=reflexionia -e POSTGRES_PASSWORD=perf -e POSTGRES_DB=reflexionia_perf \
  postgres:17-alpine >/dev/null
command docker run -d --name "$REDIS_NAME" --network "$NETWORK" --network-alias perf-redis \
  redis:7-alpine >/dev/null

for _ in $(seq 1 40); do
  if command docker exec "$PG_NAME" pg_isready -U reflexionia >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
command docker exec "$PG_NAME" pg_isready -U reflexionia >/dev/null

node_run() {
  command docker run --rm --network "$NETWORK" \
    -v "$ROOT:/repo" \
    -v ttd-f1_dev_node_modules:/repo/node_modules \
    -v ttd-f1_dev_api_node_modules:/repo/apps/api/node_modules \
    -v ttd-f1_dev_domain_node_modules:/repo/packages/domain/node_modules \
    -v ttd-f1_dev_sdk_node_modules:/repo/packages/sdk/node_modules \
    -v "$WORKDIR:/perf" \
    -e DATABASE_URL=postgresql://reflexionia:perf@perf-pg:5432/reflexionia_perf \
    -e REDIS_URL=redis://perf-redis:6379 \
    -e PERF_SEED=ephemeral \
    -e PERF_SEED_PASSWORD="${PERF_SEED_PASSWORD}" \
    -e PERF_PROFILE=x100 \
    -e PERF_MANIFEST=/perf/manifest.json \
    -e PERF_TOKEN_FILE=/perf/token \
    -e PERF_SESSION_FILE=/perf/session.json \
    -e PERF_API_BASE=http://perf-api:3099 \
    -e IN_NODE_26=1 \
    -e BUS_AUTOSTART=false \
    -e SCHEDULER_AUTOSTART=false \
    -w /repo \
    node:26-alpine \
    /repo/scripts/node-entrypoint.sh "$@"
}

PERF_SEED_PASSWORD="$(openssl rand -hex 18)"
export PERF_SEED_PASSWORD

node_run pnpm --filter @reflexionia/domain build
node_run pnpm --filter api exec prisma generate
node_run pnpm --filter api exec prisma migrate deploy
node_run pnpm --filter api exec tsx ../../scripts/seed-perf.ts
node_run pnpm --filter api build
command docker rm -f "$API_NAME" >/dev/null 2>&1 || true
command docker run -d --name "$API_NAME" --network "$NETWORK" --network-alias perf-api \
  -v "$ROOT:/repo" \
  -v ttd-f1_dev_node_modules:/repo/node_modules \
  -v ttd-f1_dev_api_node_modules:/repo/apps/api/node_modules \
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

ready=0
for _ in $(seq 1 60); do
  if command docker run --rm --network "$NETWORK" node:26-alpine \
    node -e "fetch('http://perf-api:3099/api/v1/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "$ready" -ne 1 ]]; then
  command docker logs "$API_NAME"
  exit 1
fi

node_run pnpm --filter api exec tsx src/perf/zoom-walk.ts
command docker run --rm --network "$NETWORK" \
  -v "$ROOT:/repo" \
  -v "$WORKDIR:/perf" \
  -e TTD_EPHEMERAL=1 \
  -e TTD_BASE=http://perf-api:3099 \
  -e TTD_TOKEN="$(cat "$WORKDIR/token")" \
  -e TTD_YEAR=2026 \
  grafana/k6 run /repo/scripts/perf/k6-calendar-zoom.js
