#!/usr/bin/env bash
set +x
set -euo pipefail
# Metadata only: env_tools never passes --reveal when checking names.
[[ $# == 1 ]] || { echo 'Expected one Environment ID or name' >&2; exit 64; }
root="$(cd "$(dirname "$0")/../.." && pwd)"
exec python3 "$root/scripts/secrets/env_tools.py" check "$@"
