#!/usr/bin/env bash
# Prueba de restauración automática semanal (RF-1704): restaura el último backup en un
# Postgres temporal y verifica integridad. Alerta (exit != 0) si falla.
# Programar en el host: 0 5 * * 0 cd /opt/reflexionia && ./scripts/restore-verify.sh
set -euo pipefail

LATEST="$(ls -1d "${BACKUP_DIR:-./backups}"/*/ | sort | tail -1)"
echo "[restore-verify] usando $LATEST"

docker run -d --name restore-verify -e POSTGRES_PASSWORD=verify postgres:17-alpine
trap 'docker rm -f restore-verify >/dev/null 2>&1 || true' EXIT
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if docker exec restore-verify pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

gunzip -c "$LATEST/db.sql.gz" | docker exec -i restore-verify \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - >/dev/null

TABLES=$(docker exec restore-verify psql -U postgres -d postgres -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
echo "[restore-verify] tablas restauradas: $TABLES"
[ "$TABLES" -gt 0 ] && echo "[restore-verify] OK"
