#!/bin/sh
# Installs Linux dependencies into the named volumes, then runs the command.
# The Mac's node_modules are Darwin binaries and stay hidden behind those volumes.
set -eu
cd /repo
export NPM_CONFIG_UPDATE_NOTIFIER=false
# Node 26 no trae corepack. La versión es la de packageManager.
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@9.15.0
fi
if [ ! -f node_modules/.modules.yaml ] || [ pnpm-lock.yaml -nt node_modules/.modules.yaml ]; then
  pnpm install --frozen-lockfile
fi
export IN_NODE_26=1
exec "$@"
