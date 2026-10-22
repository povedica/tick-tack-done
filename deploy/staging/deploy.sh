#!/bin/sh
# RF-2001/2005: levantar solo staging; la activación del proxy es un paso separado.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
: "${RUNTIME_ENV_FILE:?Set the private staging env file outside the repository}"
case "$RUNTIME_ENV_FILE" in */staging.env) ;; *) echo "Expected a separate staging.env" >&2; exit 64;; esac
# Guard against accidentally passing production configuration.
grep -qx 'PUBLIC_URL=https://staging-todo.reflexionia.com' "$RUNTIME_ENV_FILE"
grep -qx 'POSTGRES_DB=ttd_staging' "$RUNTIME_ENV_FILE"
: "${GIT_COMMIT:?Set the exact staged commit}"
export BUILD_TIME=${BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
export COMPOSE_PARALLEL_LIMIT=1
cd "$root"
docker network inspect todo_staging_edge >/dev/null 2>&1 || docker network create todo_staging_edge
docker compose -p todo-staging -f deploy/staging/docker-compose.yml --env-file "$RUNTIME_ENV_FILE" config --quiet
docker compose -p todo-staging -f deploy/staging/docker-compose.yml --env-file "$RUNTIME_ENV_FILE" build staging-api
docker compose -p todo-staging -f deploy/staging/docker-compose.yml --env-file "$RUNTIME_ENV_FILE" build staging-web
docker compose -p todo-staging -f deploy/staging/docker-compose.yml --env-file "$RUNTIME_ENV_FILE" up -d --no-build
