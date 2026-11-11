#!/usr/bin/env bash
# Starts Postgres, Redis, Mailpit and the app. The app runs in node:26-alpine.
# HOST_NODE=1 keeps the previous layout: infra in Docker, API and web on the host.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

compose_file="docker-compose.dev.yml"
compose_project=()
# Solo un worktree enlazado usa su compose local. El checkout principal
# sigue en docker-compose.dev.yml aunque ese archivo exista.
if [[ -f "$ROOT/docker-compose.worktree.local.yml" ]] \
  && [[ "$(git rev-parse --git-dir)" != "$(git rev-parse --git-common-dir)" ]]; then
  compose_file="docker-compose.worktree.local.yml"
  project="${COMPOSE_PROJECT_NAME:-}"
  if [[ -z "$project" && -f "$ROOT/.env" ]]; then
    project="$(grep -E '^COMPOSE_PROJECT_NAME=' "$ROOT/.env" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  fi
  compose_project=(-p "${project:-$(basename "$ROOT")}")
fi
compose_files=(-f "$compose_file")
if [[ -f "$ROOT/.env-config/compose.database.yml" ]]; then
  compose_files+=(-f "$ROOT/.env-config/compose.database.yml")
fi

if [[ -n "${HOST_NODE:-}" ]]; then
  docker compose "${compose_project[@]}" "${compose_files[@]}" up -d postgres redis mailpit
  exec pnpm --filter api --filter web --parallel dev
fi

exec docker compose "${compose_project[@]}" "${compose_files[@]}" up "$@"
