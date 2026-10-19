#!/usr/bin/env bash
# Starts Postgres, Redis, Mailpit and the app. The app runs in node:26-alpine.
# HOST_NODE=1 keeps the previous layout: infra in Docker, API and web on the host.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

compose_file="docker-compose.dev.yml"
compose_project=()
if [[ -f "$ROOT/docker-compose.worktree.local.yml" ]]; then
  compose_file="docker-compose.worktree.local.yml"
  compose_project=(-p "${COMPOSE_PROJECT_NAME:-ttd-audit}")
fi

if [[ -n "${HOST_NODE:-}" ]]; then
  docker compose "${compose_project[@]}" -f "$compose_file" up -d postgres redis mailpit
  exec pnpm --filter api --filter web --parallel dev
fi

exec docker compose "${compose_project[@]}" -f "$compose_file" up "$@"
