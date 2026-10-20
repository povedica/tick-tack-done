#!/usr/bin/env bash
# Runs a command on Node 26.
# GitHub Actions already pins Node 26, so CI executes on the runner.
# On a laptop the command runs in node:26-alpine (same image as the Dockerfiles).
# HOST_NODE=1 forces the host Node. Inside the container IN_NODE_26 skips Docker.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ $# -eq 0 ]]; then
  echo "usage: scripts/with-node.sh <command> [args...]" >&2
  exit 64
fi

if [[ -n "${CI:-}" || -n "${HOST_NODE:-}" || -n "${IN_NODE_26:-}" ]]; then
  if [[ -z "${IN_NODE_26:-}" && -f "$ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT/.env"
    set +a
  fi
  exec "$@"
fi

compose_file="docker-compose.dev.yml"
compose_args=(-f "$compose_file")
if [[ -f "$ROOT/docker-compose.worktree.local.yml" ]]; then
  compose_file="docker-compose.worktree.local.yml"
  compose_args=(-p "${COMPOSE_PROJECT_NAME:-$(basename "$ROOT")}" -f "$compose_file")
fi
exec docker compose "${compose_args[@]}" run --rm node "$@"
