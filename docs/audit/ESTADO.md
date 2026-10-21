# Estado de la auditoría ttd-codex (TTD-AUD-01…73)

Fuente: `docs/spec/ttd-codex/ttd-codex-especificacion-unica.md`  
Worktree: `todo-worktrees/ttd-aud-fase-0` · Rama: `fix/ttd-aud-fase-0`  
Base: `origin/main` @ arranque de la rama.

| ID | Fase | Estado | PR | Notas |
|---|---|---|---|---|
| TTD-AUD-01 | 0 | verificado en tests | #60 | Tests: filters.spec, row-date.spec, automation-dates.e2e, matrix/propose |
| TTD-AUD-02 | 0 | verificado en tests | #61 | Tests: nlp/parse.spec time ranges; task-composer.e2e |
| TTD-AUD-03 | 5 | corregido | #71 | Atajos de día → all-day si no había fecha |
| TTD-AUD-04 | 5 | corregido | #71 | Chip Cuándo = start??due; duración nowrap; Hasta en DatePopover |
| TTD-AUD-05 | 2 | verificado en main | #68 | Menú acciones; verificar tras 64 si hace falta pulido |
| TTD-AUD-06 | 5 | corregido | #71 | save sin await refresh; carga «Cargando…» + skeleton |
| TTD-AUD-07 | 2 | verificado en main | #69 | Gate Ticky + layout; 63 puede ampliar el interruptor |
| TTD-AUD-08 | 2 | corregido | #71 | Interruptor en Funcionalidades (vía 63) |
| TTD-AUD-09 | 0 | verificado en main | #72 | Ya en main: semana calendario local; no reimplementar |
| TTD-AUD-10 | 0 | corregido | #71 | formatFocusDuration redondea; /focus etiquetado como total |
| TTD-AUD-11 | 0 | verificado en tests | #67 | Test: weekly-automation.e2e-spec.ts |
| TTD-AUD-12 | 5 | corregido | #71 | Chip control muestra N/100 |
| TTD-AUD-13 | 5 | corregido | #71 | Button + etiquetas Campo/Combinar + .condition |
| TTD-AUD-14 | 2 | corregido | #71 | Botón info icono; ámbito filtra NOTE |
| TTD-AUD-15 | 5 | corregido | #71 | Acciones papelera a la derecha en meta |
| TTD-AUD-16 | 0 | corregido | #71 | Purga optimista + rollback; contador trash |
| TTD-AUD-17 | 5 | corregido | #71 | Button primary en Nueva lista/etiqueta |
| TTD-AUD-18 | 5 | corregido | #71 | Tras borrar lista → /inbox |
| TTD-AUD-19 | 5 | corregido | #71 | NotFoundPage en ruta * |
| TTD-AUD-20 | 5 | corregido | #71 | Anillo SVG + presets aria-pressed + error/carga |
| TTD-AUD-21 | 3 | corregido | #71 | h1 nowrap; emoji fuera del clamp |
| TTD-AUD-22 | 5 | corregido | #71 | Tokens dark --countdown-*-bg/ink |
| TTD-AUD-23 | 5 | corregido | #71 | Dialog i18n; labels flex; date lang; ui-select |
| TTD-AUD-24 | 5 | corregido | #71 | Popover Nueva + LayoutGrid; confirm inline |
| TTD-AUD-25 | 5 | corregido | #71 | Active/hover + rail + segmented theme contraste |
| TTD-AUD-26 | 5 | corregido | #71 | Login submit usa --accent |
| TTD-AUD-27 | 5 | corregido | #71 | Countdown + Ticky settings/routines/proposal i18n |
| TTD-AUD-28 | 0 | verificado en tests | #66 | Tests: run-action.spec.ts, query-client.spec.ts |
| TTD-AUD-29 | 0 | corregido | #71 | onUnauthorized → login?next=; red ≠ logout |
| TTD-AUD-30 | 5 | corregido | #71 | Boundary por ruta + i18n; reset al navegar |
| TTD-AUD-31 | 5 | corregido | #71 | Focus/filters/matrix/countdowns/features/workday ErrorState+Skeleton |
| TTD-AUD-32 | 5 | corregido | #71 | Plural; sin confirm() nativo en hábitos/plan/review |
| TTD-AUD-33 | 3 | corregido | #71 | Hoja inferior «Más»; Ticky filtrado; scrim encima |
| TTD-AUD-34 | 5 | aplazado | #71 | Origen no analizado; login/auth sin errores de código evidentes |
| TTD-AUD-35 | 4 | verificado en main | #63 | Paginación tokens; no reimplementar |
| TTD-AUD-36 | 4 | verificado en tests | #71 | tokenExpired + UI pill; token-groups.spec |
| TTD-AUD-37 | 4 | verificado en main | #62 | OAuth name conflicts; no reimplementar |
| TTD-AUD-38 | 4 | corregido (parcial) | #71 | UI etiquetas+lifecycle; paginación activity = ops/API |
| TTD-AUD-39 | 4 | corregido | #71 | Error revoke en banda; 409 nombre tomado |
| TTD-AUD-40 | 4 | corregido | #71 | aria-live sin secreto; dismiss explícito |
| TTD-AUD-41 | 4 | corregido | #71 | manage/countdowns/sensitive + scopes.spec |
| TTD-AUD-42 | 4 | verificado en main | #64 | Consentimiento OAuth; no reimplementar |
| TTD-AUD-43 | 4 | verificado en main | #65 | Reconexión Google; depende de 47 para testing |
| TTD-AUD-44 | 4 | corregido | #71 | Telegram pairing + inbound regenerate confirm |
| TTD-AUD-45 | 4 | corregido | #71 | Webhook rotate confirm + feed Copiar URL |
| TTD-AUD-46 | 4 | corregido | #71 | Lista revocados con estilo |
| TTD-AUD-47 | 4 | corregido (parcial) | #71 | ?google=denied + mensaje; GCP console = ops manual |
| TTD-AUD-48 | 1 | corregido | #71 | tag_ids/tags + add/remove en create/update |
| TTD-AUD-49 | 1 | corregido | #71 | quick_add + parse=true en create/update |
| TTD-AUD-50 | 1 | corregido | #71 | delete_task / restore_task (scope tasks:trash) |
| TTD-AUD-51 | 1 | corregido | #71 | content + list/add comments + list attachments |
| TTD-AUD-52 | 1 | corregido | #71 | + reminders MCP + list_tasks tag/from/to/priority |
| TTD-AUD-53 | 1 | corregido | #71 | reopen/cancel + status en list_tasks; flujo vía column_id |
| TTD-AUD-54 | 0 | corregido | #71 | Validación estricta MCP con validateMcpArgs |
| TTD-AUD-55 | 0 | corregido | #71 | parseTaskInstant YYYY-MM-DD → medianoche local + is_all_day |
| TTD-AUD-56 | 0 | corregido | #71 | deriveDurationMinutes rechaza mismatch; no pisa explicit |
| TTD-AUD-57 | 1 | corregido | #71 | MCP created_via + activity vía token en detalle; cuentas/persona = ops |
| TTD-AUD-58 | 3 | corregido | #71 | outlet sin padding-top; sticky bajo cabecera; viewport-fit |
| TTD-AUD-59 | 2 | corregido (parcial) | #71 | ViewPrefs local + print + hideCompleted; syncAcrossDevices flag local (server sync = follow-up) |
| TTD-AUD-60 | 2 | corregido | #71 | Detalle fijo + abrir tarea en ruta actual (matrix/calendar/plan/focus) |
| TTD-AUD-61 | 2 | corregido | #71 | sectionOf + CalendarSidebar mini-mes |
| TTD-AUD-62 | 2 | corregido | #71 | minimalQuadrantPatch; skip mismo cuadrante; undo; no clear en drop |
| TTD-AUD-63 | 2 | corregido | #71 | Flag ticky + useTickyAvailable; FeatureRoute; server-off bloquea switch |
| TTD-AUD-64 | 2 | corregido | #71 | Capture card + Popover + addDescription + submit visible en sheet |
| TTD-AUD-65 | 0 | corregido | #71 | taskEventSnapshot + migración strip activity |
| TTD-AUD-66 | 2 | corregido | #71 | ViewMenu + prefs por vista; cabecera unificada vía Board |
| TTD-AUD-67 | 2 | corregido | #71 | Inbox usa Board + ViewMenu; Procesar todo se mantiene |
| TTD-AUD-68 | 2 | corregido | #71 | Kanban por fecha si no hay secciones; sin «Nueva sección» en smart |
| TTD-AUD-69 | 2 | corregido | #71 | Toolbar full-width; zoom i18n; locale; start_date |
| TTD-AUD-70 | 3 | corregido | #71 | page-title ellipsis; badge nowrap; actions shrink-0 |
| TTD-AUD-71 | 3 | corregido | #71 | BottomBar última vista; toolbar sticky; DaySheet ya existía |
| TTD-AUD-72 | 3 | corregido | #71 | matrix-tabs sticky + tabpanel a11y |
| TTD-AUD-73 | 5 | corregido | #71 | Skeleton solo si no hay data cacheada (matrix/countdowns) |

## Resumen por fase

### Fase 0 — cerrada en #71
- Corregidos: 65, 54, 55, 56, 10, 16, 29 (+ verificados en main/tests).

### Fase 1 — MCP casi cerrada en #71
- Corregidos: 48, 49, 50, 51, 53.
- Corregido 52 (reminders + filtros list_tasks) y 57 (created_via MCP + vía en actividad).

### Fases 0–5 — cerradas en #71 (salvo ops/manual)
- Código de auditoría implementado en esta PR.
- Quedan parciales ops: 38 paginación activity, 47 GCP, 59 sync servidor ViewPrefs.
- **Una sola PR (#71); no abrir PRs adicionales.**

### Comprobaciones manuales pendientes
- Tras desplegar: editar una tarea 10+ veces y confirmar que `activity_log.changes` no anida `activity`.
- MCP `create_task` con `due_date: "YYYY-MM-DD"` → all-day en Europe/Madrid.
- MCP `update_task` con campo inventado → `isError: true`.
