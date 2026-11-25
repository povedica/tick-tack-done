#!/usr/bin/env bash
set +x
set -euo pipefail
: "${RUNTIME_ENV_FILE:?Set private staging env file}"
case "$RUNTIME_ENV_FILE" in */staging.env) ;; *) echo 'Expected separate staging.env' >&2; exit 64 ;; esac
# Compose dotenv output uses quotes; accept only the expected isolated values.
root="$(cd "$(dirname "$0")/../.." && pwd)"
export DEPLOY_ENVIRONMENT=staging
# Sentry smoke (CA-14): after health, staging only, inside the container. It never fails the deploy.
# shellcheck disable=SC2329 # Hook called by the shared deploy engine.
after_success() {
  compose exec -T staging-api timeout 30 node dist/scripts/sentry-smoke.js \
    || echo 'Sentry smoke did not finish; deployment continues' >&2
}
# shellcheck source=deploy/lib/deploy.sh
source "$root/deploy/lib/deploy.sh"
