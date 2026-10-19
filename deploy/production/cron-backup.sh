#!/bin/sh
# Daily backup. Paths come from the environment, not from this file.
set -eu

: "${APP_DIR:?Set APP_DIR}"
: "${RUNTIME_ENV_FILE:?Set RUNTIME_ENV_FILE}"
: "${BACKUP_DIR:?Set BACKUP_DIR}"

cd "$APP_DIR"
set -a
# shellcheck disable=SC1090
. "$RUNTIME_ENV_FILE"
set +a
export COMPOSE_FILE=deploy/production/docker-compose.yml
export COMPOSE_PROJECT_NAME=todo
export BACKUP_DIR
mkdir -p "$BACKUP_DIR"
exec ./scripts/backup.sh
