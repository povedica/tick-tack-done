#!/usr/bin/env bash
# Two concurrent shards, separate databases and Redis instances, one runner/setup.
set -euo pipefail
: "${POSTGRES_CONTAINER:?}" "${POSTGRES_CONTAINER_SHARD2:?}" "${DATABASE_URL:?}"
postgres_containers=("$POSTGRES_CONTAINER" "$POSTGRES_CONTAINER_SHARD2")
logs=$(mktemp -d)
pids=()
for shard in 1 2; do
  postgres_port=$((5431 + shard))
  database_url="${DATABASE_URL%:*}:$postgres_port/reflexionia_test"
  DATABASE_URL="$database_url" pnpm db:deploy
  redis_port=$((6378 + shard))
  (
    set +e
    POSTGRES_CONTAINER="${postgres_containers[$((shard - 1))]}" DATABASE_URL="$database_url" REDIS_URL="redis://localhost:$redis_port" \
      pnpm --filter api exec vitest run --config vitest.config.integration.ts --shard="$shard/2" --pool=threads --maxWorkers=1 --reporter=dot > "$logs/$shard.log" 2>&1
    echo "$?" > "$logs/$shard.status"
  ) &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid" || true; done
result=0
for shard in 1 2; do
  echo "::group::integration shard $shard"
  cat "$logs/$shard.log"
  echo '::endgroup::'
  if [[ ! -f "$logs/$shard.status" ]] || [[ $(cat "$logs/$shard.status") != 0 ]]; then result=1; fi
done
rm -rf "$logs"
exit "$result"
