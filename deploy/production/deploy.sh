#!/bin/sh
# Levanta la pila de todo en el host compartido. No toca los contenedores de turugby
# ni los puertos 80/443. El sitio lo publica el Caddy que ya está en marcha.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
env_file=${RUNTIME_ENV_FILE:-/etc/todo/production.env}
site_dir=${CADDY_SITES_DIR:-/etc/caddy/sites}

test -r "$env_file"

cd "$root"

# El árbol de /opt/todo/app no es un clon git. Una sustitución que falle
# dejaría GIT_COMMIT vacío y ${VAR:-default} no lo recupera.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GIT_COMMIT=$(git rev-parse --short HEAD)
fi
GIT_COMMIT=${GIT_COMMIT:-unknown}
export GIT_COMMIT

docker compose \
  -f deploy/production/docker-compose.yml \
  --env-file "$env_file" \
  up -d --build --remove-orphans

if [ -w "$site_dir" ] || [ -w "$(dirname "$site_dir")" ]; then
  cp deploy/production/todo.caddy "$site_dir/todo.caddy"
fi
