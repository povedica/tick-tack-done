#!/usr/bin/env bash
# Two concurrent shards, separate databases and Redis instances, one runner/setup.
set -euo pipefail
: "${POSTGRES_CONTAINER:?}" "${DATABASE_URL:?}"
logs=$(mktemp -d)
pids=()
for shard in 1 2; do
  database="reflexionia_test_$shard"
  docker exec "$POSTGRES_CONTAINER" createdb -U reflexionia "$database"
  database_url="${DATABASE_URL%/*}/$database"
  DATABASE_URL="$database_url" pnpm db:deploy
  redis_port=$((6378 + shard))
  (
    set +e
    DATABASE_URL="$database_url" REDIS_URL="redis://localhost:$redis_port" \
      pnpm --filter api exec vitest run --config vitest.config.integration.ts --shard="$shard/2" > "$logs/$shard.log" 2>&1
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
