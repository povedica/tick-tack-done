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

# op run exports values to this process; forward only schema names to Node.
# The temporary override contains names only, never their values.
if [[ -n "${APP_SECRET:-}" ]]; then
  override=$(mktemp)
  trap 'rm -f "$override"' EXIT
  printf 'services:\n  node:\n    environment:\n' > "$override"
  while IFS='=' read -r key _; do
    [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || continue
    case "$key" in DATABASE_URL|REDIS_URL|SMTP_HOST) continue ;; esac
    if printenv "$key" >/dev/null; then
      printf '      %s: null\n' "$key" >> "$override"
    fi
  done < .env.example
  compose_files+=(-f "$override")
fi
docker compose "${compose_project[@]}" "${compose_files[@]}" up "$@"
