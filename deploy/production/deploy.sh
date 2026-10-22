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
BUILD_TIME=${BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
export GIT_COMMIT BUILD_TIME

docker compose \
  -f deploy/production/docker-compose.yml \
  --env-file "$env_file" \
  up -d --build --remove-orphans

if [ -n "$site_dir" ]; then
  site_file=$site_dir/todo.caddy
  if [ -w "$site_dir" ] || [ -w "$(dirname "$site_dir")" ]; then
    cp deploy/production/todo.caddy "$site_file"
  elif command -v sudo >/dev/null 2>&1 && sudo -n /usr/bin/install -o root -g root -m 644 deploy/production/todo.caddy "$site_file"; then
    :
  else
    echo "warning: could not update $site_file (need write access or passwordless sudo install)" >&2
  fi
  # Edge Caddy often has `admin off`, so reload via the admin API fails; restart instead.
  if [ -n "${EDGE_CADDY_CONTAINER:-}" ]; then
    sudo -n /usr/bin/docker restart "$EDGE_CADDY_CONTAINER" \
      || echo "warning: could not restart $EDGE_CADDY_CONTAINER" >&2
  fi
fi
