#!/usr/bin/env bash
# Starts Postgres, Redis, Mailpit and the app. The app runs in node:26-alpine.
# HOST_NODE=1 keeps the previous layout: infra in Docker, API and web on the host.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -n "${HOST_NODE:-}" ]]; then
  docker compose -f docker-compose.dev.yml up -d postgres redis mailpit
  exec pnpm --filter api --filter web --parallel dev
fi

exec docker compose -f docker-compose.dev.yml up "$@"
