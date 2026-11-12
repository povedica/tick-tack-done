#!/usr/bin/env bash
set +x
set -euo pipefail
: "${RUNTIME_ENV_FILE:?Set private staging env file}"
case "$RUNTIME_ENV_FILE" in */staging.env) ;; *) echo 'Expected separate staging.env' >&2; exit 64 ;; esac
# Compose dotenv output uses quotes; accept only the expected isolated values.
root="$(cd "$(dirname "$0")/../.." && pwd)"
export DEPLOY_ENVIRONMENT=staging
# shellcheck source=deploy/lib/deploy.sh
source "$root/deploy/lib/deploy.sh"
