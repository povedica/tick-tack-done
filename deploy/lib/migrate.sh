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
backup_daily_external() (
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
# Local safety copy for deployments; the daily RF-1704 off-site path stays separate.
backup_before_migrate() (
  set +x
  set -euo pipefail
  umask 077
  local config base destination archive stamp retention db_user db_name count candidate
  config=$(compose config --format json)
  base=${PRE_MIGRATE_BACKUP_DIR:-$(jq -r --arg api "$api" '.services[$api].environment.PRE_MIGRATE_BACKUP_DIR // empty' <<< "$config")}
  base=${base:-${root%%/releases/*}/backups/pre-migrate}
  retention=${BACKUP_RETENTION_DAYS:-$(jq -r --arg api "$api" '.services[$api].environment.BACKUP_RETENTION_DAYS // 30' <<< "$config")}
  [[ $retention =~ ^[0-9]+$ ]] || return 64
  # Reject release paths both before and after resolving symlinks and '..'.
  [[ $base == /* && $base != */releases && $base != */releases/* ]] || return 64
  mkdir -p "$base"
  base=$(cd "$base" && pwd -P)
  [[ $base != */releases && $base != */releases/* ]] || return 64
  chmod 700 "$base"
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  destination="$base/$stamp"
  mkdir -m 700 "$destination"
  archive="$destination/db.sql.gz"
  trap 'rm -f "$archive.partial"' EXIT
  db_user=$(jq -r '.services.postgres.environment.POSTGRES_USER // "reflexionia"' <<< "$config")
  db_name=$(jq -r '.services.postgres.environment.POSTGRES_DB // "reflexionia"' <<< "$config")
  compose exec -T postgres pg_dump -U "$db_user" "$db_name" | gzip > "$archive.partial"
  [[ -s $archive.partial && $(gzip -cd "$archive.partial" | wc -c) -gt 0 ]]
  chmod 600 "$archive.partial"
  mv "$archive.partial" "$archive"
  printf '[pre-migrate] %s (%s bytes)\n' "$archive" "$(wc -c < "$archive" | tr -d '[:space:]')"
  # Only timestamped successful copies participate; always preserve the newest three.
  count=0
  while IFS= read -r candidate; do
    [[ ${candidate##*/} =~ ^[0-9]{8}T[0-9]{6}Z$ && -f $candidate/db.sql.gz ]] || continue
    count=$((count + 1))
    if (( count > 3 )); then
      find "$candidate" -maxdepth 0 -type d -mtime +"$retention" -exec rm -rf -- {} +
    fi
  done < <(find "$base" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort -r)
)
migrate_before_replace() {
  : "${old_api:?}" "${API_IMAGE:?}"
  local previous next
  previous=$(migration_fingerprint "$old_api")
  next=$(migration_fingerprint "$API_IMAGE")
  if [[ $previous == "$next" ]]; then echo 'No new migrations'; return 0; fi
  backup_before_migrate
  # Entrypoint is already node: the first argument is the Prisma JS file.
  # This fails before up; the running API is untouched if backup/migrate fails.
  compose run --rm --no-deps --entrypoint node "$api" \
    node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma
}
