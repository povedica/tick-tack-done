#!/usr/bin/env bash
# Runner side, after a healthy deployment: marks the deployed ttd-api/ttd-web releases in
# Sentry (#209). Without SENTRY_AUTH_TOKEN it does nothing. It never fails the deployment.
set +x
set -euo pipefail
if [[ -z ${SENTRY_AUTH_TOKEN:-} ]]; then
  echo 'SENTRY_AUTH_TOKEN absent: no Sentry deploy marker'
  exit 0
fi
: "${SENTRY_ORG:?Set SENTRY_ORG}"
[[ $ENVIRONMENT == staging || $ENVIRONMENT == production ]] || exit 64
[[ $TARGET =~ ^[a-f0-9]{40}$ ]] || exit 64
plan="$RUNNER_TEMP/plan/plan.json"
[[ -r $plan ]] || { echo 'No deployment plan: no Sentry deploy marker'; exit 0; }
cli=("$(bash "$(dirname "${BASH_SOURCE[0]}")/sentry-cli.sh")")
mark() {
  local project=$1 sha=$2 version release
  [[ $sha =~ ^[a-f0-9]{40}$ ]] || return 64
  version=$(jq -r .version "apps/${project#ttd-}/package.json")
  release="$project@$version+${sha:0:7}"
  "${cli[@]}" releases new "$release" --org "$SENTRY_ORG" --project "$project" &&
    "${cli[@]}" deploys new --org "$SENTRY_ORG" --project "$project" --release "$release" \
      --env "$ENVIRONMENT" --name "${TARGET:0:7}"
}
failed=0
if [[ $(jq -r .api "$plan") == true ]]; then mark ttd-api "$(jq -r .api_sha "$plan")" || failed=1; fi
if [[ $(jq -r .web "$plan") == true ]]; then mark ttd-web "$(jq -r .web_sha "$plan")" || failed=1; fi
if (( failed != 0 )); then echo '::warning::Sentry deploy marker failed; the deployment itself is healthy'; fi
exit 0
