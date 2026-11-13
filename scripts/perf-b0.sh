#!/usr/bin/env bash
# Times the year summary and a month page on an ephemeral x100 seed.
# Compares source tables with a throwaway bake table. Drops both when it exits.
# Never points at production, port 4173, or the developer's database.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PG_NAME=ttd-f1-b0-pg
NETWORK=ttd-f1-b0
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/ttd-f1-b0.XXXXXX")"

cleanup() {
  command docker rm -f "$PG_NAME" >/dev/null 2>&1 || true
  command docker network rm "$NETWORK" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

command docker rm -f "$PG_NAME" >/dev/null 2>&1 || true
command docker network rm "$NETWORK" >/dev/null 2>&1 || true
command docker network create "$NETWORK" >/dev/null
command docker run -d --name "$PG_NAME" --network "$NETWORK" --network-alias perf-pg \
  -e POSTGRES_USER=reflexionia -e POSTGRES_PASSWORD=perf -e POSTGRES_DB=reflexionia_perf \
  postgres:17-alpine >/dev/null

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
    -e PERF_SEED=ephemeral \
    -e PERF_SEED_PASSWORD="${PERF_SEED_PASSWORD}" \
    -e PERF_PROFILE=x100 \
    -e PERF_MANIFEST=/perf/manifest.json \
    -e PERF_TOKEN_FILE=/perf/token \
    -e PERF_SESSION_FILE=/perf/session.json \
    -e IN_NODE_26=1 \
    -w /repo \
    node:26-alpine \
    /repo/scripts/node-entrypoint.sh "$@"
}

PERF_SEED_PASSWORD="$(openssl rand -hex 18)"
export PERF_SEED_PASSWORD

node_run pnpm --filter @reflexionia/domain build
node_run pnpm --filter api exec prisma migrate deploy
node_run pnpm --filter api exec tsx ../../scripts/seed-perf.ts
node_run pnpm --filter api exec tsx src/perf/b0-measure.ts
