#!/bin/sh
# Backup diario de la pila `todo` en el host compartido. No imprime el env.
set -eu

cd /opt/todo/app
set -a
# shellcheck disable=SC1091
. /etc/todo/production.env
set +a
export COMPOSE_FILE=deploy/production/docker-compose.yml
export COMPOSE_PROJECT_NAME=todo
export BACKUP_DIR=/opt/todo/backups
mkdir -p "$BACKUP_DIR"
exec ./scripts/backup.sh
