#!/usr/bin/env bash
# Backup diario (RF-1704): pg_dump + adjuntos, copiado FUERA de la máquina, retención 30 días.
# Programar en el host: 0 4 * * * cd /opt/reflexionia && ./scripts/backup.sh
set -euo pipefail

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_DIR:-./backups}/$STAMP"
mkdir -p "$DEST"

echo "[backup] pg_dump…"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-reflexionia}" "${POSTGRES_DB:-reflexionia}" \
  | gzip > "$DEST/db.sql.gz"

echo "[backup] adjuntos…"
docker run --rm -v reflexionia-tasks_attachments:/data -v "$PWD/$DEST":/out alpine \
  tar czf /out/attachments.tar.gz -C /data .

if [ -n "${BACKUP_REMOTE:-}" ]; then
  echo "[backup] copiando a destino externo: $BACKUP_REMOTE"
  rclone copy "$DEST" "$BACKUP_REMOTE/$STAMP"
else
  echo "[backup] AVISO: BACKUP_REMOTE no configurado; el backup NO sale de la máquina (incumple RF-1704)"
fi

# Retención
find "${BACKUP_DIR:-./backups}" -maxdepth 1 -type d -mtime +"${BACKUP_RETENTION_DAYS:-30}" -exec rm -rf {} +
echo "[backup] OK $DEST"
