#!/bin/sh
# Publishes the deployment SHA the API already receives, under the same name.
# Only hex is written: the file is served as a classic script.
set -eu
sha=$(printf '%s' "${DEPLOY_SHA:-}" | tr -cd '0-9a-fA-F')
if [ "$sha" != "${DEPLOY_SHA:-}" ] || [ -z "$sha" ]; then
  sha=
fi
printf 'window.__DEPLOY_SHA__="%s"\n' "$sha" > /tmp/deploy-sha.js
chmod 644 /tmp/deploy-sha.js
