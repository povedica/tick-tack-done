#!/bin/sh
# Starts this stack. It does not publish ports 80 or 443.
# Required outside the repo: RUNTIME_ENV_FILE, and optionally CADDY_SITES_DIR, EDGE_NETWORK, APP_DIR.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
env_file=${RUNTIME_ENV_FILE:?Set RUNTIME_ENV_FILE to the env file outside the repository}
site_dir=${CADDY_SITES_DIR:-}

test -r "$env_file"

cd "$root"

# The app directory is not a git clone. A failed substitution would leave
# GIT_COMMIT empty, and ${VAR:-default} does not recover it.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GIT_COMMIT=$(git rev-parse --short HEAD)
fi
GIT_COMMIT=${GIT_COMMIT:-unknown}
export GIT_COMMIT

docker compose \
  -f deploy/production/docker-compose.yml \
  --env-file "$env_file" \
  up -d --build --remove-orphans

if [ -n "$site_dir" ] && { [ -w "$site_dir" ] || [ -w "$(dirname "$site_dir")" ]; }; then
  cp deploy/production/todo.caddy "$site_dir/todo.caddy"
fi
