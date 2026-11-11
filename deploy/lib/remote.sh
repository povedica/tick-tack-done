#!/usr/bin/env bash
# shellcheck disable=SC2029 # Values are validated locally and intentionally sent to SSH.
set +x
set -euo pipefail
: "${DEPLOY_SSH_KEY:?Missing DEPLOY_SSH_KEY}"
: "${DEPLOY_KNOWN_HOSTS:?Missing DEPLOY_KNOWN_HOSTS}"
: "${DEPLOY_HOST:?Missing DEPLOY_HOST}"
: "${DEPLOY_USER:?Missing DEPLOY_USER}"
: "${DEPLOY_APP_DIR:?Missing DEPLOY_APP_DIR}"
: "${RUNTIME_ENV_FILE:?Missing RUNTIME_ENV_FILE}"
: "${PUBLIC_HEALTH_URL:?Missing PUBLIC_HEALTH_URL}"
[[ $DEPLOY_USER =~ ^[a-z_][a-z0-9_-]*$ && $DEPLOY_HOST =~ ^[a-zA-Z0-9.-]+$ ]] || exit 64
for path in "$DEPLOY_APP_DIR" "$RUNTIME_ENV_FILE"; do [[ $path =~ ^/[a-zA-Z0-9_./-]+$ && $path != *..* ]] || exit 64; done
[[ $ENVIRONMENT == staging || $ENVIRONMENT == production ]] || exit 64
[[ $PUBLIC_HEALTH_URL =~ ^https://[a-zA-Z0-9./_-]+$ ]] || exit 64
for value in "${EDGE_NETWORK:-}" "${CADDY_SITES_DIR:-}" "${EDGE_CADDY_CONTAINER:-}"; do
  [[ -z $value || $value =~ ^[a-zA-Z0-9_./-]+$ ]] || exit 64
done
[[ $GITHUB_RUN_ID =~ ^[0-9]+$ && $GITHUB_RUN_ATTEMPT =~ ^[0-9]+$ ]] || exit 64
umask 077
printf '%s\n' "$DEPLOY_SSH_KEY" > "$RUNNER_TEMP/deploy-key"
unset DEPLOY_SSH_KEY
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$RUNNER_TEMP/known-hosts"
ssh_args=(-i "$RUNNER_TEMP/deploy-key" -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$RUNNER_TEMP/known-hosts")
destination="$DEPLOY_USER@$DEPLOY_HOST"
release="$DEPLOY_APP_DIR/releases/$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
private="$RUNTIME_ENV_FILE.new-$GITHUB_RUN_ID"
ssh "${ssh_args[@]}" "$destination" "umask 077; mkdir -p '$release/deploy' '$release/scripts'; install -m 600 /dev/null '$private'"
# Only the deployment subtree and backup entrypoint/dependency are transferred.
cp scripts/backup-to-drive.mjs deploy/lib/backup-to-drive.mjs
scp "${ssh_args[@]}" -r deploy/. "$destination:$release/deploy/"
scp "${ssh_args[@]}" scripts/backup.sh "$destination:$release/scripts/backup.sh"
scp "${ssh_args[@]}" "$RUNNER_TEMP/runtime.env" "$destination:$private"
ssh "${ssh_args[@]}" "$destination" "chmod 600 '$private'; mv '$private' '$RUNTIME_ENV_FILE'"
api_image=''; web_image=''
if [[ $TARGET != last-good ]]; then
  plan="$RUNNER_TEMP/plan/plan.json"
  if [[ $(jq -r .api "$plan") == true ]]; then api_image="ghcr.io/povedica/tick-tack-done-api:$TARGET"; fi
  if [[ $(jq -r .web "$plan") == true ]]; then
    suffix=staging; [[ $ENVIRONMENT != production ]] || suffix=prod
    web_image="ghcr.io/povedica/tick-tack-done-web:$TARGET-$suffix"
  fi
fi
command=(env "RUNTIME_ENV_FILE=$RUNTIME_ENV_FILE" "PUBLIC_HEALTH_URL=$PUBLIC_HEALTH_URL" "API_IMAGE=$api_image" "WEB_IMAGE=$web_image" "EDGE_NETWORK=${EDGE_NETWORK:-}" "CADDY_SITES_DIR=${CADDY_SITES_DIR:-}" "EDGE_CADDY_CONTAINER=${EDGE_CADDY_CONTAINER:-}" bash "$release/deploy/$ENVIRONMENT/deploy.sh")
printf -v remote_command '%q ' "${command[@]}"
ssh "${ssh_args[@]}" "$destination" "$remote_command"
# Update the runbook/cron entrypoint only after the health check succeeded.
ssh "${ssh_args[@]}" "$destination" "ln -s '$release' '$DEPLOY_APP_DIR/current-$GITHUB_RUN_ID'; mv -Tf '$DEPLOY_APP_DIR/current-$GITHUB_RUN_ID' '$DEPLOY_APP_DIR/current'"
