#!/usr/bin/env bash
# Fails when the tracked tree (git index) would publish private paths,
# images outside the app icons and e2e screenshots, a local home path,
# or a gmail address other than the synthetic calendar fixture.
# Deletions are ignored: a removal of evidence does not fail this check.
# This file is excluded from content checks so its own patterns do not match.
set -euo pipefail

SELF_REL="scripts/public-tree-guard.sh"
GUARD="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
USERS_MARKER='/Users/'
ALLOWED_GMAIL='ada@gmail.com'
OTHER_GMAIL='other@gmail.com'

DIFF_BASE=""
SELF_TEST=0

usage() {
  echo "usage: public-tree-guard.sh [--self-test] [--diff-base REV]" >&2
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --self-test)
      SELF_TEST=1
      shift
      ;;
    --diff-base)
      [ $# -ge 2 ] || usage
      DIFF_BASE="$2"
      shift 2
      ;;
    *)
      usage
      ;;
  esac
done

fail() {
  echo "public-tree-guard: $*" >&2
  return 1
}

forbidden_path() {
  case "$1" in
    docs/audit | docs/audit/* | docs/spec | docs/spec/* | docs/reviews | docs/reviews/* | docs/private | docs/private/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

forbidden_image() {
  case "$1" in
    *.png | *.jpg | *.jpeg | *.gif | *.webp | *.ico) ;;
    *)
      return 1
      ;;
  esac
  case "$1" in
    apps/web/public/* | apps/web/e2e/__screenshots__/*)
      return 1
      ;;
    *)
      return 0
      ;;
  esac
}

check_paths() {
  local path
  while IFS= read -r -d '' path; do
    if forbidden_path "$path"; then
      fail "forbidden path: $path"
      return 1
    fi
    if forbidden_image "$path"; then
      fail "image outside allowed directories: $path"
      return 1
    fi
  done < <(git ls-files -z)
}

check_index_content() {
  local status hits bad
  set +e
  hits="$(git grep --cached -I -l -F -e "$USERS_MARKER" -- . ":(exclude)$SELF_REL" 2>/dev/null)"
  status=$?
  set -e
  if [ "$status" -eq 0 ] && [ -n "$hits" ]; then
    fail "local home path in the index"
    return 1
  fi
  if [ "$status" -gt 1 ]; then
    fail "could not scan index content"
    return 1
  fi

  set +e
  hits="$(git grep --cached -I -h -o -E '[A-Za-z0-9._%+-]+@gmail\.com' -- . ":(exclude)$SELF_REL" 2>/dev/null)"
  status=$?
  set -e
  if [ "$status" -gt 1 ]; then
    fail "could not scan index addresses"
    return 1
  fi
  if [ "$status" -eq 0 ]; then
    bad="$(printf '%s\n' "$hits" | awk -v ok="$ALLOWED_GMAIL" 'NF && $0 != ok { print }')"
    if [ -n "$bad" ]; then
      fail "disallowed gmail address in the index"
      return 1
    fi
  fi
}

check_diff() {
  local base="$1"
  local tmp path added bad
  tmp="$(mktemp)"
  git diff -U0 --name-only --diff-filter=AM "$base" -- . ":(exclude)$SELF_REL" >"$tmp"
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    if forbidden_path "$path"; then
      rm -f "$tmp"
      fail "forbidden path added or modified: $path"
      return 1
    fi
    if forbidden_image "$path"; then
      rm -f "$tmp"
      fail "image added or modified outside allowed directories: $path"
      return 1
    fi
  done <"$tmp"

  git diff -U0 --diff-filter=AM "$base" -- . ":(exclude)$SELF_REL" \
    | awk 'BEGIN { keep=0 } /^\+\+\+/ { next } /^\+/ { print substr($0, 2) }' >"$tmp"
  if grep -F -q -- "$USERS_MARKER" "$tmp"; then
    rm -f "$tmp"
    fail "local home path in added or modified lines"
    return 1
  fi
  bad="$(grep -o -E '[A-Za-z0-9._%+-]+@gmail\.com' "$tmp" || true)"
  bad="$(printf '%s\n' "$bad" | awk -v ok="$ALLOWED_GMAIL" 'NF && $0 != ok { print }')"
  rm -f "$tmp"
  if [ -n "$bad" ]; then
    fail "disallowed gmail address in added or modified lines"
    return 1
  fi
}

check_tree() {
  check_paths || return 1
  check_index_content || return 1
  if [ -n "${1:-}" ]; then
    check_diff "$1" || return 1
  fi
}

new_repo() {
  local dir
  dir="$(mktemp -d)"
  git init -q -b main "$dir"
  printf '%s\n' "$dir"
}

commit_in() {
  git -C "$1" -c user.name=Guard -c user.email=ada@example.com commit -q -m "$2"
}

expect_pass() {
  local dir="$1"
  local label="$2"
  shift 2
  if ! (cd "$dir" && bash "$GUARD" "$@"); then
    echo "public-tree-guard: expected pass: $label" >&2
    return 1
  fi
}

expect_fail() {
  local dir="$1"
  local label="$2"
  shift 2
  if (cd "$dir" && bash "$GUARD" "$@"); then
    echo "public-tree-guard: expected failure: $label" >&2
    return 1
  fi
}

self_test() {
  local root dir
  root="$(git rev-parse --show-toplevel)"

  echo "case 1: deleting evidence passes"
  dir="$(new_repo)"
  printf '%s\n' "${USERS_MARKER}hidden" >"$dir/evidence.txt"
  git -C "$dir" add evidence.txt
  commit_in "$dir" add
  git -C "$dir" rm -q evidence.txt
  commit_in "$dir" remove
  expect_pass "$dir" "case 1 index"
  expect_pass "$dir" "case 1 diff" --diff-base HEAD~1
  rm -rf "$dir"

  echo "case 2: adding a private path fails"
  dir="$(new_repo)"
  mkdir -p "$dir/docs/private"
  printf 'note\n' >"$dir/docs/private/note.md"
  git -C "$dir" add docs/private/note.md
  expect_fail "$dir" "case 2"
  rm -rf "$dir"

  echo "case 3: another gmail address or a local home path fails"
  dir="$(new_repo)"
  printf '%s\n' "$OTHER_GMAIL" >"$dir/note.txt"
  git -C "$dir" add note.txt
  expect_fail "$dir" "case 3 gmail"
  rm -rf "$dir"
  dir="$(new_repo)"
  printf '%s\n' "${USERS_MARKER}hidden" >"$dir/note.txt"
  git -C "$dir" add note.txt
  expect_fail "$dir" "case 3 home"
  rm -rf "$dir"

  echo "case 4: synthetic ada mailbox passes"
  dir="$(new_repo)"
  printf '%s\n' "$ALLOWED_GMAIL" "ada@example.com" "test@example.test" >"$dir/calendar.txt"
  git -C "$dir" add calendar.txt
  expect_pass "$dir" "case 4"
  rm -rf "$dir"

  echo "case 5: this script passes"
  dir="$(new_repo)"
  mkdir -p "$dir/scripts"
  cp "$GUARD" "$dir/$SELF_REL"
  git -C "$dir" add "$SELF_REL"
  expect_pass "$dir" "case 5"
  rm -rf "$dir"

  echo "real tree"
  expect_pass "$root" "real tree"
}

if [ "$SELF_TEST" -eq 1 ]; then
  self_test
fi

check_tree "$DIFF_BASE"
