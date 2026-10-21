# Estado de la auditoría ttd-codex (TTD-AUD-01…73)

Fuente: `docs/spec/ttd-codex/ttd-codex-especificacion-unica.md`  
Worktree: `todo-worktrees/ttd-aud-fase-0` · Rama: `fix/ttd-aud-fase-0`  
Base: `origin/main` @ arranque de la rama.

| ID | Fase | Estado | PR | Notas |
|---|---|---|---|---|
| TTD-AUD-01 | 0 | verificado en tests | #60 | Tests: filters.spec, row-date.spec, automation-dates.e2e, matrix/propose |
| TTD-AUD-02 | 0 | verificado en tests | #61 | Tests: nlp/parse.spec time ranges; task-composer.e2e |
| TTD-AUD-03 | 5 | pendiente | — | Depende de 01 |
| TTD-AUD-04 | 5 | pendiente | — | Depende de 01, 03 |
| TTD-AUD-05 | 2 | verificado en main | #68 | Menú acciones; verificar tras 64 si hace falta pulido |
| TTD-AUD-06 | 5 | pendiente | — | |
| TTD-AUD-07 | 2 | verificado en main | #69 | Gate Ticky + layout; 63 puede ampliar el interruptor |
| TTD-AUD-08 | 2 | corregido | #71 | Interruptor en Funcionalidades (vía 63) |
| TTD-AUD-09 | 0 | verificado en main | #72 | Ya en main: semana calendario local; no reimplementar |
| TTD-AUD-10 | 0 | corregido | #71 | formatFocusDuration redondea; /focus etiquetado como total |
| TTD-AUD-11 | 0 | verificado en tests | #67 | Test: weekly-automation.e2e-spec.ts |
| TTD-AUD-12 | 5 | pendiente | — | |
| TTD-AUD-13 | 5 | pendiente | — | |
| TTD-AUD-14 | 2 | en curso | #71 | Con 62 (detalle sin salir); UI scope pendiente |
| TTD-AUD-15 | 5 | pendiente | — | |
| TTD-AUD-16 | 0 | corregido | #71 | Purga optimista + rollback; contador trash |
| TTD-AUD-17 | 5 | pendiente | — | |
| TTD-AUD-18 | 5 | pendiente | — | |
| TTD-AUD-19 | 5 | pendiente | — | |
| TTD-AUD-20 | 5 | pendiente | — | |
| TTD-AUD-21 | 3 | pendiente | — | |
| TTD-AUD-22 | 5 | pendiente | — | |
| TTD-AUD-23 | 5 | pendiente | — | |
| TTD-AUD-24 | 5 | pendiente | — | |
| TTD-AUD-25 | 5 | pendiente | — | |
| TTD-AUD-26 | 5 | pendiente | — | |
| TTD-AUD-27 | 5 | pendiente | — | |
| TTD-AUD-28 | 0 | verificado en tests | #66 | Tests: run-action.spec.ts, query-client.spec.ts |
| TTD-AUD-29 | 0 | corregido | #71 | onUnauthorized → login?next=; red ≠ logout |
| TTD-AUD-30 | 5 | pendiente | — | |
| TTD-AUD-31 | 5 | pendiente | — | |
| TTD-AUD-32 | 5 | pendiente | — | |
| TTD-AUD-33 | 3 | pendiente | — | Depende de 63 |
| TTD-AUD-34 | 5 | pendiente | — | |
| TTD-AUD-35 | 4 | verificado en main | #63 | Paginación tokens; no reimplementar |
| TTD-AUD-36 | 4 | pendiente | — | Depende de 35 |
| TTD-AUD-37 | 4 | verificado en main | #62 | OAuth name conflicts; no reimplementar |
| TTD-AUD-38 | 4 | pendiente | — | Depende de 35 |
| TTD-AUD-39 | 4 | pendiente | — | Depende de 35 |
| TTD-AUD-40 | 4 | pendiente | — | Depende de 35 |
| TTD-AUD-41 | 4 | pendiente | — | Depende de 35 |
| TTD-AUD-42 | 4 | verificado en main | #64 | Consentimiento OAuth; no reimplementar |
| TTD-AUD-43 | 4 | verificado en main | #65 | Reconexión Google; depende de 47 para testing |
| TTD-AUD-44 | 4 | pendiente | — | |
| TTD-AUD-45 | 4 | pendiente | — | |
| TTD-AUD-46 | 4 | pendiente | — | Depende de 35 |
| TTD-AUD-47 | 4 | pendiente | — | Código + tarea manual en Google Cloud Console |
| TTD-AUD-48 | 1 | corregido | #71 | tag_ids/tags + add/remove en create/update |
| TTD-AUD-49 | 1 | corregido | #71 | quick_add + parse=true en create/update |
| TTD-AUD-50 | 1 | corregido | #71 | delete_task / restore_task (scope tasks:trash) |
| TTD-AUD-51 | 1 | corregido | #71 | content + list/add comments + list attachments |
| TTD-AUD-52 | 1 | corregido (parcial) | #71 | move_task, parent_id, checklist CRUD, search limit; faltan recordatorios/filtros extra |
| TTD-AUD-53 | 1 | corregido | #71 | reopen/cancel + status en list_tasks; flujo vía column_id |
| TTD-AUD-54 | 0 | corregido | #71 | Validación estricta MCP con validateMcpArgs |
| TTD-AUD-55 | 0 | corregido | #71 | parseTaskInstant YYYY-MM-DD → medianoche local + is_all_day |
| TTD-AUD-56 | 0 | corregido | #71 | deriveDurationMinutes rechaza mismatch; no pisa explicit |
| TTD-AUD-57 | 1 | corregido (parcial) | #71 | source=api en MCP; created_via en get_task; assign_task; cuentas por persona = ops |
| TTD-AUD-58 | 3 | pendiente | — | |
| TTD-AUD-59 | 2 | corregido (parcial) | #71 | ViewPrefs local + print CSS + hideCompleted fijo; sync servidor pendiente |
| TTD-AUD-60 | 2 | corregido | #71 | Detalle fijo + abrir tarea en ruta actual (matrix/calendar/plan/focus) |
| TTD-AUD-61 | 2 | corregido (parcial) | #71 | sectionOf + ocultar sidebar; CalendarSidebar stub (mini-mes pendiente) |
| TTD-AUD-62 | 2 | corregido (parcial) | #71 | Abrir tarea sin salir; drop/reglas pendientes |
| TTD-AUD-63 | 2 | corregido | #71 | Flag ticky + useTickyAvailable; FeatureRoute; server-off bloquea switch |
| TTD-AUD-64 | 2 | corregido (parcial) | #71 | CaptureSheet tarjeta + Popover width/align; menú composer pendiente de pulido |
| TTD-AUD-65 | 0 | corregido | #71 | taskEventSnapshot + migración strip activity |
| TTD-AUD-66 | 2 | corregido (parcial) | #71 | ViewMenu + prefs por vista; cabecera unificada vía Board |
| TTD-AUD-67 | 2 | corregido | #71 | Inbox usa Board + ViewMenu; Procesar todo se mantiene |
| TTD-AUD-68 | 2 | pendiente | — | Depende de 66 |
| TTD-AUD-69 | 2 | pendiente | — | Depende de 66 |
| TTD-AUD-70 | 3 | pendiente | — | Depende de 58, 66 |
| TTD-AUD-71 | 3 | pendiente | — | Depende de 58, 61 |
| TTD-AUD-72 | 3 | pendiente | — | Depende de 58, 62 |
| TTD-AUD-73 | 5 | pendiente | — | Depende de 31 |

## Resumen por fase

### Fase 0 — cerrada en #71
- Corregidos: 65, 54, 55, 56, 10, 16, 29 (+ verificados en main/tests).

### Fase 1 — MCP casi cerrada en #71
- Corregidos: 48, 49, 50, 51, 53.
- Parcial: 52 (faltan recordatorios y más filtros), 57 (ops + UI «vía» pendiente).

### Fase 2 — en curso en #71
- Corregidos: 08, 63; 64 parcial (tarjeta captura + Popover).
- Parcial previos: 60, 61.
- **Una sola PR (#71) hasta el final; no abrir PRs adicionales.**
- Siguiente: 59/66 vistas, 14/62 matrix, rematar 60/61/64.

### Comprobaciones manuales pendientes
- Tras desplegar: editar una tarea 10+ veces y confirmar que `activity_log.changes` no anida `activity`.
- MCP `create_task` con `due_date: "YYYY-MM-DD"` → all-day en Europe/Madrid.
- MCP `update_task` con campo inventado → `isError: true`.
