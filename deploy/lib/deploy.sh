#!/usr/bin/env bash
# Shared pull-only deployment. Runtime values are never sourced as shell code.
set +x
set -euo pipefail
: "${RUNTIME_ENV_FILE:?Set RUNTIME_ENV_FILE}"
: "${PUBLIC_HEALTH_URL:?Set PUBLIC_HEALTH_URL}"
: "${DEPLOY_ENVIRONMENT:?}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
case "$DEPLOY_ENVIRONMENT" in
  staging) project=todo-staging; api=staging-api; web=staging-web ;;
  production) project=todo; api=api; web=web ;;
  *) exit 64 ;;
esac
file="deploy/$DEPLOY_ENVIRONMENT/docker-compose.yml"
state_dir="$(dirname "$RUNTIME_ENV_FILE")/.ttd-deploy-$DEPLOY_ENVIRONMENT"
if [[ ! -d $state_dir ]]; then mkdir -m 700 "$state_dir"; fi
state="$state_dir/last-good.env"
lock="$state.lock"
mkdir "$lock" 2>/dev/null || { echo 'Another deployment holds the lock' >&2; exit 1; }
# shellcheck disable=SC2329 # EXIT trap.
cleanup() { rmdir "$lock"; }
trap cleanup EXIT
umask 077
build=false
if [[ ${1:-} == --build ]]; then build=true; fi
compose_args=(-p "$project" -f "$file" --env-file "$RUNTIME_ENV_FILE")
compose() { docker compose "${compose_args[@]}" "$@"; }
valid_image() { [[ "$1" =~ ^[a-zA-Z0-9][a-zA-Z0-9./_:@-]+$ ]]; }
current_image() {
  local id
  id=$(compose ps -q "$1")
  [[ -n "$id" ]] || return 1
  docker inspect --format '{{.Config.Image}}' "$id"
}
# Compose validates env_file/interpolation, but never prints expanded config.
export API_IMAGE=${API_IMAGE:-bootstrap-api} WEB_IMAGE=${WEB_IMAGE:-bootstrap-web}
compose config --quiet
if [[ $DEPLOY_ENVIRONMENT == staging ]]; then
  compose config --format json | jq -e '.services["staging-api"].environment.PUBLIC_URL == "https://staging-todo.reflexionia.com" and .services.postgres.environment.POSTGRES_DB == "ttd_staging"' >/dev/null
else
  compose config --format json | jq -e '.services.api.environment.PUBLIC_URL == "https://todo.reflexionia.com" and .services.postgres.environment.POSTGRES_DB != "ttd_staging"' >/dev/null
fi
old_api=''; old_web=''
if [[ -r "$state" ]]; then
  while IFS='=' read -r key value; do
    case "$key" in API_IMAGE) old_api=$value ;; WEB_IMAGE) old_web=$value ;; *) exit 64 ;; esac
  done < "$state"
else
  old_api=$(current_image "$api")
  old_web=$(current_image "$web")
fi
if ! valid_image "$old_api" || ! valid_image "$old_web"; then echo 'Cannot determine rollback images' >&2; exit 1; fi
[[ $API_IMAGE != bootstrap-api ]] || API_IMAGE=$old_api
[[ $WEB_IMAGE != bootstrap-web ]] || WEB_IMAGE=$old_web
valid_image "$API_IMAGE" && valid_image "$WEB_IMAGE" || exit 64
export API_IMAGE WEB_IMAGE
if $build; then
  : "${GIT_COMMIT:?Set GIT_COMMIT for emergency build}"
  API_IMAGE="ttd-api:emergency-$GIT_COMMIT"; WEB_IMAGE="ttd-web:emergency-$GIT_COMMIT"
  export API_IMAGE WEB_IMAGE BUILD_TIME=${BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
  compose_args+=(-f "deploy/$DEPLOY_ENVIRONMENT/docker-compose.build.yml")
  compose build "$api" "$web"
fi
running_api=$(current_image "$api")
running_web=$(current_image "$web")
changed=()
[[ $API_IMAGE == "$running_api" ]] || changed+=("$api")
[[ $WEB_IMAGE == "$running_web" ]] || changed+=("$web")
if ! $build && [[ ${#changed[@]} -gt 0 ]]; then compose pull "${changed[@]}"; fi
image_commit() {
  docker image inspect "$1" --format '{{json .Config.Env}}' | jq -r '.[] | select(startswith("GIT_COMMIT=")) | sub("^GIT_COMMIT="; "")'
}
expected=$(image_commit "$API_IMAGE")
if [[ $API_IMAGE != "$old_api" ]]; then [[ "$expected" =~ ^[a-fA-F0-9]{7,40}$ ]] || exit 64; fi
health() {
  local sha=$1 timeout=$2
  local deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    if curl --fail --silent --show-error --connect-timeout 3 --max-time 5 "$PUBLIC_HEALTH_URL" 2>/dev/null \
      | jq -e --arg sha "$sha" '.status == "ok" and (($sha == "" or $sha == "unknown") or (.commit | startswith($sha)))' >/dev/null \
      && compose exec -T "$web" wget -q -O /dev/null http://127.0.0.1:8080/; then return 0; fi
    sleep 2
  done
  return 1
}
write_state() {
  local temporary
  temporary=$(mktemp "$state.XXXXXX")
  printf 'API_IMAGE=%s\nWEB_IMAGE=%s\n' "$API_IMAGE" "$WEB_IMAGE" > "$temporary"
  chmod 600 "$temporary"
  mv "$temporary" "$state"
}
if ! declare -F after_replace >/dev/null; then after_replace() { :; }; fi
if ! declare -F restore_proxy >/dev/null; then restore_proxy() { :; }; fi
if ! declare -F after_success >/dev/null; then after_success() { :; }; fi
rollback() {
  echo 'Restoring last-good images' >&2
  local proxy_status=0
  restore_proxy || proxy_status=$?
  API_IMAGE=$old_api; WEB_IMAGE=$old_web; export API_IMAGE WEB_IMAGE
  if [[ ${#changed[@]} -gt 0 ]]; then compose up -d --no-build --no-deps "${changed[@]}" || return 1; fi
  health "$(image_commit "$old_api")" 45 || return 1
  return "$proxy_status"
}
# shellcheck source=deploy/lib/migrate.sh
source "$root/deploy/lib/migrate.sh"
if [[ $API_IMAGE != "$running_api" ]]; then migrate_before_replace; fi
replace_changed() {
  if [[ ${#changed[@]} -gt 0 ]]; then compose up -d --no-build --no-deps --remove-orphans "${changed[@]}"; fi
}
if ! replace_changed || ! after_replace || ! health "$expected" 90; then
  rollback || echo 'Rollback health failed; operator action required' >&2
  exit 1
fi
write_state
after_success
echo 'Deployment healthy; last-good saved'
