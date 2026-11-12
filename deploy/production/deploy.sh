#!/usr/bin/env bash
set +x
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
: "${CADDY_SITES_DIR:?Set CADDY_SITES_DIR}"
: "${EDGE_CADDY_CONTAINER:?Set EDGE_CADDY_CONTAINER}"
: "${EDGE_NETWORK:?Set EDGE_NETWORK}"
export DEPLOY_ENVIRONMENT=production
caddy_backup=''
caddy_existed=false
# shellcheck disable=SC2329 # Hooks called by the shared deploy engine.
after_replace() {
  local site="$CADDY_SITES_DIR/todo.caddy"
  if cmp -s "$root/deploy/production/todo.caddy" "$site"; then return 0; fi
  caddy_backup=$(mktemp "$CADDY_SITES_DIR/.todo-caddy.XXXXXX") || return 1
  if [[ -f "$site" ]]; then
    caddy_existed=true
    cp "$site" "$caddy_backup" || return 1
  fi
  install -m 644 "$root/deploy/production/todo.caddy" "$site.new" || return 1
  mv "$site.new" "$site" || return 1
  docker restart "$EDGE_CADDY_CONTAINER" >/dev/null
}
# shellcheck disable=SC2329
restore_proxy() {
  [[ -n $caddy_backup ]] || return 0
  if $caddy_existed; then
    install -m 644 "$caddy_backup" "$CADDY_SITES_DIR/todo.caddy" || return 1
  else
    rm -f "$CADDY_SITES_DIR/todo.caddy"
  fi
  rm -f "$caddy_backup"
  docker restart "$EDGE_CADDY_CONTAINER" >/dev/null
}
# shellcheck disable=SC2329
after_success() { if [[ -n $caddy_backup ]]; then rm -f "$caddy_backup"; fi; }
# shellcheck source=deploy/lib/deploy.sh
source "$root/deploy/lib/deploy.sh"
