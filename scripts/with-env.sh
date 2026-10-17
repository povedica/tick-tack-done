#!/usr/bin/env bash
# Loads the repo-root .env when it exists, then runs the given command.
# Prisma and the seed run from apps/api, which does not see the root file on its own.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
exec "$@"
