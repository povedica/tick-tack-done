#!/bin/sh
# Prueba semanal de restauración. Lee el último directorio de /opt/todo/backups.
set -eu

cd /opt/todo/app
export BACKUP_DIR=/opt/todo/backups
exec ./scripts/restore-verify.sh
