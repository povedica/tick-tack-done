#!/usr/bin/env bash
# Disposable real PostgreSQL/Prisma exercise; fictitious SQL only exists in containers.
set -euo pipefail
image=${1:?API image}
name="ttd-migrations-$$"
expected=$(docker image inspect "$image" --format '{{json .Config.Env}}' | jq -r '.[] | select(startswith("GIT_COMMIT=")) | sub("^GIT_COMMIT="; "")')
[[ $expected =~ ^[a-fA-F0-9]{7,40}$ ]] || exit 64
backup=$(mktemp)
# shellcheck disable=SC2329 # EXIT trap.
cleanup() {
  docker rm -f "$name-api" "$name-next" "$name-pg" "$name-redis" >/dev/null 2>&1 || true
  docker network rm "$name" >/dev/null 2>&1 || true
  rm -f "$backup"
}
trap cleanup EXIT
umask 077
docker network create "$name" >/dev/null
docker run -d --name "$name-pg" --network "$name" --network-alias postgres \
  -e POSTGRES_PASSWORD=fixture -e POSTGRES_DB=fixture postgres:17-alpine >/dev/null
docker run -d --name "$name-redis" --network "$name" --network-alias redis redis:7-alpine >/dev/null
for _ in {1..30}; do
  docker exec "$name-pg" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
env_args=(-e DATABASE_URL=postgresql://postgres:fixture@postgres:5432/fixture -e REDIS_URL=redis://redis:6379 -e NODE_ENV=development -e AUTH_MODE=dev -e BUS_AUTOSTART=false -e SCHEDULER_AUTOSTART=false)
docker run -d --name "$name-next" --network "$name" "${env_args[@]}" --entrypoint sh "$image" -c 'sleep 600' >/dev/null
migrate() { docker exec "$name-next" node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma >/dev/null 2>&1; }
migrate
docker run -d --name "$name-api" --network "$name" --read-only --tmpfs /tmp "${env_args[@]}" --entrypoint node "$image" dist/main.js >/dev/null
health() {
  docker exec "$name-api" node -e 'fetch("http://127.0.0.1:3000/api/v1/health").then(async r=>{if(!r.ok||(await r.json()).status!=="ok")process.exit(1)}).catch(()=>process.exit(1))' >/dev/null 2>&1
}
ready=false
for _ in {1..30}; do if health; then ready=true; break; fi; sleep 1; done
$ready || { echo 'Previous API never became healthy' >&2; exit 1; }
previous=$(docker inspect --format '{{.Id}}' "$name-api")
# An actual archive must exist before the new migration runs.
docker exec "$name-pg" pg_dump -U postgres -d fixture | gzip > "$backup"
[[ -s $backup ]]
docker exec -i "$name-next" sh -c 'mkdir -p prisma/migrations/999999999900_fixture; cat > prisma/migrations/999999999900_fixture/migration.sql' <<'SQL'
CREATE TABLE ttd_ci_migration_probe (id integer PRIMARY KEY);
SQL
migrate
docker exec "$name-pg" psql -U postgres -d fixture -tAc "SELECT 1 FROM information_schema.tables WHERE table_name='ttd_ci_migration_probe'" | grep -qx 1
health
docker exec "$name-api" node -e 'fetch("http://127.0.0.1:3000/api/v1/health").then(async r=>{if(!(await r.json()).commit.startsWith(process.argv[1]))process.exit(1)}).catch(()=>process.exit(1))' "$expected"
# Deliberately fail a later one-shot; the prior API must stay healthy and identical.
docker exec -i "$name-next" sh -c 'mkdir -p prisma/migrations/999999999901_failure; cat > prisma/migrations/999999999901_failure/migration.sql' <<'SQL'
INVALID SYNTHETIC SQL;
SQL
if migrate; then echo 'Expected migration failure' >&2; exit 1; fi
health
[[ $(docker inspect --format '{{.Id}}' "$name-api") == "$previous" ]]
echo 'Real Prisma/PostgreSQL migration and failure isolation OK'
