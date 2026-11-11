#!/usr/bin/env bash
# Retain separate check results, sharing one setup and idle runner capacity.
set -euo pipefail
: "${GITHUB_OUTPUT:?}"
logs=$(mktemp -d)
pids=()
quality() { pnpm lint:ci && pnpm typecheck:ci; }
unit() { pnpm -r --filter '!reflexionia-tasks' test:ci; }
openapi() {
  pnpm --filter api openapi:generate && git diff --exit-code apps/api/openapi.json apps/api/src/mcp/api-operations.json
}
browser() {
  pnpm --filter web build && R80_PHASE=despues R80_PREVIEW=1 pnpm --filter web exec playwright test --config playwright.r80.config.ts r80-agenda-performance.spec.ts r80-google.spec.ts r80-integrations.spec.ts r80-links.spec.ts r80-about.spec.ts r80-push-actions.spec.ts production-session.spec.ts password-reset.spec.ts --workers=1
}
spawn() {
  local name=$1
  (
    set +e
    "$name" > "$logs/$name.log" 2>&1
    echo "$?" > "$logs/$name.status"
  ) &
  pids+=("$!")
}
spawn quality
if [[ ${RUN_UNIT:-true} == true ]]; then spawn unit; fi
if [[ ${RUN_API:-false} == true ]]; then spawn openapi; fi
if [[ ${RUN_BROWSER:-false} == true ]]; then spawn browser; fi
for pid in "${pids[@]}"; do wait "$pid" || true; done
# When units share this runner, measure the fixed budget after the other work.
if [[ ${RUN_UNIT:-true} == true ]] && ! pnpm --filter web exec vitest run src/features/places/year-index.spec.ts --maxWorkers=1 > "$logs/benchmark.log" 2>&1; then
  echo 1 > "$logs/unit.status"
fi
for name in quality unit openapi browser; do
  result=0
  if [[ -f "$logs/$name.log" ]]; then
    result=1
    if [[ -f "$logs/$name.status" ]]; then result=$(cat "$logs/$name.status"); fi
    printf '::group::%s\n' "$name"
    cat "$logs/$name.log"
    echo '::endgroup::'
  fi
  echo "$name=$result" >> "$GITHUB_OUTPUT"
done
if [[ -f "$logs/benchmark.log" ]]; then cat "$logs/benchmark.log"; fi
rm -rf "$logs"
