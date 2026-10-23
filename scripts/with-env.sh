#!/usr/bin/env bash
# Loads the repo-root .env when it exists, then runs the given command.
# Prisma and the seed run from apps/api, which does not see the root file on its own.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
runtime_env="${RUNTIME_ENV_FILE:-$ROOT/.env}"
if [[ -n "${RUNTIME_ENV_FILE:-}" && ! -r "$runtime_env" ]]; then
  echo "RUNTIME_ENV_FILE is not readable" >&2
  exit 1
fi
if [[ -f "$runtime_env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$runtime_env"
  set +a
fi
exec "$@"
