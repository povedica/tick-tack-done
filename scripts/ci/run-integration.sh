#!/usr/bin/env bash
# Four concurrent shards, separate databases and Redis instances, one runner/setup.
set -euo pipefail
: "${POSTGRES_CONTAINER:?}" "${POSTGRES_CONTAINER_SHARD2:?}" "${POSTGRES_CONTAINER_SHARD3:?}" "${POSTGRES_CONTAINER_SHARD4:?}" "${DATABASE_URL:?}"
postgres_containers=("$POSTGRES_CONTAINER" "$POSTGRES_CONTAINER_SHARD2" "$POSTGRES_CONTAINER_SHARD3" "$POSTGRES_CONTAINER_SHARD4")
logs=$(mktemp -d)
pids=()
# These strict budgets must measure idle application capacity, not shard contention.
budget_pattern='RF-2321–2324 statistics API|GET /smart-lists answers in under|TTD-AUD-101: MCP settings validate'
parallel_pattern="^(?!.*($budget_pattern)).*$"
for shard in 1 2 3 4; do
  postgres_port=$((5431 + shard))
  database_url="${DATABASE_URL%:*}:$postgres_port/reflexionia_test"
  DATABASE_URL="$database_url" pnpm db:deploy
  redis_port=$((6378 + shard))
  (
    set +e
    POSTGRES_CONTAINER="${postgres_containers[$((shard - 1))]}" DATABASE_URL="$database_url" REDIS_URL="redis://localhost:$redis_port" \
      pnpm --filter api exec vitest run --config vitest.config.integration.ts --shard="$shard/4" --pool=threads --maxWorkers=1 --reporter=dot --testNamePattern="$parallel_pattern" > "$logs/$shard.log" 2>&1
    echo "$?" > "$logs/$shard.status"
  ) &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid" || true; done
result=0
for shard in 1 2 3 4; do
  echo "::group::integration shard $shard"
  cat "$logs/$shard.log"
  echo '::endgroup::'
  if [[ ! -f "$logs/$shard.status" ]] || [[ $(cat "$logs/$shard.status") != 0 ]]; then result=1; fi
done
# Preserve the complete statistics lifecycle and its original test order, plus two other strict budgets.
if ! POSTGRES_CONTAINER="$POSTGRES_CONTAINER" DATABASE_URL="${DATABASE_URL%:*}:5432/reflexionia_test" REDIS_URL=redis://localhost:6379 \
  pnpm --filter api exec vitest run --config vitest.config.integration.ts \
    test/stats.e2e-spec.ts test/filters.e2e-spec.ts test/mcp.e2e-spec.ts \
    --pool=threads --maxWorkers=1 --testNamePattern="$budget_pattern" \
    --reporter=json --outputFile="$logs/budgets.json" > "$logs/budgets.log" 2>&1; then result=1; fi
cat "$logs/budgets.log"
# shellcheck disable=SC2016 # JavaScript template literals, not shell expansion.
if ! node -e '
  const report=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
  console.log(`Isolated budgets: ${report.numPassedTests} passed, ${report.numFailedTests} failed`);
  for(const file of report.testResults ?? []) for(const test of file.assertionResults ?? []) {
    if(test.status === "failed") console.error(test.fullName, ...(test.failureMessages ?? []));
  }
  if(report.numPassedTests !== 11 || report.numFailedTests !== 0) process.exit(1);
' "$logs/budgets.json"; then result=1; fi
rm -rf "$logs"
exit "$result"
