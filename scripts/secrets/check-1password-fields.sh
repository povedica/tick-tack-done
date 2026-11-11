#!/usr/bin/env bash
set +x
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
exec python3 "$root/scripts/secrets/env_tools.py" check "$@"
