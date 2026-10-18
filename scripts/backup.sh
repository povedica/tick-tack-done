#!/usr/bin/env bash
# Backup diario (RF-1704): pg_dump + adjuntos, copiado FUERA de la máquina, retención 30 días.
# En el host compartido lo lanza deploy/production/cron-backup.sh
# (COMPOSE_FILE, COMPOSE_PROJECT_NAME y BACKUP_DIR ya exportados).
set -euo pipefail

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_DIR:-./backups}/$STAMP"
mkdir -p "$DEST"
case "$DEST" in
  /*) out="$DEST" ;;
  *) out="$PWD/$DEST" ;;
esac

echo "[backup] pg_dump…"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-reflexionia}" "${POSTGRES_DB:-reflexionia}" \
  | gzip > "$out/db.sql.gz"

echo "[backup] adjuntos…"
project="${COMPOSE_PROJECT_NAME:-reflexionia-tasks}"
docker run --rm -v "${project}_attachments:/data" -v "$out":/out alpine \
  tar czf /out/attachments.tar.gz -C /data .

upload_drive() {
  local dir="$1"
  if command -v node >/dev/null 2>&1; then
    node scripts/backup-to-drive.mjs "$dir"
    return
  fi
  echo "[backup] el host no tiene node; se usa node:22-alpine"
  local token
  token="$(
    docker compose exec -T postgres psql \
      -U "${POSTGRES_USER:-reflexionia}" \
      -d "${POSTGRES_DB:-reflexionia}" \
      -tA \
      -c "SELECT google_refresh_token FROM users WHERE google_refresh_token IS NOT NULL AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1" \
      || true
  )"
  token="$(printf '%s' "$token" | tr -d '[:space:]')"
  docker run --rm \
    -v "$PWD/scripts/backup-to-drive.mjs":/backup-to-drive.mjs:ro \
    -v "$dir":/backup:ro \
    -e GOOGLE_DRIVE_FOLDER_ID \
    -e GOOGLE_CLIENT_ID \
    -e GOOGLE_CLIENT_SECRET \
    -e GOOGLE_REFRESH_TOKEN="$token" \
    -e BACKUP_RETENTION_DAYS \
    node:22-alpine \
    node /backup-to-drive.mjs /backup
}

if [ -n "${BACKUP_REMOTE:-}" ]; then
  echo "[backup] copiando a destino externo: $BACKUP_REMOTE"
  rclone copy "$out" "$BACKUP_REMOTE/$STAMP"
elif [ -n "${GOOGLE_DRIVE_FOLDER_ID:-}" ]; then
  echo "[backup] volcando a Google Drive"
  upload_drive "$out"
else
  echo "[backup] AVISO: ni BACKUP_REMOTE ni GOOGLE_DRIVE_FOLDER_ID; el backup NO sale de la máquina (incumple RF-1704)"
  exit 1
fi

find "${BACKUP_DIR:-./backups}" -mindepth 1 -maxdepth 1 -type d -mtime +"${BACKUP_RETENTION_DAYS:-30}" -exec rm -rf {} +
echo "[backup] OK $out"
