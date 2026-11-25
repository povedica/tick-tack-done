#!/usr/bin/env bash
# Checksum-pinned sentry-cli 3.8.2 for Linux x86_64. Prints the binary path.
# The hash is of the GitHub release asset, so a swapped download does not run.
set -euo pipefail
version=3.8.2
expected=c958865f9d4000183509ea21b1f04925d5390de6d8d87386b9e69f2b305070c3
dest="${SENTRY_CLI_BIN:-${RUNNER_TEMP:-/tmp}/sentry-cli-${version}}"
if [[ ! -x $dest ]]; then
  url="https://github.com/getsentry/sentry-cli/releases/download/${version}/sentry-cli-Linux-x86_64"
  tmp=$(mktemp)
  curl -fsSL "$url" -o "$tmp"
  echo "${expected}  ${tmp}" | sha256sum -c -
  chmod 755 "$tmp"
  mv "$tmp" "$dest"
fi
printf '%s\n' "$dest"
