#!/usr/bin/env bash
# Tag pushes still publish images directly. Wait until the push CI run for
# this SHA on main succeeds. A pending or missing run is not a failure.
# A terminal conclusion exits immediately. Default budget is 40 minutes;
# the Images job timeout must sit above that.
set -euo pipefail
: "${GITHUB_REPOSITORY:?}"
: "${GITHUB_SHA:?}"
budget=${CI_WAIT_BUDGET_SECONDS:-2400}
interval=${CI_WAIT_INTERVAL_SECONDS:-30}
deadline=$((SECONDS + budget))
while true; do
  payload=$(gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/ci.yml/runs?head_sha=${GITHUB_SHA}&event=push&per_page=10")
  conclusion=$(jq -r '[.workflow_runs[] | select(.head_branch == "main")][0].conclusion // empty' <<<"${payload}")
  case "${conclusion}" in
    success) exit 0 ;;
    failure | cancelled | timed_out | action_required | startup_failure | stale | skipped)
      echo "Main CI did not pass (${conclusion})" >&2
      exit 1
      ;;
  esac
  if ((SECONDS >= deadline)); then
    echo 'Timed out waiting for main CI' >&2
    exit 1
  fi
  sleep "${interval}"
done
