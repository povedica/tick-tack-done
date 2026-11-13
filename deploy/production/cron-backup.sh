#!/usr/bin/env bash
# Daily RF-1704 backup using structured Compose env, never shell sourcing.
set +x
set -euo pipefail
: "${APP_DIR:?Set APP_DIR}"
: "${RUNTIME_ENV_FILE:?Set RUNTIME_ENV_FILE}"
cd "$APP_DIR"
root=$PWD
file=deploy/production/docker-compose.yml
project=todo
api=api
state="$(dirname "$RUNTIME_ENV_FILE")/.ttd-deploy-production/last-good.env"
while IFS='=' read -r key value; do
  case "$key" in API_IMAGE|WEB_IMAGE) export "$key=$value" ;; *) exit 64 ;; esac
done < "$state"
compose() { docker compose -p "$project" -f "$file" --env-file "$RUNTIME_ENV_FILE" "$@"; }
# shellcheck source=deploy/lib/migrate.sh
source "$root/deploy/lib/migrate.sh"
backup_daily_external
