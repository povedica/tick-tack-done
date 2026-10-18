#!/bin/sh
# Levanta la pila de todo en el host compartido. No toca los contenedores de turugby
# ni los puertos 80/443. El sitio lo publica el Caddy que ya está en marcha.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
env_file=${RUNTIME_ENV_FILE:-/etc/todo/production.env}
site_dir=${CADDY_SITES_DIR:-/etc/caddy/sites}

test -r "$env_file"

cd "$root"

docker compose \
  -f deploy/production/docker-compose.yml \
  --env-file "$env_file" \
  up -d --build --remove-orphans

if [ -w "$site_dir" ] || [ -w "$(dirname "$site_dir")" ]; then
  cp deploy/production/todo.caddy "$site_dir/todo.caddy"
fi
