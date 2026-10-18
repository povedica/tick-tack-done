#!/usr/bin/env bash
# Restaura un stamp verificado en el Postgres del compose (RF-1704).
# No se lanza desde la API. Exige RESTORE_CONFIRM=restore y el stamp.
set -euo pipefail

if [ "${RESTORE_CONFIRM:-}" != "restore" ]; then
  echo "[restore] falta RESTORE_CONFIRM=restore" >&2
  exit 1
fi
STAMP="${1:-}"
if [ -z "$STAMP" ]; then
  echo "[restore] uso: RESTORE_CONFIRM=restore ./scripts/restore.sh 20261018T040000Z" >&2
  exit 1
fi
ARCHIVE="${BACKUP_DIR:-./backups}/$STAMP/db.sql.gz"
if [ ! -f "$ARCHIVE" ]; then
  echo "[restore] no está $ARCHIVE" >&2
  exit 1
fi
gunzip -t "$ARCHIVE"
echo "[restore] archivo íntegro. Volcando en el servicio postgres…"
gunzip -c "$ARCHIVE" | docker compose exec -T postgres \
  psql -U "${POSTGRES_USER:-reflexionia}" -d "${POSTGRES_DB:-reflexionia}" -v ON_ERROR_STOP=1
echo "[restore] OK $STAMP"
