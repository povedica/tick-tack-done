#!/usr/bin/env bash
set +x
set -euo pipefail
# Usage: render-env.sh <Environment ID> <runtime output>; CLI >= 2.42.0.
[[ $# == 2 ]] || { echo 'Expected Environment ID and output path' >&2; exit 64; }
root="$(cd "$(dirname "$0")/../.." && pwd)"
exec python3 "$root/scripts/secrets/env_tools.py" render "$@"
