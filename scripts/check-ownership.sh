#!/usr/bin/env bash
# check-ownership.sh <a|b|c|d|e|f> <worktree> [base]
set -euo pipefail
pkg="${1:?paquete a|b|c|d|e|f}"; wt="${2:?ruta del worktree}"; base="${3:-main}"
cd "$wt"
# Local-only: caller chooses the baseline explicitly; do not fetch or modify remote refs.
mb=$(git merge-base "$base" HEAD)
files=$(git diff --name-only --no-renames "$mb" HEAD)

GEN='^(apps/api/openapi\.json|apps/api/src/mcp/api-operations\.json|packages/sdk/src/generated/schema\.d\.ts)$'
FORBID='^((.*/)?package\.json|pnpm-lock\.yaml|CHANGELOG\.md|\.github/.*|apps/web/src/i18n/(es|en|extra)\.ts|apps/web/src/styles/tokens\.css|apps/web/playwright\.config\.ts|apps/web/playwright\.r80\.config\.ts|apps/web/e2e/r80\.fixture\.ts|\.env-config/.*|(.*/)?\.env|(.*/)?\.env\.[^/]*|docker-compose\.worktree\.local\.yml|docker-compose(\.dev)?\.yml)$'
DENY=''; REVIEW=''; ALLOW=''
j() { paste -sd'|' -; }   # une líneas con |

case "$pkg" in
a) ALLOW=$(j <<'L'
^apps/web/src/features/calendar/
^apps/web/src/features/places/
^apps/web/src/shell/CalendarSidebar(\.spec)?\.tsx$
^apps/web/src/components/(Popover|DatePopover)(\.spec)?\.tsx$
^apps/web/src/components/inline-time\.css$
^apps/web/src/components/period/
^apps/web/playwright\.wt-a\.config\.ts$
^apps/web/e2e/wt-a[-.]
^docs/audit/ttd-wt-a-calendario\.md$
L
)
   REVIEW=$(j <<'L'
^apps/web/src/shell/shell\.css$
^apps/web/src/shell/AppShell\.tsx$
L
) ;;
b) ALLOW=$(j <<'L'
^apps/web/src/features/tasks/TaskList(\.spec)?\.tsx$
^apps/web/src/features/tasks/row-date(\.spec)?\.ts$
^apps/web/src/features/tasks/(kanban-wt-b\.css|KanbanTabs(\.spec)?\.tsx|KanbanMoveSheet(\.spec)?\.tsx|i18n-wt-b(\.spec)?\.ts)$
^apps/web/src/features/today/
^apps/web/playwright\.wt-b\.config\.ts$
^apps/web/e2e/wt-b[-.]
^docs/audit/ttd-wt-b-kanban\.md$
L
)
   REVIEW=$(j <<'L'
^apps/web/src/components/ui\.css$
^apps/web/src/components/ViewMenu(\.spec)?\.tsx$
^apps/web/src/features/(views|matrix)/
L
) ;;
c) ALLOW=$(j <<'L'
^apps/api/src/modules/integrations/(telegram-[^/]*|focus-telegram\.listener(\.spec)?\.ts|integrations\.module\.ts)$
^apps/api/src/integrations/telegram-[^/]*$
^apps/api/src/notifications/
^apps/api/src/scheduler/reminder\.transport(\.spec)?\.ts$
^apps/api/src/security/runtime-config(\.spec)?\.ts$
^apps/api/prisma/schema\.prisma$
^apps/api/prisma/migrations/[0-9]{14}_telegram_link_bot_id_cleanup/
^(apps/api/)?scripts/(telegram-legacy-cleanup\.ts|rollback-telegram-link-bot-id\.sql|telegram-[^/]*\.mjs)$
^packages/domain/src/reminders/preferences(\.spec)?\.ts$
^apps/api/test/(telegram-|notification-|wt-c-)[^/]*$
^apps/web/src/features/settings/(TelegramCard|TelegramBotSettings|NotificationsPage|LegacyNotificationSettings)(\.spec)?\.tsx$
^apps/web/src/features/settings/(telegram|notifications)\.css$
^apps/web/src/features/settings/i18n-wt-c(\.spec)?\.ts$
^packages/sdk/src/resources\.ts$
^apps/web/playwright\.wt-c\.config\.ts$
^apps/web/e2e/wt-c[-.]
^docs/audit/ttd-wt-c-telegram\.md$
L
)
   REVIEW=$(j <<'L'
^apps/api/src/modules/integrations/integrations\.controller(\.spec)?\.ts$
^apps/api/src/integrations/config\.ts$
^apps/api/src/events/domain-events\.ts$
^apps/web/src/api\.ts$
L
) ;;
d) ALLOW=$(j <<'L'
^apps/api/src/modules/(tasks|planning|search)/
^apps/api/src/scheduler/scheduler\.service(\.spec)?\.ts$
^apps/api/src/mcp/
^apps/api/src/drive/
^apps/api/src/prisma/series-lock(\.spec)?\.ts$
^(apps/api/)?scripts/repair-allday-utc\.ts$
^apps/api/test/wt-d-[^/]*$
^docs/audit/ttd-wt-d-api-mcp\.md$
L
)
   REVIEW=$(j <<'L'
^apps/api/src/auth/
L
) ;;
e) ALLOW=$(j <<'L'
^apps/api/src/modules/(focus|reports)/
^apps/api/src/reading/weekly-report(\.spec)?\.ts$
^apps/api/test/wt-e-[^/]*$
^apps/web/src/features/focus/
^apps/web/src/features/settings/(FocusSettingsPage|DriveCard|GoogleCalendarsCard)(\.spec)?\.tsx$
^apps/web/src/features/settings/(i18n-wt-e(\.spec)?\.ts|settings-wt-e\.css)$
^apps/web/src/features/product/
^apps/web/src/features/tasks/anchor-fix(\.spec)?\.ts$
^apps/web/playwright\.wt-e\.config\.ts$
^apps/web/e2e/wt-e[-.]
^docs/audit/ttd-wt-e-ajustes-foco-informes\.md$
L
)
   REVIEW=$(j <<'L'
^apps/api/src/modules/automations/automations\.controller(\.spec)?\.ts$
^apps/api/src/modules/stats/
^apps/web/src/features/statistics/
^apps/web/src/features/tasks/TaskDetail\.tsx$
^apps/web/src/features/product/ProductPages\.tsx$
L
)
   DENY='^apps/web/src/features/product/WeekPicker\.tsx$' ;;
