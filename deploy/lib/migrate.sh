#!/usr/bin/env bash
# RF-1704: fail closed before replacing API when migrations differ.
migration_fingerprint() {
  docker run --rm --entrypoint sh "$1" -c '
    for root in /app/prisma/migrations /app/apps/api/prisma/migrations; do
      if [ -d "$root" ]; then
        cd "$root" || exit 1
        find . -type f -name "*.sql" | LC_ALL=C sort | xargs sha256sum | sha256sum
        exit
      fi
    done
    exit 1
  '
}
backup_before_migrate() (
  set +x
  set -euo pipefail
  : "${api:?}" "${file:?}" "${project:?}" "${root:?}"
  umask 077
  config=$(mktemp)
  trap 'rm -f "$config" "$config.env"' EXIT
  compose config --format json > "$config"
  # Read a structured config, never source dotenv content as executable shell.
  jq -j --arg api "$api" '.services[$api].environment | to_entries[] | select(.value != null) | .key + "=" + (.value|tostring) + "\u0000"' "$config" > "$config.env"
  while IFS= read -r -d '' assignment; do export "${assignment?}"; done < "$config.env"
  export COMPOSE_FILE="$file" COMPOSE_PROJECT_NAME="$project" COMPOSE_ENV_FILES="$RUNTIME_ENV_FILE"
  bash "$root/scripts/backup.sh"
)
migrate_before_replace() {
  : "${old_api:?}" "${API_IMAGE:?}"
  local previous next
  previous=$(migration_fingerprint "$old_api")
  next=$(migration_fingerprint "$API_IMAGE")
  if [[ $previous == "$next" ]]; then echo 'No new migrations'; return 0; fi
  backup_before_migrate
  # This fails before up; the running API is untouched if backup/migrate fails.
  compose run --rm --no-deps --entrypoint node "$api" \
    node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma
}
