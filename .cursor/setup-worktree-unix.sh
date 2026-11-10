#!/usr/bin/env bash
# Cursor lo ejecuta DENTRO de cada worktree nuevo (ver .cursor/worktrees.json).
# Levanta un entorno identico pero aislado: puertos desplazados, stack docker
# propio (Postgres/Redis/Mailpit), migraciones y seed. No toca el checkout principal.
#
# Los checkouts de este Mac viven bajo /Users/pablo/Projects
# (antes /Users/pablo.poveda/CodeProjects). Cursor puede crear el directorio
# en otro sitio; la config se copia desde el checkout principal.
set -euo pipefail

WORKTREES_ROOT="${WORKTREES_ROOT:-/Users/pablo/Projects}"
WT_OFFSET="${WT_OFFSET:-100}"
PROJECT="ttd-wt${WT_OFFSET}"
API_PORT=$((3000 + WT_OFFSET))
WEB_PORT=$((5173 + WT_OFFSET))
PG_PORT=$((5432 + WT_OFFSET))
REDIS_PORT=$((6379 + WT_OFFSET))
SMTP_PORT=$((1025 + WT_OFFSET))
MAILPIT_PORT=$((8025 + WT_OFFSET))
COMPOSE_LOCAL="docker-compose.worktree.local.yml"

echo "==> [worktree] offset ${WT_OFFSET}: api=${API_PORT} web=${WEB_PORT} pg=${PG_PORT} redis=${REDIS_PORT}"

# 1) Dependencias. pnpm usa su store global (rapido); NUNCA symlinks de node_modules
#    entre worktrees (lo desaconseja la propia doc de Cursor).
pnpm install

# 2) Compose local del worktree: mismos servicios que docker-compose.dev.yml,
#    puertos desplazados y volumen propio. Archivo generado, ignorado por git.
sed -e "s/5432:5432/${PG_PORT}:5432/" \
    -e "s/6379:6379/${REDIS_PORT}:6379/" \
    -e "s/1025:1025/${SMTP_PORT}:1025/" \
    -e "s/8025:8025/${MAILPIT_PORT}:8025/" \
    -e "s/3000:3000/${API_PORT}:3000/" \
    -e "s/5173:5173/${WEB_PORT}:5173/" \
    -e "s/pgdata_dev/pgdata_wt${WT_OFFSET}/g" \
    docker-compose.dev.yml > "$COMPOSE_LOCAL"

# 3) .env del worktree: copia el del checkout principal si existe (config identica,
#    incluidos APP_SECRET y claves VAPID); si no, parte de .env.example.
#    Despues reapunta puertos a ESTE worktree.
if [[ -n "${ROOT_WORKTREE_PATH:-}" && -f "$ROOT_WORKTREE_PATH/.env" ]]; then
  cp "$ROOT_WORKTREE_PATH/.env" .env
else
  cp .env.example .env
fi
perl -pi -e "s|localhost:5432|localhost:${PG_PORT}|g;
             s|localhost:6379|localhost:${REDIS_PORT}|g;
             s|localhost:3000|localhost:${API_PORT}|g;
             s|localhost:5173|localhost:${WEB_PORT}|g;
             s|^PORT=3000\$|PORT=${API_PORT}|m;
             s|^SMTP_PORT=1025\$|SMTP_PORT=${SMTP_PORT}|m;
             s|^SCHEDULER_AUTOSTART=true\$|SCHEDULER_AUTOSTART=false|m" .env
grep -q '^VITE_API_PROXY=' .env || echo "VITE_API_PROXY=http://localhost:${API_PORT}" >> .env
# El .env real puede no traer la variable; sin ella el scheduler arranca y duplica envíos.
grep -q '^SCHEDULER_AUTOSTART=' .env || echo 'SCHEDULER_AUTOSTART=false' >> .env
if grep -q '^COMPOSE_PROJECT_NAME=' .env; then
  perl -pi -e "s|^COMPOSE_PROJECT_NAME=.*|COMPOSE_PROJECT_NAME=${PROJECT}|" .env
else
  echo "COMPOSE_PROJECT_NAME=${PROJECT}" >> .env
fi

# .env-config y el .env.local de la web no van en git. Se copian del checkout principal.
if [[ -n "${ROOT_WORKTREE_PATH:-}" && -d "$ROOT_WORKTREE_PATH/.env-config" ]]; then
  mkdir -p .env-config
  cp -R "$ROOT_WORKTREE_PATH/.env-config/." .env-config/
fi
if [[ -n "${ROOT_WORKTREE_PATH:-}" && -f "$ROOT_WORKTREE_PATH/apps/web/.env.local" ]]; then
  mkdir -p apps/web
  cp "$ROOT_WORKTREE_PATH/apps/web/.env.local" apps/web/.env.local
fi

# 4) Infra aislada: proyecto compose propio => contenedores, red y volumen independientes.
docker compose -p "$PROJECT" -f "$COMPOSE_LOCAL" up -d
ready=0
for _ in $(seq 1 60); do
  if docker compose -p "$PROJECT" -f "$COMPOSE_LOCAL" exec -T postgres \
      pg_isready -U reflexionia >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "==> [worktree] postgres no respondió en 60 s (proyecto ${PROJECT})" >&2
  exit 1
fi

# 5) Base de datos del worktree: migraciones + seed de desarrollo.
pnpm db:deploy
pnpm db:seed

echo "==> [worktree] listo."
echo "    Checkouts: ${WORKTREES_ROOT}"
echo "    API:  pnpm dev:api                                        # http://localhost:${API_PORT}"
echo "    Web:  pnpm --filter web dev -- --port ${WEB_PORT} --strictPort"
echo "    Docs: http://localhost:${API_PORT}/api/docs  ·  Mailpit: http://localhost:${MAILPIT_PORT}"
