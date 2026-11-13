#!/usr/bin/env bash
# CI-only PostgreSQL 17 clients, using the already running service.
set -euo pipefail
: "${POSTGRES_CONTAINER:?}"
umask 077
case "$(basename "$0")" in
  pg_dump)
    # data-safety.ts writes a custom-format archive to a host file.
    [[ $# == 3 && $1 == --format=custom && $2 == --file ]] || exit 64
    docker exec "$POSTGRES_CONTAINER" pg_dump --format=custom \
      -U "${PGUSER:?}" -d "${PGDATABASE:?}" > "$3"
    ;;
  pg_restore)
    [[ $# == 2 && $1 == --list ]] || exit 64
    docker exec -i "$POSTGRES_CONTAINER" pg_restore --list < "$2"
    ;;
  *) exit 64 ;;
esac
