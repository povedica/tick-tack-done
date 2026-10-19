#!/bin/sh
# Weekly restore check. Paths come from the environment.
set -eu

: "${APP_DIR:?Set APP_DIR}"
: "${BACKUP_DIR:?Set BACKUP_DIR}"

cd "$APP_DIR"
export BACKUP_DIR
exec ./scripts/restore-verify.sh