f) ALLOW=$(j <<'L'
^apps/web/src/features/planning/
^packages/domain/src/planning/
^apps/api/src/modules/planning/
^apps/api/src/mcp/tools/planning-tools(\.spec)?\.ts$
^apps/api/prisma/migrations/[0-9]{14}_plan_[^/]*/
^apps/api/test/wt-f-[^/]*$
^apps/web/playwright\.wt-f\.config\.ts$
^apps/web/e2e/wt-f[-.]
^docs/audit/(ttd-wt-f-plan-del-dia|plan-del-dia-mejoras)\.md$
^docs/audit/ttd-wt-f-assets/
^scripts/check-ownership\.sh$
L
)
   REVIEW=$(j <<'L'
^apps/web/src/app\.tsx$
^apps/web/src/features/closing/ShutdownPage\.tsx$
^apps/web/src/features/today/(TodayPlanStrip\.tsx|today-support\.css)$
^apps/web/e2e/(plan-day-review|r80-plan-sources|today-plan-habits|day-load|day-closing)\.spec\.ts$
^packages/domain/src/index\.ts$
^apps/api/src/mcp/mcp\.catalog\.ts$
^apps/api/prisma/schema\.prisma$
^apps/api/test/day-closing\.e2e-spec\.ts$
^docs/mcp/CHANGELOG\.md$
L
)
   DENY='^apps/web/src/(shell/|features/(calendar|places|product|tasks)/|components/(ui\.css|ui\.tsx|DatePopover\.tsx)|api\.ts$)|^apps/api/src/modules/tasks/' ;;
*) echo "paquete desconocido: $pkg" >&2; exit 2 ;;
esac

fail=0; n=0; review_list=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  n=$((n+1))
  if [ "$f" = ".env.example" ]; then
    if [ "$pkg" = c ]; then review_list="$review_list
REVISAR  $f  (solo comentarios de Telegram)"; else echo "PROHIBIDO  $f"; fail=1; fi
    continue
  fi
  if echo "$f" | grep -Eq "$FORBID"; then echo "PROHIBIDO (común)  $f"; fail=1; continue; fi
  if echo "$f" | grep -Eq "$GEN"; then
    case "$pkg" in c|d|e|f) continue ;; *) echo "PROHIBIDO (generado en paquete solo web)  $f"; fail=1; continue ;; esac
  fi
  # Exact F scope extensions explicitly authorized by Pablo; see the F audit report.
  if [ "$pkg" = f ] && echo "$f" | grep -Eq '^(apps/api/src/auth/auth-user\.ts|apps/api/src/modules/tasks/tasks\.service\.ts|apps/api/src/mcp/mcp\.service\.ts|apps/api/test/(maintenance-r80|oauth-process-restart)\.e2e-spec\.ts|scripts/r80-local-fixture\.ts)$'; then
    review_list="$review_list
REVISAR (autorizado)  $f"
    continue
  fi
  if [ -n "$DENY" ] && echo "$f" | grep -Eq "$DENY"; then echo "PROHIBIDO ($pkg)  $f"; fail=1; continue; fi
  if [ -n "$REVIEW" ] && echo "$f" | grep -Eq "$REVIEW"; then review_list="$review_list
REVISAR  $f  (permitido solo en parte: ver sección 4 del documento)"; continue; fi
  if echo "$f" | grep -Eq "$ALLOW"; then continue; fi
  echo "FUERA DE LISTA  $f"; fail=1
done <<EOF_FILES
$files
EOF_FILES

# Commits que tocan generados no deben tocar nada más
for c in $(git rev-list "$mb"..HEAD); do
  cf=$(git diff-tree --no-commit-id --name-only -r --no-renames "$c")
  if echo "$cf" | grep -Eq "$GEN"; then
    other=$(echo "$cf" | grep -Ev "$GEN" || true)
    if [ -n "$other" ]; then echo "COMMIT $(git log -1 --format='%h %s' "$c") mezcla generados con otros ficheros"; fail=1; fi
  fi
done

[ -n "$review_list" ] && printf '%s\n' "$review_list" | sed '/^$/d'
if [ "$fail" -eq 0 ]; then echo "OK ($n ficheros) · paquete $pkg · base $(git rev-parse --short "$mb")"; else echo "FALLO · paquete $pkg"; fi
exit "$fail"
