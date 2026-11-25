#!/usr/bin/env bash
# Browser suites used to share the code-checks runner with lint and typecheck.
# Two invocations stay: filters.spec.ts owns its theme/viewport matrix and the
# default Vite server (port 4173). The r80 specs need playwright.r80.config.ts
# (four projects, preview build on port 4182). CI calls this once per suite,
# from separate jobs, so each server has its own runner.
#
# --workers=2. workers=1 was inertia: the old comment only explained the two
# configs. These specs do not share an account, storageState, or database.
# Each test stubs the API on its own page (page.route or an in-memory boot).
# Screenshot and waterfall paths include the theme, the viewport, or the
# Playwright project name, so workers do not write the same file. They share
# the one webServer Playwright starts for that process; that is how Playwright
# is meant to run. Two workers, not four: Chromium is heavy beside Vite on a
# 4-vCPU runner.
set -euo pipefail
suite=${1:?usage: run-e2e.sh r80|filters}
case "$suite" in
  r80)
    pnpm --filter web build
    R80_PHASE=despues R80_PREVIEW=1 pnpm --filter web exec playwright test \
      --config playwright.r80.config.ts \
      r80-agenda-performance.spec.ts \
      r80-google.spec.ts \
      r80-integrations.spec.ts \
      r80-links.spec.ts \
      r80-about.spec.ts \
      r80-push-actions.spec.ts \
      production-session.spec.ts \
      password-reset.spec.ts \
      --workers=2
    ;;
  filters)
    pnpm --filter web exec playwright test \
      --config playwright.config.ts \
      filters.spec.ts \
      --workers=2
    ;;
  *)
    echo "unknown e2e suite: ${suite}" >&2
    exit 2
    ;;
esac
