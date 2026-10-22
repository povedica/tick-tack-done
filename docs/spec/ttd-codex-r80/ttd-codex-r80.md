---
title: "tick-tack-done — TTD-AUD-80 a 104: MCP/API, calendario y UI, adjuntos en Drive, enlaces, Pomodoro, notificaciones y Telegram"
---

# tick-tack-done — TTD-AUD-80 a 104: MCP/API, calendario y UI, adjuntos solo en Google Drive, enlaces, Pomodoro, notificaciones y Telegram (escritorio y móvil)

- **Aplicación:** https://todo.reflexionia.com
- **Repositorio:** https://github.com/povedica/tick-tack-done
- **Base del análisis:** `main` en **`afc9f5d`** (22/10/2026, 09:04 hora de Madrid). Ya incluye las PR #71 (`eb5971c`), #73 (`acd7570`) y #74 (`7d0eccc`).
- **Producción** (comprobado el 22/10 a las 09:07, hora de Madrid):
  - API: `GET /api/v1/health` devuelve `commit: acd75706…`;
  - web: bundle `index-BXxYLHK4.js`, redesplegado a las 09:07, con todo lo de #73.
- **Fecha:** 22/10/2026 (hora de Madrid).
- **Fuentes:**
  1. Revisión de Pablo del 22/10 sobre `acd7570`, incluida en el zip como `r80/revision-pablo.md`.
  2. Informe MCP con 53 pruebas en vivo del 22/10, de 09:13 a 09:21 (hora de Madrid): `r80-mcp/informe-mcp.md`.
  3. Recorrido de la UI en producción del 22/10, de 09:00 a 09:10. Las capturas `TTD-R80_*` se tomaron en la pantalla de la caja, de **1024×640**; las móviles `TTD-R80_m*` se emularon con zoom, ~427 px CSS.
  4. Funciones nuevas pedidas por Pablo: adjuntos solo en Drive, enlaces, Pomodoro, notificaciones y Telegram.
  5. Referencias de TickTick de solo lectura (`REF-TICKTICK_*`), tomadas el 20 y 21/10 a 1280×800.
- **Documento autónomo:** contiene todo lo necesario para implementar estos 25 puntos sin la especificación general ni `ttd-codex-r75.md`.
- **Rutas de código:** `web/` = `apps/web/src/`, `api/` = `apps/api/src/`, `domain/` = `packages/domain/src/`, `sdk/` = `packages/sdk/src/`, `prisma/` = `apps/api/prisma/`. Las líneas son de `afc9f5d`; si se han movido, busca el código por el símbolo.
- **Puntos de corte:**
  - **escritorio:** ≥ 1024 px, con referencia **1280×800**;
  - **móvil:** ≤ 768 px, con referencia **390×844**;
  - entre 769 y 1023 px se aplica lo de móvil, porque `useNarrow()` es `(max-width: 1023px)`.
- **«A verificar»:** marca lo que no he podido confirmar en código ni en producción. Codex debe reproducirlo antes de corregirlo y, si no lo reproduce, dejarlo anotado en la PR con la evidencia.

## 0. Instrucciones para Codex

1. **Objetivo:** corregir los fallos de MCP/API y de UI que Pablo y yo vimos en producción el 22/10, y entregar seis mejoras:
   - adjuntos **solo en el Google Drive del usuario**;
   - enlaces en tareas;
   - Pomodoro configurable y visible;
   - notificaciones por canal;
   - Telegram guiado;
   - «Acerca de».
2. **Rama base:** `main` actualizado (`afc9f5d` o posterior). **Tres PR**, una por área, cada una con **un commit por punto**:
   - **PR A:** `fix(TTD-AUD-80..86): MCP/API reliability, recurrence, ranges, focus and Drive token`;
   - **PR B:** `fix(TTD-AUD-87..98): calendar day/two-weeks, detail pane, composer context and UI polish`;
   - **PR C:** `feat(TTD-AUD-99..104): Drive-only attachments, task links, Pomodoro settings, notification channels, Telegram and About`.
   - Nombres de commit: `fix(TTD-AUD-NN): …` o `feat(TTD-AUD-NN): …`.
   - **Orden recomendado:** PR A (80, 81 y 86 primero), luego PR C (99 antes que 100), luego PR B. La PR B puede ir en paralelo.
3. **Exigencias de Pablo, obligatorias en cada PR:**
   - **Capturas antes/después de cada pantalla tocada**, a **1280×800 y 390×844**, en tema **claro y oscuro**. Nómbralas `docs/audit/evidencias/r80/<ID>_<pantalla>_<antes|despues>_<desktop|mobile>_<light|dark>.png` y enlázalas en la descripción de la PR, en una tabla por punto.
   - **Criterios de aceptación** recorridos uno a uno en la PR: «✅ comprobado (cómo, viewport)» o «❌ no aplica / bloqueado (por qué)».
   - **Medidas:** las de este documento son el objetivo. Comprueba con Playwright, con `boundingBox()`, las medidas marcadas como **[medible]**, con una tolerancia de ±1 px.
   - **Estilo:** compacto, fino y sutil; **un único modal de «Añadir tarea»** (el `TaskComposer`/`CaptureSheet` actual); nada de botones grises de 36 px ni rojos rellenos fuera de las confirmaciones.
4. **Reglas de siempre:**
   - **Tokens:** solo los de `web/styles/tokens.css`. Si falta uno, créalo en `:root` y en `[data-theme='dark']` (sección 3).
   - **i18n:** ningún texto en el código; claves en `web/i18n/es.ts`, `en.ts` y `extra.ts`, con las propuestas de cada punto.
   - **Accesibilidad:** roles, `aria-*`, foco visible (`--focus-ring`), teclado completo y objetivos de **44 px** en móvil (`--tap`).
   - **Tests primero:** cada punto lleva al menos un test que falla antes y pasa después (unitario, de componente, e2e de API o Playwright a 1280×800 y 390×844).
   - `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test` y los e2e afectados en verde.
   - **API:** donde cambie el contrato, regenera OpenAPI (`apps/api/openapi.json`), `api/mcp/api-operations.json` y el SDK (`sdk/generated/schema.d.ts`).
   - **Migraciones:** reversibles, con su script de bajada en `docs/` como en `20261022-focus-preferences-down.sql`. No toques datos de producción salvo con las migraciones o scripts de este documento, y siempre con copia de seguridad previa.
   - Anota el estado de 80 a 104 en `docs/audit/ESTADO.md`.
5. **MCP:**
   - toda herramienta nueva o cambiada lleva test en `api/mcp/mcp.service.spec.ts` y en `apps/api/test/mcp.e2e-spec.ts`;
   - sube `serverInfo.version` (85.3);
   - el catálogo de este documento (sección 5) es el contrato.

## 1. Tabla resumen

| ID | Área | Tipo | Prioridad | Título | Fuente |
|---|---|---|---|---|---|
| 80 | MCP/API | Bug | **P0** | La renovación OAuth falla tras el despliegue o con renovaciones concurrentes; los clientes MCP pierden el acceso | Informe MCP R80-01 |
| 81 | MCP/API | Bug | **P0** | Recurrencia: la serie «resucita» al quitar la repetición; `next_occurrence` es incoherente; el ancla queda fuera de la regla | R80-04/05/13, Pablo |
| 82 | MCP | Bug | P1 | Herramientas de tareas: `parse:true` ignora `^lista`; `complete_task` sin `complete_children`; `reopen_task` sobre cancelada sin efecto; descripción errónea de `cancel_task`; `update_task` sin `parent_id` | Pablo, R80 |
| 83 | MCP/API | Bug | P1 | Rangos y paginación: `list_tasks from/to` excluye el inicio e ignora `start_date`; `search` sin `next_cursor`; formas de respuesta distintas | R80-03/08/12 |
| 84 | MCP/API | Bug | P1 | Foco: `elapsed_seconds` sigue contando en sesiones terminadas; faltan herramientas de pausar, reanudar, terminar y estado | R80-02/17 |
| 85 | MCP/API | Bug | P2 | Robustez MCP: `api_request` pierde el código HTTP, faltan actividades (reabrir, restaurar, aislar), versión y `list_changed`, borrador de `replan_day`, formatos de `trigger`, fechas antiguas a las 02:00, respuestas pesadas | R80-06/07/09/10/14/15 |
| 86 | API/seguridad | Bug | **P0** | La copia desde Drive usa `GOOGLE_REFRESH_TOKEN` del servidor si el usuario no tiene Google conectado (a verificar en producción) | Código |
| 87 | Calendario | Bug | P1 | Vista Día: tira de 7 días en escritorio, una sola columna y título solo con el mes | Recorrido (15) |
| 88 | Calendario | Bug | P1 | Dos semanas ocupa media pantalla | Recorrido (19) |
| 89 | Calendario | Bug | P2 | Semana: el título de un bloque de 30 min se sale del rectángulo | Pablo |
| 90 | Composer/fecha | Bug | P1 | Móvil: el selector de fecha («Fecha límite») se desplaza a la izquierda y se corta | Pablo |
| 91 | Shell | Bug | P1 | Panel derecho vacío fijo (~384 px) en Hoy y listas sin tarea seleccionada | Pablo, recorrido (01, 09) |
| 92 | Composer | Bug | P1 | El composer global (rail «+», N, BottomBar) abre «Sin fecha» y en Bandeja sin heredar el contexto de la vista | Recorrido (06) |
| 93 | Calendario | Bug | P1 | Pendientes de r75: filtros del sidebar del calendario (75.1) y selector de periodo con `input` nativo mm/dd/yyyy (75.11) | Recorrido (10, 12, 13) |
| 94 | Hoy/Plan | Bug | P2 | Hoy muestra vencidas antiguas, pero «Plan del día» solo ofrece 1 tarea | Pablo |
| 95 | Estadísticas | Bug | P2 | «126 completadas» frente a «16/24 (66,7 %)» sin explicar; el Reporte semanal dice «Sin detalle diario verificable» | Pablo, recorrido (25-27) |
| 96 | Móvil | Bug | P2 | Textos partidos («6 d / 3 h»), plural «1 tareas», pestaña «Otro» que salta, JSON MCP envuelto, Plan del día truncado; minicalendario y cajón (a verificar) | Pablo, recorrido (m01-m06) |
| 97 | Integraciones | Bug | P2 | Google y Drive comparten credencial; «Desconectar» no explica el efecto | Pablo, recorrido (40) |
| 98 | Calendario | Bug | P2 | Agenda: primera carga de más de 20 s (a verificar) | Recorrido (17) |
| 99 | Adjuntos | Mejora (+ bug P0) | **P0** | Adjuntos **solo en el Google Drive del usuario**: ningún fichero en el servidor; sin Drive, deshabilitado con CTA. Hoy la subida da 500 | Pablo (requisito), revisión |
| 100 | Tareas | Mejora | P1 | **Enlaces** en tareas: detección automática de URLs, enlaces manuales, *unfurl* seguro, chips y MCP | Pablo |
| 101 | Foco | Mejora | P1 | Pomodoro configurable y visible: Ajustes > Foco, editar la duración desde el reloj, presets, auto-inicio y sonidos | Pablo |
| 102 | Notificaciones | Mejora | P1 | Matriz de canales (push/email/Telegram) por tipo de aviso, prueba por canal, horas de silencio, acciones en push e historial de envíos | Pablo |
| 103 | Telegram | Mejora | P1 | Conexión guiada: deep link `t.me/<bot>?start=`, QR, caducidad, estado con @usuario, interruptor y aviso de bloqueo | Pablo |
| 104 | Ajustes | Mejora | P2 | «Acerca de» con el commit y la fecha de la web y del API | Recorrido (33) |

**Recuento:**
- **P0 (4):** 80, 81, 86 y 99.
- **P1 (13):** 82, 83, 84, 87, 88, 90, 91, 92, 93, 100, 101, 102 y 103.
- **P2 (8):** 85, 89, 94, 95, 96, 97, 98 y 104.
- **Total:** 25. **Bugs:** 19 (80-98). **Mejoras:** 6 (99-104; la 99 corrige además el bug de subida).

### 1.1 Decisiones y notas que no son puntos

- **Detalle en Calendario frente a Hoy:** en Calendario, una tarea se abre en **modal flotante** (`TTD-R80_11`) y en Hoy y listas en el **panel derecho**. **Se mantiene así**, igual que en TickTick (`REF-TICKTICK_r75_03a_task_detail_modal_full` frente a `REF-TICKTICK_r75_08a_tasks_today_with_right_detail_panel_full`). Codex no debe cambiarlo; solo documentarlo en `docs/audit/ESTADO.md`.
- **Chip de racha duplicado en el sidebar (77):** **no reproducido.** `ControlChip` ya no se usa en `shell/` (solo se define en `features/statistics/ControlSummary.tsx:98`) y `TTD-R80_01` no lo muestra. La racha está en el menú del avatar (`TTD-R80_28`). Si Pablo lo ve en local, que mande captura y se abrirá un punto aparte.
- **Badge del rail inferior:** el «⚠ 17» del rail, abajo, es el aviso de vencidas. No se toca.
- **Medidas de las capturas:** las de ttd están a 1024×640; las medidas de este documento se dan para **1280×800**, salvo que se diga otra cosa.

## 2. Comparación con TickTick (solo donde aplica)

| Elemento | TickTick | ttd (`afc9f5d`) | Punto |
|---|---|---|---|
| Vista Día (escritorio) | Una columna con cabecera «W43 · Wed · ⑳» y título «October 2026»; los solapados van en subcolumnas (`REF-TICKTICK_22`) | Tira de 7 días encima, una columna de ancho completo y título «octubre» (`TTD-R80_15`) | 87 |
| Dos semanas (Multi-Week) | La rejilla llena la altura disponible | Celdas de `clamp(8rem, 22dvh, 12rem)`: queda media pantalla vacía (`TTD-R80_19`) | 88 |
| Panel derecho en Tareas | La zona de detalle sigue reservada sin selección, pero solo con una ilustración tenue, sin texto ni borde (`REF-TICKTICK_01_tasks_all_empty_detail`) | «Sin tarea seleccionada», fijo, de 340-440 px (`TTD-R80_01`, `TTD-R80_09`). **Pablo pide ganar ese ancho:** aquí nos apartamos de TickTick a propósito | 91 |
| Añadir tarea | El composer hereda la vista: en Today pone «Today» y en una lista, esa lista (`REF-TICKTICK_r75_05c`) | El modal global abre «Sin fecha» y en Bandeja (`TTD-R80_06`) | 92 |
| Sidebar del calendario | Minicalendario y All/Lists/Filters/Tags/Subscribed Calendars con casillas (`REF-TICKTICK_r75_01b`) | Solo el minicalendario; los filtros van en un popover (`TTD-R80_10`, `TTD-R80_13`) | 93 |
| Pomodoro | Pomo/Stopwatch, reloj de 240 px y «Focus Settings» en «···»; Ajustes > Pomo con duraciones, auto-inicio y sonidos. *Ajustes > Pomo no está capturado: descripción de memoria, a verificar* | Ajustes ocultos en el «⋯» de `FocusPage` (`TTD-R80_22`) | 101 |
| Adjuntos | Ficheros alojados por TickTick | Subida local en el servidor, que hoy da 500; se sustituye por Drive (decisión de Pablo) | 99 |

## 3. Tokens nuevos (`web/styles/tokens.css`, `:root` y `[data-theme='dark']`)

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--chip-h` | `24px` | = | Chips de adjunto y enlace (99, 100) **[medible]** |
| `--chip-h-mobile` | `32px` | = | Ídem en móvil; zona táctil de 44 px con `::before` |
| `--chip-radius` | `var(--radius-full)` | = | Chips |
| `--chip-bg` | `var(--surface-2)` | `var(--surface-3)` | Fondo del chip |
| `--chip-border` | `1px solid var(--border)` | = | Borde del chip, fino |
| `--chip-fs` | `var(--fs-xs)` (12 px) | = | Texto del chip |
| `--chip-icon` | `14px` | = | Icono o favicon del chip |
| `--chip-max-w` | `220px` | = | Ancho máximo, con elipsis |
| `--sheet-max-h-mobile` | `min(88dvh, 720px)` | = | Hojas inferiores en móvil (90, 102) |
| `--sheet-radius` | `var(--radius-xl)` arriba | = | Hojas inferiores |
| `--matrix-cell` | `44px` | = | Celda de la matriz de notificaciones (102) |
| `--settings-row-h` | `44px` | = | Filas de Ajustes > Foco, Notificaciones y Telegram |
| `--status-dot` | `8px` | = | Punto de estado conectado/desconectado (99, 103) |
| `--cal-day-header-h` | `44px` | = | Cabecera de la columna de la vista Día (87) |

Mantén `--cal-two-weeks-cell-h` solo como **mínimo**: el máximo lo da el contenedor (88).

## 4. Puntos

### Área A — MCP y API

#### TTD-AUD-80 · P0 · La renovación OAuth falla tras el despliegue y con renovaciones concurrentes

**Contexto:** el 22/10, de 09:07 a 09:12 (hora de Madrid), justo después del despliegue de #73, el conector MCP de Grok Bot falló **9 veces seguidas** con «The MCP server's OAuth provider could not issue a new access token right now; try again shortly». El conector de Codex falló a la vez con `-32603`. Solo se arregló cuando Pablo forzó la reautorización. Desde entonces (09:13-10:20) no ha vuelto a fallar.

**Estado actual:**
- `api/auth/oauth.service.ts:326-400` (`refreshGrant`):
  - `classifyRefresh` (`api/auth/oauth-refresh.ts:5-23`) marca como `reuse` cualquier refresh con `rotatedAt` y **revoca toda la familia** (`revokeFamily(…, 'reused')`, `oauth.service.ts:346` y `:395`).
  - Dentro de la transacción, `lockOauthGrant` (`oauth-refresh.ts:68`) serializa; si `marked.count !== 1`, lanza `RefreshReuse` y también revoca la familia.
  - El access token anterior se revoca **en el acto** (`personalAccessToken.update … revokedAt`, `:377-380`).
- **Consecuencia:** si un cliente reintenta el mismo refresh (por un *timeout* de red o un reinicio del contenedor durante el despliegue) o lanza dos renovaciones en paralelo, la segunda se toma por robo. Se revoca la familia y el cliente queda fuera hasta reautorizar. Las llamadas en curso con el access anterior fallan.
- No hay ventana de gracia ni respuesta idempotente.

**Comportamiento esperado:**
1. **Ventana de gracia de 60 s** (`OAUTH_REFRESH_GRACE_MS = 60_000`). Si llega un refresh ya rotado hace ≤ 60 s, del mismo `client_id` y con la familia viva:
   - se devuelve **el mismo par emitido en la rotación**, guardado cifrado en la fila rotada (`replacementAccessId` + el token cifrado con `field-cipher`) o reconstruible;
   - **no** se revoca la familia.
   - Pasados los 60 s, el comportamiento actual de reuso se mantiene.
2. El access token anterior **no** se revoca en el acto: se le deja caducar como mucho a los **120 s** (`expiresAt = min(expiresAt, now+120s)`) para que terminen las llamadas en curso.
3. Los errores del endpoint de token siguen RFC 6749. Un fallo transitorio de BD o Redis devuelve `503 temporarily_unavailable` con `Retry-After: 2`, nunca `invalid_grant`, para que el cliente reintente sin reautorizar.
4. Cada revocación por reuso se registra en el log y en Actividad (`oauth.refresh_reused`), con `client_id`, `familyId` y los segundos transcurridos desde la rotación.
5. Smoke tras el despliegue (`scripts/smoke-oauth.sh`): renovar dos veces en paralelo y comprobar que las dos respuestas son 200 con el mismo par.

**Criterios de aceptación:**
- [ ] e2e `oauth-refresh.e2e-spec.ts`:
  - dos `POST /oauth/token grant_type=refresh_token` simultáneos con el mismo refresh → ambos 200 con el mismo `access_token`; la familia no queda revocada.
  - El mismo refresh a los 61 s → 400 `invalid_grant` y familia revocada (sin regresión).
- [ ] Un `GET /api/v1/me` con el access anterior funciona hasta 120 s después de la rotación y da 401 después.
- [ ] Un fallo simulado de Prisma en el refresh → 503 `temporarily_unavailable` con `Retry-After`.
- [ ] Desplegar en staging con un cliente MCP conectado y reiniciar el API → el cliente sigue funcionando sin reautorizar. Adjunta el log a la PR.

**Tests:** `oauth-refresh.spec.ts` (`classifyRefresh` con `rotatedAt` dentro y fuera de la gracia), e2e de concurrencia y e2e de la ventana del access anterior.
**Evidencia:** informe MCP R80-01 (9 fallos, de 09:07 a 09:12).

#### TTD-AUD-81 · P0 · Recurrencia: la serie «resucita», `next_occurrence` incoherente y ancla fuera de la regla

**Contexto:** con una tarea de prueba diaria, completé la ocurrencia 1 (el planificador creó la 2) y en la 2 hice `update_task recurrence:null`. **El planificador volvió a crear una ocurrencia 3** a partir de la 1 completada. Pablo ha visto lo mismo: repeticiones que vuelven tras quitarlas.

**Estado actual:**
- `api/modules/tasks/tasks.service.ts:427`: al actualizar `repeatRule`, solo se toca la fila editada (`recurrenceOpen: repeatRule !== null`).
- Las demás tareas de la serie (`seriesId`) completadas conservan `recurrenceOpen: true`.
- `api/scheduler/scheduler.service.ts:113-140` (`advanceCompleted`) busca completadas con `recurrenceOpen: true` (`:120`) y crea la siguiente.
- `next_occurrence` (`api/mcp/mcp.service.ts:1033-1048`) se calcula con `firstAfter(rule, zone, new Date())` sobre la **hora de creación**. En tareas de día completo daba `…T09:xx` en lugar de la medianoche local, mientras `series.next_due_date` y `get_task_occurrences` decían bien `00:00 Europe/Madrid` (R80-05).
- Se acepta un `due_date` que no cumple la regla (p. ej. un martes con `FREQ=WEEKLY;BYDAY=MO`) sin avisar (R80-13).

**Comportamiento esperado:**
1. `update_task`/`PATCH /tasks/:id` con `recurrence:null` (o `repeat_rule:null`) **cierra la serie**: `updateMany({ where: { seriesId, userId }, data: { recurrenceOpen: false } })` en la misma transacción, con una actividad `series.closed` (`source` = `api`, `mcp` o `web`).
2. Quitar la repetición de **una** ocurrencia aislada (`detach_occurrence`) sigue sin afectar a la serie.
3. `next_occurrence` se calcula con la misma función que `series.next_due_date` (`nextOccurrence` de `domain`, `tasks.service.ts:1832`), anclada en `due_date` y respetando `is_all_day`. Si es de día completo, devuelve la **fecha** (`YYYY-MM-DD`) o la medianoche local con desfase (`2026-10-23T00:00:00+02:00`), nunca la hora de creación.
4. Si `due_date` no cumple la regla:
   - la respuesta lleva `warnings:[{code:'anchor_outside_rule', next_matching:'2026-10-26'}]`;
   - la UI muestra un aviso fino bajo el selector de repetición: «La fecha no coincide con la repetición; la próxima será el lun 26 oct» (`recurrenceAnchorWarning`).
   - Sin bloquear.
5. **Datos:** una migración de una vez (`scripts/close-orphan-series.ts`, con `--dry-run`) pone `recurrenceOpen=false` en las series cuya última ocurrencia activa no tiene `repeatRule`. Debe listar los IDs afectados y ejecutarse con copia previa.

**Criterios de aceptación:**
- [ ] e2e: crear diaria → completar (→ ocurrencia 2) → `recurrence:null` en la 2 → avanzar el reloj del planificador 2 ciclos → **ninguna** tarea nueva en la serie.
- [ ] e2e: diaria de día completo → `complete_task` → `next_occurrence` = medianoche local del día siguiente, igual a `series.next_due_date`.
- [ ] Martes con `BYDAY=MO` → `warnings` con `anchor_outside_rule`. En la web (1280×800 y 390×844) se ve el aviso a ≤ 4 px del selector, en `--fs-xs` y color `--warning`. Capturas antes/después.
- [ ] `--dry-run` sobre una copia de producción lista las series huérfanas; el resultado va en la PR.

**Tests:** `tasks.service.spec.ts` (cierre de serie), `scheduler.service.spec.ts` (no avanza las cerradas), `mcp.service.spec.ts` (`next_occurrence` de día completo) y `domain/recurrence` (ancla fuera de regla).
**Evidencia:** informe MCP R80-04/05/13.

#### TTD-AUD-82 · P1 · Herramientas de tareas del MCP: `^lista`, `complete_children`, reabrir cancelada, descripciones y `parent_id`

**Estado actual y esperado, uno por uno:**

| # | Estado actual (evidencia) | Esperado |
|---|---|---|
| 82.1 | `create_task`/`update_task` con `parse:true`. En `create_task` (`api/mcp/mcp.service.ts:268-293`) se envía `raw_text`, pero también `project_id: await this.projectId(user, args)` (`:281`), que sin `project_id` pone **Bandeja** y pisa el `^lista` del parser. En `update_task` (`:511-535`) se aplican `parsed.title`, `tagNames`, `due`, `start`, `priority` y `durationMinutes`, pero **no `parsed.listName`**. Pablo: «Llamar ^Instinct» quedó en Bandeja; con `quick_add` sí funciona. | Si `project_id` no viene y el parser encuentra `^lista`: resolver la lista sin distinguir mayúsculas ni acentos, igual que `quick_add`; en `update_task`, moverla. Si no existe, `warnings:[{code:'list_not_found', name}]` y la tarea se queda donde estaba o en Bandeja. **Nunca crear listas.** |
| 82.2 | `complete_task` con checklist o subtareas activas y la política `ask` → `409 children_need_decision` (`tasks.service.ts:1669-1674`), pero el esquema MCP (`mcp.catalog.ts:248-262`) **no expone `complete_children`**. Hay que ir por `api_request`. | Añadir `complete_children: 'complete' \| 'leave'` al esquema. El error `children_need_decision` del MCP incluye en `data` `{pending_children: n, pending_checklist: n, hint: "retry with complete_children"}`. |
| 82.3 | `reopen_task` sobre una tarea **cancelada** devuelve OK sin cambiar `status` (`tasks.service.ts:563-589` solo trata `completed`). | Reabrir también las canceladas (`status:'active'`, `cancelledAt:null`), con actividad `task.reopened`. Si ya está activa → `409 not_reopenable`. |
| 82.4 | La descripción de `cancel_task` (`mcp.catalog.ts:278`) dice «Soft-delete uses delete_task», pero no explica que la cancelada sale de las listas y cómo deshacerlo. | «Cancel a task (status=cancelled; hidden from lists, kept in history). Undo with reopen_task. Soft-delete is delete_task; restore with restore_task.» |
| 82.5 | `update_task` no acepta `parent_id`: no hay forma de convertir una tarea en subtarea ni de sacarla por MCP, salvo con `api_request`. | `parent_id: string \| null` en el esquema, con las validaciones de la API (misma lista, sin ciclos, profundidad ≤ la de la UI) y error `invalid_parent`. |

**Criterios de aceptación:**
- [ ] `create_task {title:"Llamar ^Grokbot-ticktackdone", parse:true}` → `project_id` de esa lista; con `^NoExiste` → Bandeja + `warnings.list_not_found`.
- [ ] `complete_task {id, complete_children:'complete'}` con checklist → 200 y checklist completa; sin el parámetro → error con `data.pending_checklist`.
- [ ] `reopen_task` sobre cancelada → `status:'active'`, y aparece en Actividad.
- [ ] `update_task {parent_id}` crea la relación y `{parent_id:null}` la quita; con un ciclo → `invalid_parent`.

**Tests:** `mcp.service.spec.ts` y `mcp.e2e-spec.ts`, un caso por fila.

#### TTD-AUD-83 · P1 · Rangos, paginación y forma de las respuestas del MCP

**Estado actual:**
- `list_tasks` (`api/mcp/mcp.service.ts:197-235`) traduce `from`/`to` a `dueAfter`/`dueBefore` con comparación **estricta** (`gt`/`lt`).
  - Con `from=2026-10-22T00:00+02:00`, las tareas de día completo del 22 (con `due` a las 00:00 locales) **no salen**.
  - Además solo filtra por `due_date`: las tareas con `start_date` en el rango y `due` después, o sin `due`, no aparecen. `list_calendar_events` sí las incluye.
- `search` (`mcp.service.ts:731-743`) devuelve `items` sin `next_cursor`, aunque el esquema anuncia paginación.
- Formas distintas:
  - `list_notes` devuelve un array suelto;
  - `list_smart_list_tasks` devuelve `{count, groups[{tasks}]}`;
  - `api_catalog` usa un cursor numérico (`:188`);
  - el resto devuelve `{items, next_cursor}`.

**Comportamiento esperado:**
1. `list_tasks`:
   - `from` **inclusivo** (`gte`), `to` exclusivo (`lt`), documentado en la descripción;
   - nuevo `range_field: 'due' | 'start' | 'any'`, por defecto `any`: una tarea entra si `due` **o** `start` caen en `[from, to)` o si el intervalo `[start, due]` corta el rango;
   - fechas sin hora (`2026-10-22`) = medianoche en la zona del usuario.
2. `search` devuelve `next_cursor` opaco (base64 de `{offset}` o `{score,id}`) y acepta `cursor`.
3. **Forma única** `{items, next_cursor}` para todo listado, también `list_notes` y `api_catalog` (cursor opaco en `string`). `list_smart_list_tasks` mantiene `groups`, pero añade `items` (plano) y `next_cursor`. Los cambios incompatibles se documentan en `docs/mcp/CHANGELOG.md`.

**Criterios de aceptación:**
- [ ] Tarea de día completo del 22 → sale con `from=2026-10-22` y con `from=2026-10-22T00:00:00+02:00`.
- [ ] Tarea con `start_date` el 22 y `due` el 25 → sale con `[22, 23)` y `range_field:any`; no sale con `range_field:'due'`.
- [ ] `search {query:'prueba', limit:2}` → `next_cursor` no nulo; la segunda página no repite IDs.
- [ ] `list_notes` y `api_catalog` → `{items, next_cursor}` (test de contrato que recorre **todos** los `list_*`).

**Tests:** `mcp.service.spec.ts` y un test de contrato en `mcp.catalog.spec.ts` que valide la forma de todas las herramientas de listado.

#### TTD-AUD-84 · P1 · Foco por MCP: `elapsed_seconds` y herramientas que faltan

**Estado actual:**
- `api/modules/focus/focus.controller.ts:583-588` calcula `elapsed_seconds` con `focusElapsedSeconds({…, now: new Date()})` también para las sesiones `completed`/`aborted`. Una sesión de 28 s mostraba **66 h**.
- `start_focus` no acepta `task_id` ni `type` (`pomodoro`/`stopwatch`).
- Pausar, reanudar, terminar y abandonar solo se puede con `api_request`.

**Comportamiento esperado:**
1. Si `endedAt !== null`, `elapsed_seconds` se congela en `endedAt` (menos las pausas).
2. `start_focus {task_id?, type?: 'pomodoro'|'stopwatch', minutes?}`. Si hay una sesión activa → `409 focus_already_running` con `data.session_id`.
3. Herramientas nuevas: `pause_focus`, `resume_focus`, `finish_focus {note?}`, `abort_focus` y `get_focus_state`. Esta última devuelve `{session|null, settings, today:{pomos, minutes}}`, con los mismos `scopes` que `start_focus`.

**Criterios de aceptación:**
- [ ] Sesión de 28 s terminada → `elapsed_seconds` = 28 ±1 al consultarla 1 h después.
- [ ] `start_focus {task_id}` → la sesión aparece en el Foco de la web ligada a la tarea; `pause_focus` y `resume_focus` se reflejan en la web en ≤ 2 s.
- [ ] Captura de la web (1280×800) con la sesión iniciada por MCP.

**Tests:** `focus.controller.spec.ts` y `mcp.e2e-spec.ts`.
**Evidencia:** R80-02 y R80-17.

#### TTD-AUD-85 · P2 · Robustez del MCP (lote)

| # | Estado actual | Esperado | Aceptación |
|---|---|---|---|
| 85.1 | `api_request` convierte todo lo que no es 2xx en `400 api_request_failed` con el cuerpo en texto (`api/mcp/mcp-api.ts:125`); se pierde el 404 o el 403. | Error MCP con `data:{status, code, message, body}` y el **mismo** `status` HTTP original. | `api_request GET /tasks/<inexistente>` → `data.status=404`, `data.code='task_not_found'`. |
| 85.2 | Reabrir, restaurar y aislar (`detach`) no dejan actividad; la ocurrencia aislada sale con `source:'manual'` (R80-09). | Actividades `task.reopened`, `task.restored` y `occurrence.detached` con `source` real (`mcp`/`api`/`web`) y `actor`. | Las tres operaciones por MCP → 3 entradas en `get_task.activity` con `source:'mcp'`. |
| 85.3 | `serverInfo.version:'0.1.0'` y `listChanged:false` (`mcp.service.ts:142-143`): los clientes conservan un catálogo antiguo (ayer 42 herramientas, hoy 61). | `version` = `package.json` del API + commit corto (`0.2.0+afc9f5d`); `listChanged:true` y `notifications/tools/list_changed` cuando cambia el hash del catálogo entre despliegues (guardado en Redis). | `initialize` devuelve la versión con commit. El test comprueba que el hash del catálogo cambia al añadir una herramienta. |
| 85.4 | `replan_day {auto_apply:false}` sin decisiones crea una sesión `replan` vacía que no se puede descartar (R80-14). | Sin candidatas → `{session:null, reason:'nothing_to_replan'}`, sin crear nada. Nueva herramienta `discard_replan {session_id}`. | Prueba: sin vencidas → no se crea sesión; con borrador → `discard_replan` lo elimina. |
| 85.5 | Dos formatos de `trigger`: `TRIGGER:-PT15M` (el de la descripción) y `-PT5M` (el que se guarda por defecto); ambos se guardan tal cual (R80-07). | Normalizar al guardar a `-PT15M` (ISO 8601 con signo). Aceptar los dos en la entrada y corregir la descripción de `add_task_reminder` (`mcp.catalog.ts:379`). | Las dos entradas → la BD guarda `-PT15M`; el recordatorio salta 15 min antes (test del planificador). |
| 85.6 | Tareas antiguas con `due 2026-10-21T00:00Z` que salen a las 02:00 en Madrid (bug 55 anterior; R80-10). | Script `scripts/repair-allday-utc.ts --dry-run`: tareas `isAllDay` con hora UTC 00:00 → medianoche local del mismo día civil en la zona del usuario. Copia de seguridad previa. | `--dry-run` en una copia lista N filas; tras ejecutarlo, `list_tasks` del 21 las devuelve como de día completo a las 00:00 locales. |
| 85.7 | Parser: un rango «17:00-17:45» va a `start` + `duration` con `due:null`, y una hora sola va a `due` (R80-11). | Con un rango: `start` = inicio, `due` = fin y `duration` = diferencia. Con `start` + `duration` sin `due`, calcular `due`. Mismo comportamiento en `quick_add`, `parse:true` y la web. | `quick_add "x mañana 17:00-17:45"` → `start 17:00`, `due 17:45`, `duration 45`. Test en `domain/nlp/parse.spec.ts`. |
| 85.8 | Las escrituras devuelven `activity` con una copia completa de la tarea en cada entrada, de 5 a 6 KB (R80-15). | Por defecto, `activity` resumida (`{at, type, source, changed:[campos]}`); `include_activity:'full'` para el detalle. | La respuesta de `update_task` pesa < 2 KB con 4 cambios previos (test de tamaño). |

**Tests:** `mcp.service.spec.ts` y `mcp.e2e-spec.ts`, uno por fila; `parse.spec.ts` para 85.7.

#### TTD-AUD-86 · P0 · Las llamadas a Google usan el refresh token del servidor como respaldo

**Estado actual:**
- Tres sitios hacen `stored === null ? process.env.GOOGLE_REFRESH_TOKEN : openField(stored)`:
  1. `api/modules/integrations/integrations.controller.ts:407-411` (`copyDriveFile`, adjuntos desde Drive);
  2. `api/modules/calendar/calendar.service.ts:646-650` (`googleAccessToken`);
  3. `api/modules/calendar/google-sync.service.ts:649-653`.
- Si producción tiene `GOOGLE_REFRESH_TOKEN` (la configuración antigua de un solo usuario, documentada en `docs/spec/done/cursor-prompt-google-calendar-sync-v1.0-cd26f95f.md:35`), **cualquier usuario sin Google conectado** usaría la cuenta de Google de quien generó ese token. Con `drive/attachments` podría leer ficheros de su Drive por `file_id`.
- **A verificar en producción:** si la variable está definida (sin imprimir su valor: `docker compose exec api sh -c 'test -n "$GOOGLE_REFRESH_TOKEN" && echo set || echo unset'`).

**Comportamiento esperado:**
1. Quitar el respaldo en los tres sitios: sin token del usuario → `409 google_not_connected` («Conecta Google en Ajustes > Integraciones»).
2. `GOOGLE_REFRESH_TOKEN` solo se acepta en `NODE_ENV=development` y con el usuario semilla local (`DEV_GOOGLE_USER_EMAIL`). En producción, si está definida, el API arranca con un **aviso en el log** y la ignora.
3. Si la variable estaba definida en producción, retirarla de `.env` de producción y comprobar en los logs de Google (consola de la cuenta) que no hubo accesos indebidos. Anotarlo en la PR, sin datos personales.

**Criterios de aceptación:**
- [ ] e2e: con `GOOGLE_REFRESH_TOKEN` definida y un usuario B sin Google → `POST /integrations/drive/attachments` y `GET /calendar/google/*` → 409 `google_not_connected` (hoy, 200 con la cuenta ajena).
- [ ] Al arrancar en producción con la variable definida, el log muestra `GOOGLE_REFRESH_TOKEN ignored in production`.
- [ ] La PR indica si la variable estaba definida en producción (sí/no) y qué se hizo.

**Tests:** `integrations.controller.spec.ts`, `calendar.service.spec.ts` y `google-sync.service.spec.ts`.

### Área B — UI (escritorio 1280×800 y móvil 390×844)

#### TTD-AUD-87 · P1 · Calendario, vista Día

**Contexto:** Pablo dice que la vista Día está rota. En escritorio sale una tira de 7 días sobre una sola columna a todo el ancho y el título dice solo «octubre».

<div class="pair"><figure><img src="evidencias/TTD-R80_15-calendario-dia.jpg"><figcaption>ttd: Día con tira de 7 días y título «octubre»</figcaption></figure><figure><img src="evidencias/REF-TICKTICK_22_calendar_day_sidebar_open.jpg"><figcaption>TickTick: Día con cabecera «W43 · Wed ⑳» y título «October 2026»</figcaption></figure></div>

**Estado actual:**
- `web/features/places/Places.tsx:829-839` pinta `<DayWeekStrip>` siempre que `current === 'day'`, en escritorio y en móvil;
- `Places.tsx:1097-1099`: el título de Día es `Intl.DateTimeFormat(locale,{month:'long'})` → «octubre»;
- los eventos solapados se apilan a todo el ancho en lugar de ir en subcolumnas (a verificar con dos eventos a la misma hora).

**Comportamiento esperado:**
1. **Escritorio:**
   - **sin** `DayWeekStrip`;
   - cabecera de columna de `--cal-day-header-h` = **44 px** **[medible]** con «S43» (semana ISO, `--fs-xs`, `--ink-3`) a la izquierda en la columna de horas, y «jue» + número del día en un círculo `--today-mark-size` si es hoy;
   - título de la barra: «**22 de octubre de 2026**» (`{day:'numeric', month:'long', year:'numeric'}`) o «octubre de 2026», igual que en Semana; elige el primero y aplícalo también al texto del selector.
2. **Móvil:** mantener la tira de 7 días (igual que en TickTick móvil, `REF-TICKTICK_m09_calendar_day_view`), de **48 px** de alto **[medible]**, con el título «oct 2026».
3. **Solapamientos:** los eventos que coinciden se reparten en subcolumnas de igual ancho con 2 px de separación (el mismo algoritmo que Semana, si existe; si no, uno nuevo en `domain/calendar/layout.ts` con tests). Mínimo 1 subcolumna de 64 px; si no caben, «+N».
4. Las franjas sin eventos al principio y al final del día se pliegan como en Semana, si ya existe esa función (75.x).

**Criterios de aceptación:**
- [ ] 1280×800: no existe `.day-week-strip`; la cabecera de la columna mide 44 ±1 px; el título es «22 de octubre de 2026».
- [ ] 390×844: la tira existe, mide 48 ±1 px y al tocar un día cambia la columna y la URL (`?date=`).
- [ ] Dos eventos de 10:00 a 11:00 → dos bloques lado a lado, cada uno de ≈ (ancho − 2)/2 ±2 px.
- [ ] Capturas antes/después en escritorio y móvil, claro y oscuro.

**Tests:** Playwright `calendar-day.spec.ts` y un unitario del algoritmo de subcolumnas.

#### TTD-AUD-88 · P1 · Calendario, vista Dos semanas a media pantalla

**Estado actual:** `web/styles/tokens.css:76-77` (y `:257-258` en oscuro) fija `--cal-two-weeks-cell-h: clamp(8rem, 22dvh, 12rem)`, que usa `features/calendar/calendar.css:665` (`height:`). A 1280×800, dos filas de ≤ 192 px dejan media pantalla vacía (`TTD-R80_19`).

**Comportamiento esperado:**
- la rejilla es `display:grid; grid-template-rows: auto repeat(2, minmax(var(--cal-two-weeks-cell-h), 1fr)); height:100%` dentro del contenedor del calendario, que llega hasta el borde inferior;
- el token pasa a significar **mínimo** (`8rem`);
- el contenido que no cabe en una celda muestra «+N» como Mes;
- en móvil, `minmax(var(--cal-two-weeks-cell-h-mobile), 1fr)`.

**Criterios de aceptación:**
- [ ] 1280×800: la rejilla llega a ≤ 8 px del borde inferior del área de contenido **[medible]**; cada fila mide ≥ 300 px.
- [ ] 390×844: ninguna zona vacía de más de 16 px bajo la rejilla.
- [ ] Una celda con 6 tareas → las que caben más «+N»; al pulsar «+N» se abre el popover del día.
- [ ] Capturas antes/después.

#### TTD-AUD-89 · P2 · Semana: el título de un bloque de 30 min se sale del rectángulo

**Estado actual:** en Semana, un bloque de 30 min (≈ 24 px a la escala actual) pinta título y hora en dos líneas y el texto se sale por abajo (lo ha visto Pablo; reproducible con una tarea de 30 min).

**Comportamiento esperado:**
- **< 32 px** de alto: una sola línea «título · 10:00», con `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`;
- **< 18 px**: solo título, en `--fs-xs`;
- `overflow:hidden` siempre en el bloque;
- título completo en `title` y en `aria-label`.

**Criterios de aceptación:**
- [ ] Bloques de 30, 15 y 60 min: `scrollHeight <= clientHeight` en el contenedor del texto **[medible]**.
- [ ] Captura antes/después del zoom de un bloque de 30 min.

#### TTD-AUD-90 · P1 · Móvil: el selector de fecha se desplaza y se corta

**Contexto:** en móvil, el popover «Fecha límite» del composer y del detalle sale desplazado hacia la izquierda y cortado (lo ha visto Pablo en su iPhone).

**Estado actual:**
- `web/components/DatePopover.tsx:137-145` abre `<Popover offsetX={16} offsetY={-16}>` de 320 px;
- `web/components/Popover.tsx:43-75` calcula `left` con `window.innerWidth` y lo pinta en un *portal* a `body`;
- en iOS, con el teclado abierto o con zoom, `window.innerWidth`/`innerHeight` no coinciden con `visualViewport`, y el popover acaba fuera (causa a verificar en un dispositivo).

**Comportamiento esperado:**
- **≤ 768 px:** `DatePopover` se muestra como **hoja inferior** (`role="dialog"`, `aria-modal`) de ancho completo, con `max-height: var(--sheet-max-h-mobile)`, `border-radius: var(--sheet-radius) var(--sheet-radius) 0 0`, asa de 4×36 px y fondo `--overlay-backdrop-bg`. Se cierra con «Hecho», tocando fuera o deslizando hacia abajo. Respeta `env(safe-area-inset-bottom)`.
- **Escritorio:** se mantiene el popover, pero `Popover` usa `visualViewport` (si existe) para `width`/`height`/`offsetLeft`/`offsetTop`, y se reubica con `visualViewport.resize` y `scroll`.
- **El mismo componente** en todos los sitios donde se elige fecha: composer, detalle, «Fecha límite» y repetición.

**Criterios de aceptación:**
- [ ] 390×844: abrir la fecha desde el composer y desde el detalle → la hoja ocupa los 390 px de ancho; `boundingBox().x = 0`; el borde inferior queda a ≤ 1 px del final del viewport **[medible]**.
- [ ] 390×844 con el teclado emulado (`visualViewport` reducido a 500 px) → la hoja no se corta.
- [ ] 1280×800: el popover sigue anclado y queda entero dentro del viewport en los cuatro bordes (con el ancla pegada a cada borde).
- [ ] Capturas antes/después en móvil (composer y detalle), claro y oscuro.

#### TTD-AUD-91 · P1 · Panel derecho vacío fijo en Hoy y listas

<div class="pair"><figure><img src="evidencias/TTD-R80_01-hoy-lista.jpg"><figcaption>ttd: «Sin tarea seleccionada» ocupa ~30 % del ancho</figcaption></figure><figure><img src="evidencias/REF-TICKTICK_01_tasks_all_empty_detail.jpg"><figcaption>TickTick: sin selección deja la zona con una ilustración tenue; Pablo prefiere recuperar el ancho</figcaption></figure></div>

**Estado actual:**
- `web/shell/AppShell.tsx:44` y `:53`: `showDetailPane` vale para toda la sección `tasks` (`shell/section-of.ts:66-67`), y sin selección se pinta `<DetailEmpty />` (`AppShell.tsx:221`);
- la columna `var(--detail-w)` (`shell/shell.css:19`) queda reservada siempre, con 340-440 px.

**Comportamiento esperado:**
- **sin tarea seleccionada:** la columna de detalle mide **0** (`grid-template-columns: … minmax(0,1fr) 0`) y no se pinta `DetailEmpty`;
- **al seleccionar:** el panel entra con `transform: translateX` en `--dur-base` sin mover la lista de golpe. La lista se estrecha con una transición de `grid-template-columns`, o el panel se superpone por debajo de 1200 px;
- **al cerrar** (Esc, ✕ o deseleccionar): vuelve a 0;
- `--detail-w` y el redimensionado guardado (`detailWidth`) se conservan entre aperturas;
- **Kanban** mantiene su comportamiento actual.

**Criterios de aceptación:**
- [ ] 1280×800, Hoy sin selección: la lista ocupa todo el ancho tras el sidebar (`main.width` = 1280 − rail − sidebar ±1 px) **[medible]**; no existe `.detail-empty` en el DOM.
- [ ] Al hacer clic en una tarea, el panel aparece con el ancho guardado; con Esc desaparece y el foco vuelve a la fila.
- [ ] Capturas antes/después de Hoy y de una lista (Casa), con y sin selección.

#### TTD-AUD-92 · P1 · El composer global no hereda el contexto de la vista

<div class="pair"><figure><img src="evidencias/TTD-R80_06-composer-global.jpg"><figcaption>ttd: «+» del rail en Hoy → «Sin fecha», Bandeja</figcaption></figure><figure><img src="evidencias/REF-TICKTICK_r75_05c_tasks_today_quickadd_focused_full.jpg"><figcaption>TickTick: en Today, la nueva tarea es de hoy</figcaption></figure></div>

**Estado actual:**
- `openTaskComposer()` se llama **sin borrador** desde el «+» del rail (`shell/AppShell.tsx:163`), la `BottomBar` (`shell/BottomBar.tsx:67`), el atajo N (`app.tsx:296`), Calendario (`features/places/Places.tsx:703`) y Hoy (`features/today/TodayPage.tsx:904`);
- el modal abre con «Sin fecha» y Bandeja aunque estés en Hoy o en una lista.

**Comportamiento esperado:** una función `composerContextFor(location)` (en `features/capture/context.ts`, con tests) da el `CaptureDraft` inicial según la ruta:

| Vista | Fecha | Lista | Otros |
|---|---|---|---|
| Hoy | hoy, día completo | Bandeja | — |
| Mañana o Próximos 7 días | mañana / hoy | Bandeja | — |
| Lista X | sin fecha | X | columna por defecto si es Kanban |
| Etiqueta T | sin fecha | Bandeja | etiqueta T |
| Filtro | lo que fije el filtro, si es inequívoco | ídem | ídem |
| Calendario (Día, Semana o Mes) | el día del cursor (o la franja si se pulsa en una celda: lo de 76 se mantiene) | Bandeja | — |
| Resto (Foco, Ajustes…) | sin fecha | Bandeja | — |

- Los cinco puntos de entrada llaman a `openTaskComposer(composerContextFor(location))`.
- El contexto aplicado se ve en los chips del composer y se puede quitar.
- **Sigue habiendo un único modal** (`TaskComposer`/`CaptureSheet`).

**Criterios de aceptación:**
- [ ] En Hoy, con «+» del rail, N o BottomBar → el chip dice «Hoy». Al guardar, la tarea aparece en Hoy sin recargar.
- [ ] En la lista Casa → el chip de lista dice «Casa»; en la etiqueta #r80 → la etiqueta preseleccionada.
- [ ] Test unitario de `composerContextFor` para cada fila de la tabla.
- [ ] Capturas antes/después a 1280×800 y 390×844.

#### TTD-AUD-93 · P1 · Pendientes de r75 en Calendario: filtros en el sidebar (75.1) y selector de periodo (75.11)

<div class="pair"><figure><img src="evidencias/TTD-R80_13-calendario-filtro.jpg"><figcaption>ttd: los filtros siguen en un popover y el sidebar solo tiene el minicalendario</figcaption></figure><figure><img src="evidencias/REF-TICKTICK_r75_01b_sidebar_panel_zoom.jpg"><figcaption>TickTick: All / Lists / Filters / Tags / Subscribed Calendars con casillas</figcaption></figure></div>

**Estado actual:**
- `web/shell/CalendarSidebar.tsx:44` contiene solo el minicalendario;
- los filtros se abren en un popover desde la barra (`features/calendar/CalendarFilterRow.tsx`);
- el selector de periodo sigue usando `<input type="date">` nativo, que en Chrome en inglés muestra **mm/dd/yyyy** (`features/places/Places.tsx:325` y `features/calendar/CalendarControls.tsx:195`; `TTD-R80_12`).

**Comportamiento esperado:**
1. **Sidebar del calendario, bajo el minicalendario:** secciones plegables «Todo», «Listas», «Filtros», «Etiquetas» y «Calendarios suscritos». Cada fila mide **32 px** **[medible]** y lleva casilla circular de 16 px a la derecha, icono y nombre a la izquierda, y el color de la lista en el icono.
   - «Todo» marca y desmarca todo.
   - El estado se guarda en la URL (`?lists=…&tags=…&cals=…`) y en `localStorage` (`ttd.calendar.filters`).
   - El popover de filtros desaparece de la barra en escritorio; en móvil se mantiene como hoja inferior con el mismo contenido.
2. **Selector de periodo:** sustituir el `input` nativo por el `DatePopover` del proyecto (en móvil, la hoja de 90), con la fecha según `locale` («22/10/2026» o «22 oct 2026»). Un único `PeriodNavigator`, compartido con el Reporte semanal (75.11).

**Criterios de aceptación:**
- [ ] 1280×800: el sidebar muestra las 5 secciones; desmarcar una lista oculta sus tareas en Semana y Mes en ≤ 200 ms sin recargar; recargar la página conserva el filtro.
- [ ] No queda ningún `input[type=date]` en `features/places` ni en `features/calendar` (lo comprueba un test del DOM).
- [ ] Capturas antes/después del sidebar y del selector de periodo, en escritorio y móvil.

#### TTD-AUD-94 · P2 · Hoy muestra vencidas, pero «Plan del día» solo ofrece 1 tarea

**Estado actual:** `web/features/planning/PlanDayPage.tsx:102-108` llama a `api.startPlan({today:true, overdue:false, inbox:false, undated:false})`. Las vencidas que se ven en Hoy (17 el 22/10) no entran en el plan; solo aparece un aviso «N vencidas quedan fuera» (`hidden_overdue`, `api/modules/planning/planning.service.ts:544`).

**Comportamiento esperado:**
- **paso 0** del plan, con casillas: «Vencidas (17)», «Bandeja (n)» y «Sin fecha (n)»;
- **por defecto:** Hoy y Vencidas marcadas, y las otras dos no;
- la elección se recuerda por usuario (`planDefaults` en `me` o en `localStorage`);
- el aviso `hidden` solo sale si el usuario las desmarca.

**Criterios de aceptación:**
- [ ] Con 17 vencidas y 1 de hoy → el plan ofrece 18 candidatas por defecto.
- [ ] Desmarcar «Vencidas» → 1 candidata y el aviso «17 vencidas quedan fuera».
- [ ] Capturas antes/después en escritorio y móvil.

#### TTD-AUD-95 · P2 · Estadísticas y Reporte semanal: cifras sin explicar y «Sin detalle diario verificable»

<div class="pair"><figure><img src="evidencias/TTD-R80_27-estadisticas.jpg"><figcaption>Estadísticas: «126 completadas» frente a una tasa de 16/24</figcaption></figure><figure><img src="evidencias/TTD-R80_25-reporte-semanal.jpg"><figcaption>Reporte semanal: «Sin detalle diario verificable»</figcaption></figure></div>

**Estado actual:**
- «Completadas: 126» cuenta **todas** las completadas del periodo;
- la tasa (`domain/stats/aggregate.ts:162-187`, `completionRate`) usa solo las tareas **con `due` en el periodo** (planificadas) y no canceladas: 16/24 = 66,7 %. No se explica en ningún sitio;
- el Reporte semanal (`web/features/product/WeeklyPages.tsx:122-124`) muestra `copy.unverified` cuando falta el detalle diario guardado de la semana en curso, aunque Estadísticas sí tiene los agregados por día.

**Comportamiento esperado:**
1. Etiquetas claras:
   - «Completadas (todas): 126»;
   - «Cumplimiento del plan: 16 de 24 con fecha (67 %)», con un icono ⓘ de 14 px y un tooltip que explique la fórmula (`statsCompletionHelp`);
   - redondeo a entero.
2. La semana en curso usa el mismo agregado diario que Estadísticas: barras L-D con completadas y creadas por día, hasta hoy, y la etiqueta «hasta hoy, jue 22». Con una semana cerrada se mantiene el detalle guardado. `unverified` solo cuando no hay ningún dato.

**Criterios de aceptación:**
- [ ] Un test de dominio con un conjunto conocido → las dos cifras y la fórmula coinciden con el tooltip.
- [ ] En el Reporte de la semana actual se ven las barras por día y no aparece «Sin detalle diario verificable».
- [ ] Capturas antes/después de Estadísticas y del Reporte (semana actual y anterior).

#### TTD-AUD-96 · P2 · Móvil: textos partidos, plural y layouts

| # | Estado actual | Esperado | Aceptación (390×844) |
|---|---|---|---|
| 96.1 | El contador de Hoy y Próximos parte «6 d / 3 h» en dos líneas (`TTD-R80_m01`) | `white-space:nowrap` en la unidad; si no cabe, solo el número mayor («6 d») con el resto en `title` | La caja mide 1 línea (`height <= 1.4em`) |
| 96.2 | «1 tareas sin duración» (`i18n/extra.ts:772` y `:1866`) | Plurales con `Intl.PluralRules`: `todayUnestimated_one`/`_other` («1 tarea sin duración», «3 tareas…»; en inglés, «1 task…») | Test de i18n con 0, 1 y 2 |
| 96.3 | Ajustes > Tokens: la pestaña «Otro» del cliente MCP salta a otra línea y mueve el contenido (`TTD-R80_m06`) | Pestañas con desplazamiento horizontal (`overflow-x:auto`, `scroll-snap`), sin saltos de línea y altura fija de 36 px | Al cambiar de pestaña, la altura del contenedor no varía (±0 px) |
| 96.4 | El JSON de configuración MCP se parte por las comillas | `<pre>` con `white-space:pre; overflow-x:auto`, fuente `--font-mono` de 12 px y botón «Copiar» fijo arriba a la derecha | El JSON se puede desplazar en horizontal; «Copiar» copia el texto exacto |
| 96.5 | Plan del día: los títulos largos se truncan en una línea sin poder leerlos | 2 líneas con `line-clamp:2` y tocar para ver el título completo | Un título de 120 caracteres se ve en 2 líneas |
| 96.6 | Minicalendario «aplastado» en Semana y cajón con poco recorrido (**a verificar** en un dispositivo real; en la emulación `TTD-R80_m02`/`m03` se ve bien) | Celdas del minicalendario de ≥ 36 px; el cajón con `overflow-y:auto` hasta `100dvh` | Captura de un iPhone o emulación a 390×844 con `deviceScaleFactor:3` |

**Tests:** Playwright móvil por fila, con capturas antes/después.

#### TTD-AUD-97 · P2 · Integraciones: Google y Drive comparten credencial y «Desconectar» no lo explica

**Estado actual:**
- `web/features/product/ProductPages.tsx:315-408` tiene un único `disconnectGoogle`, que borra `googleRefreshToken`: se desconectan a la vez Calendar y Drive;
- la tarjeta de Drive (`TTD-R80_40`) no lo dice, ni explica qué pasa con los eventos importados y con los adjuntos.

**Comportamiento esperado:**
1. Una sola tarjeta «**Google** (Calendar y Drive)» con la cuenta conectada (correo), dos filas de permisos («Calendario: lectura/escritura», «Drive: solo ficheros creados por ttd») y su estado («Conectado», «Reconectar» o «Desconectado»).
2. «Desconectar» abre una confirmación que explica:
   - los calendarios dejan de sincronizarse y los eventos importados se quedan o se borran (casilla, por defecto se quedan);
   - **los adjuntos siguen en tu Drive como enlaces**, pero no se pueden subir nuevos;
   - la revocación se hace también en Google (`https://oauth2.googleapis.com/revoke`).
3. Tras desconectar, aviso: «Google desconectado. Puedes revocarlo también en myaccount.google.com/permissions».

**Criterios de aceptación:**
- [ ] El diálogo muestra los tres efectos; «Cancelar» no cambia nada.
- [ ] Tras confirmar: `googleRefreshToken = null`, la llamada a `revoke` se hace (mock en el test) y los adjuntos existentes se siguen abriendo en Drive.
- [ ] Capturas antes/después de la tarjeta y del diálogo, en escritorio y móvil.

#### TTD-AUD-98 · P2 · Agenda: primera carga de más de 20 s (a verificar)

**Estado actual:** en el recorrido del 22/10 hacia las 09:05 (hora de Madrid), la Agenda tardó **más de 20 s** en mostrar contenido (`TTD-R80_17`). Puede ser un arranque en frío o la consulta de un rango grande (`features/places/Places.tsx:539-575` desplaza al mes destino tras cargar tareas y eventos externos).

**Comportamiento esperado:**
- **medir primero:** registrar en la PR el *waterfall* de red de Agenda (rango pedido, número de filas y tiempo de cada petición);
- **objetivo:** contenido útil en **≤ 1,5 s** con datos en caché y **≤ 3 s** en frío **[medible]**;
- **soluciones esperables:**
  - pedir solo ±30 días alrededor de hoy y paginar al desplazarse (`useInfiniteQuery`);
  - *skeleton* de 6 filas mientras carga;
  - eventos externos en paralelo y no en serie.

**Criterios de aceptación:**
- [ ] Playwright con `performance.now()` desde la navegación hasta el primer `[data-agenda-day]` → ≤ 3000 ms en CI (frío) y ≤ 1500 ms en la segunda visita.
- [ ] Waterfall antes/después en la PR.

### Área C — Mejoras

#### TTD-AUD-99 · P0 · Adjuntos solo en el Google Drive del usuario (nada en el servidor de ttd)

**Requisito de Pablo (literal, obligatorio):**
- **ningún fichero se guarda en el servidor de ttd**: ni copia, ni caché, ni miniatura, ni temporal persistente. Todo reside en el Google Drive del usuario.
- La BD guarda **solo metadatos**.
- Las previsualizaciones usan las de Drive, bajo demanda.
- Copias de seguridad y exportaciones: solo metadatos.
- Sin Drive conectado no se puede adjuntar.
- La funcionalidad de **enlaces** (100) es independiente y sirve para todos.

**Estado actual (`afc9f5d`):**
- **Subida local:**
  - `api/modules/tasks/tasks.controller.ts:512-532` (`POST /tasks/:id/attachments`, multer en memoria) → `tasks.service.ts:1202-1270` (`addAttachment`) → `writeAttachment` (`api/modules/tasks/attachment-storage.ts:125-131`) escribe en `ATTACHMENT_DIR` (`:13-14`; en producción `/data/attachments`, volumen `attachments` en `deploy/production/docker-compose.yml:22`, `:26` y `:109`);
  - las miniaturas también se escriben ahí (`thumbnailKey`, `:1242`);
  - **en producción, la subida da 500** («No se ha podido guardar», incluso con un `.txt`; probablemente permisos del volumen para el usuario `node`).
- **Descarga y miniatura servidas por el API:** `tasks.controller.ts:547-590` (`…/thumbnail` y `…/:attachmentId`).
- **Otras vías que escriben ficheros:**
  - Telegram (`api/modules/integrations/telegram-bot.service.ts:487-501`, fotos y voz);
  - el correo entrante (`api/modules/tasks/inbound-email.controller.ts:55-79` → `tasks.service.ts:287`);
  - «copiar desde Drive» (`integrations.controller.ts:397-445`), que **descarga el fichero de Drive y lo guarda en local**.
- **Modelo:** `prisma/schema.prisma:724-745`: `storageKey` (obligatorio), `thumbnailKey`, `driveFileId?`, `driveUrl?`.
- **Copias de seguridad:** `scripts/backup.sh:21-22` empaqueta el volumen en `attachments.tar.gz`; `api/modules/export/backups.service.ts:33-38` lo cuenta.
- **Web:** sección de adjuntos en `web/features/tasks/DetailBody.tsx:435-470` (input `type=file` en `:440`; soltar ficheros en `:153-166` y `:269`).
- **MCP:** `list_task_attachments` (`api/mcp/mcp.catalog.ts:314-318`): «Binary upload/download stays on the REST API».

**Diseño esperado:**

1. **Requisito previo:** Google conectado con el scope `https://www.googleapis.com/auth/drive.file`, que ya está en `api/integrations/google-oauth.ts` (`GOOGLE_SCOPES`). `drive.file` solo da acceso a los ficheros creados por ttd o elegidos por el usuario con Google Picker.
2. **Carpetas:** `Mi unidad/tick-tack-done/<nombre de la lista>`, creadas al subir por primera vez. Los IDs se guardan en la tabla `drive_folders(user_id, project_id NULL, drive_folder_id, created_at)` (`project_id` NULL = carpeta raíz). Al renombrar una lista, se renombra la carpeta (`files.update name`); si falla, se ignora sin bloquear.
3. **Subida desde la web: directa del navegador a Drive** (el binario no pasa por ttd).
   - a) `POST /api/v1/tasks/:id/attachments/drive-session {name, mime_type, size}`. El API valida tamaño, tipo, cuota de tareas y la conexión con Drive. Después **inicia una sesión *resumable*** (`POST https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`, con `X-Upload-Content-Type`, `X-Upload-Content-Length`, cabecera `Origin: https://todo.reflexionia.com` y metadatos `{name, parents:[folder]}`). Devuelve **solo la URL de sesión** (`upload_url`, válida para ese fichero) y un `upload_id` firmado (HMAC, TTL de 1 h). **No se entrega ningún access token al navegador.**
   - b) El navegador hace `PUT upload_url` por trozos de 8 MiB, con progreso y reanudación (`Content-Range`). Google admite CORS en la URL de sesión cuando la petición inicial llevaba `Origin`.
   - c) `POST /api/v1/tasks/:id/attachments/drive-complete {upload_id, drive_file_id}`. El API comprueba con `files.get(fields=id,name,mimeType,size,webViewLink,iconLink,parents,trashed)` que el fichero existe, está en la carpeta de ttd y coincide con el tamaño, y **guarda los metadatos**.
   - **Alternativa** (si la URL de sesión no admite CORS en algún navegador): un access token de Google de vida corta (≤ 10 min) con `drive.file`, solo en memoria del navegador, sin guardarlo en `localStorage`. Indica en la PR cuál se usa y por qué.
4. **Subida por el API** (MCP `api_request`, Telegram, correo entrante, clientes REST):
   - `POST /api/v1/tasks/:id/attachments` (multipart) se reimplementa en **streaming**: `busboy` → `fetch` a la sesión resumable de Drive con `duplex:'half'`, **sin escribir en disco** (nada de `multer.diskStorage` ni `os.tmpdir()`) y sin acumular en memoria más de un trozo (≤ 8 MiB).
   - Se elimina `multer.memoryStorage` de esta ruta.
   - Al terminar la petición no queda ninguna referencia al contenido.
5. **Límites (documentados en la API, el MCP y la UI):**
   - **web directa:** 100 MiB por fichero (`DRIVE_ATTACHMENT_MAX_BYTES`, configurable);
   - **por el API, Telegram o correo:** 25 MiB;
   - 50 adjuntos por tarea (`ATTACHMENT_MAX_PER_TASK`);
   - la cuota la pone Drive: si llega `storageQuotaExceeded`, `507 drive_quota_exceeded`.
6. **Sin Google o Drive conectado:**
   - **web:** el botón «Adjuntar» sale deshabilitado (`aria-disabled`), con tooltip «Para adjuntar ficheros, conecta Google Drive» y CTA «Conectar Google Drive» (→ Ajustes > Integraciones, y de vuelta a la tarea tras conectar). Soltar ficheros en la tarea muestra el mismo aviso;
   - **API y MCP:** `409 drive_not_connected` (nunca 500), con `data.connect_url`;
   - **Telegram y correo:** la tarea se crea sin el fichero y se responde «No he guardado el adjunto: conecta Google Drive en Ajustes > Integraciones».
7. **Token de Google caducado o revocado** (`invalid_grant` al renovar):
   - el usuario pasa a `google_status='reauth_required'` y la tarjeta de Integraciones muestra «Reconectar»;
   - el botón de adjuntar indica «Reconectar Google Drive»;
   - el API y el MCP responden `409 drive_reauth_required`.
8. **Ver y abrir:**
   - chips de altura `--chip-h` (24 px; 32 px en móvil) con el `iconLink` de Drive (16 px) o el icono por MIME, el nombre con elipsis (`--chip-max-w`) y el tamaño en `--ink-3`;
   - clic → `webViewLink` en una pestaña nueva (`target=_blank`, `rel=noopener`);
   - **vista previa** al pasar el ratón o al pulsar prolongadamente: `GET /api/v1/attachments/:id/preview` responde **302** al `thumbnailLink` recién pedido a Drive (`files.get fields=thumbnailLink`), con `Cache-Control: no-store`. El API **no descarga ni guarda** la miniatura. Si no hay `thumbnailLink`, no hay vista previa;
   - se eliminan las rutas de descarga y de miniatura binaria (`tasks.controller.ts:547-590`): el antiguo `GET …/attachments/:id` responde **302** a `webViewLink`.
9. **Quitar un adjunto:**
   - menú del chip → «Quitar de la tarea» → diálogo «¿Quitar “informe.pdf” de la tarea?», con una casilla **«Moverlo también a la papelera de Drive»** (por defecto **sin marcar**);
   - sin marcar, solo se borra la fila;
   - marcada, `files.update {trashed:true}` (papelera, no borrado definitivo) y después se borra la fila;
   - si Drive falla, se avisa y la fila no se borra.
10. **Fichero borrado en Drive:** si `files.get` devuelve 404 o `trashed:true`, el chip se muestra tachado y en `--ink-3` («Ya no está en Drive»), con la opción de quitarlo.
11. **Al desconectar Google (97):** los adjuntos se quedan como **enlaces a Drive** (`webViewLink`) y se siguen abriendo con la sesión de Google del navegador del usuario. No se pueden subir nuevos ni ver vistas previas. Al reconectar, todo vuelve.
12. **Adjuntar un fichero que ya está en Drive:** Google Picker (`DocsView`, con `setIncludeFolders(false)`) → `POST /api/v1/tasks/:id/attachments/drive-link {drive_file_id}` → solo metadatos, sin copiar. Sustituye a la «copia desde Drive» actual (`integrations.controller.ts:397-445`), que se **elimina**.
13. **Modelo** (migración `20261023-attachments-drive-only`):
    ```prisma
    model Attachment {
      id            String    @id @default(uuid()) @db.Uuid
      ownerId       String    @map("owner_id") @db.Uuid
      taskId        String    @map("task_id") @db.Uuid
      driveFileId   String    @map("drive_file_id")
      fileName      String    @map("file_name")
      mimeType      String    @map("mime_type")
      byteSize      BigInt    @map("byte_size")
      webViewLink   String    @map("web_view_link")
      iconLink      String?   @map("icon_link")
      driveFolderId String?   @map("drive_folder_id")
      source        String    // web | api | mcp | telegram | email | picker
      uploadedById  String    @map("uploaded_by") @db.Uuid
      createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
      updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
      deletedAt     DateTime? @map("deleted_at") @db.Timestamptz(6)
      @@unique([taskId, driveFileId])
      @@index([taskId])
      @@map("attachments")
    }
    ```
    **Sin** `storage_key`, `thumbnail_key` ni ninguna columna de contenido (`bytea`, base64…). `drive_url` se renombra a `web_view_link`.
14. **Copias de seguridad y exportaciones:**
    - se elimina el `tar` del volumen en `scripts/backup.sh:21-22` y `has_attachments` en `backups.service.ts`, sustituido por `attachments_metadata_only: true`;
    - la exportación JSON incluye solo los metadatos (`drive_file_id`, `file_name`, `mime_type`, `byte_size`, `web_view_link`).
15. **MCP** (sección 5):
    - `list_task_attachments`: devuelve también `web_view_link`, `icon_link`, `source` y `drive_state` (`ok`/`missing`/`unknown`);
    - nueva `link_drive_file {task_id, drive_file_id}`;
    - nueva `remove_task_attachment {task_id, attachment_id, trash_in_drive?:false}`;
    - la subida de binarios sigue por `api_request` (`POST /tasks/{id}/attachments`, multipart, en streaming a Drive), y la descripción lo dice: «Requires Google Drive connected; files go to the user's Drive; ttd stores metadata only».

**Plan de retirada del almacenamiento local (en este orden, cada paso en un commit):**
1. **Inventario** (`scripts/attachments-inventory.ts --dry-run`): filas con `storage_key`, bytes en el volumen y usuarios con o sin Google. El resultado va en la PR, sin nombres de fichero, solo recuentos.
2. **Migración** (`scripts/migrate-attachments-to-drive.ts`, idempotente, con `--dry-run` y copia de seguridad previa):
   - **usuarios con Drive:** cada fichero sube en streaming desde el volumen a `tick-tack-done/<lista>`; se rellenan los campos de Drive y se borra el fichero local;
   - **usuarios sin Drive:** el script **no borra** y lista los recuentos para que Pablo decida (avisar o borrar). Con su OK, `--purge-unmigrated` los borra.
3. **Código:**
   - borrar `attachment-storage.ts` (salvo los límites, que pasan a `attachment-limits.ts`), `writeAttachment`, `removeAttachmentFile`, `resolveAttachment`, la generación de miniaturas y las rutas binarias;
   - en Telegram y el correo, sustituir la escritura por el streaming a Drive.
4. **Esquema:** migración que elimina `storage_key` y `thumbnail_key` (solo cuando el paso 2 deje 0 filas con `storage_key`; si quedan, la migración falla con un mensaje claro). Script de bajada en `docs/`.
5. **Infraestructura:**
   - quitar `ATTACHMENT_DIR`, el volumen `attachments` de `docker-compose.yml:32`/`:76` y `deploy/production/docker-compose.yml:22`/`:26`/`:109`, y el paso de `backup.sh`;
   - tras desplegar, `docker volume rm <project>_attachments`, solo con el visto bueno de Pablo y anotado en la PR.
6. **Guardia en CI:** un test que falle si aparece `fs.writeFile`, `createWriteStream`, `diskStorage` o `os.tmpdir` en `api/modules/tasks/**` o `api/modules/integrations/**` (lista de permitidos vacía).

**Criterios de aceptación:**
- [ ] **Nada en el servidor:**
  - tras subir 3 ficheros (web directa, `api_request` y Telegram), `docker compose exec api sh -c 'ls -A /data/attachments 2>/dev/null | wc -l; find /tmp -type f -newer /proc/1 | wc -l'` → `0` y `0`;
  - en staging, con el volumen ya retirado, el directorio no existe.
- [ ] **BD:** `SELECT column_name FROM information_schema.columns WHERE table_name='attachments'` **no** devuelve `storage_key`, `thumbnail_key` ni ninguna columna `bytea`.
- [ ] **Subida web directa:** en la pestaña de red de DevTools, el `PUT` del binario va a `www.googleapis.com/upload/drive/v3/…` y **ninguna** petición a `todo.reflexionia.com` lleva más de 4 KB de cuerpo. Captura del waterfall en la PR.
- [ ] El fichero aparece en `Mi unidad/tick-tack-done/<lista>`. Captura de Drive (sin datos personales).
- [ ] **Sin Drive:** botón deshabilitado con tooltip y CTA (captura a 1280×800 y 390×844); `api_request POST /tasks/{id}/attachments` → `409 drive_not_connected`.
- [ ] **Token revocado** (revocar en Google la app de pruebas) → la tarjeta dice «Reconectar» y la API responde `409 drive_reauth_required`.
- [ ] **Chips:** altura 24 ±1 px en escritorio y 32 ±1 px en móvil **[medible]**; un clic abre `webViewLink` en una pestaña nueva; la vista previa responde 302 con `no-store` (test).
- [ ] **Quitar:** sin casilla, el fichero sigue en Drive; con casilla, el fichero está en la papelera de Drive.
- [ ] **Al desconectar Google:** el chip sigue abriendo Drive y «Adjuntar» queda deshabilitado.
- [ ] Copia de seguridad nueva sin `attachments.tar.gz`; la exportación JSON solo tiene metadatos.
- [ ] La guardia de CI del paso 6 está activa y en verde.
- [ ] Capturas antes/después de la sección «Adjuntos y enlaces» con y sin Drive, en escritorio y móvil, claro y oscuro.

**Tests:**
- unitarios: streaming a Drive (mock de `fetch`; se comprueba que no hay llamadas a `fs`), `drive-session`/`drive-complete` (`upload_id` caducado o manipulado → 400) y los errores 409/507;
- e2e con un falso Google Drive (servidor local que simula las rutas `upload` y `files`);
- Playwright: botón deshabilitado, chips y diálogo de quitar.

#### TTD-AUD-100 · P1 · Enlaces en tareas (para todos los usuarios, con o sin Drive)

**Estado actual:** no existe un modelo de enlaces. Las URL del título o de la descripción no se recogen en ningún sitio visible. Comprobado en `afc9f5d`: no hay `TaskLink` en `schema.prisma` ni componente de enlaces en `web/features/tasks`.

**Comportamiento esperado:**
1. **Detección automática:**
   - `domain/links/extract.ts`, con `extractUrls(text)` para `http(s)://…`, `www.…` y `mailto:` (sin repetidos, sin puntuación final);
   - se aplica a `title` y `content` al guardar (web, API, MCP, Telegram y correo);
   - los enlaces detectados se guardan con `source:'auto'` y se recalculan al editar: los que desaparecen del texto se borran, salvo los `manual`.
2. **Enlaces manuales:** «+ Enlace» en la sección «Adjuntos y enlaces» → campo URL + título opcional, con validación de esquema (`http`, `https` o `mailto`; nunca `javascript:`).
3. **Título (*unfurl*) seguro y opcional:**
   - el API pide la página (`GET`, 3 s de *timeout*, como mucho 256 KB, solo `text/html`, como mucho 3 redirecciones);
   - **protección SSRF:** resolver el DNS y rechazar IP privadas, de *loopback*, *link-local* y metadatos (`169.254.169.254`);
   - guarda **solo** `title` (≤ 200 caracteres);
   - el favicon no se guarda en el servidor: el navegador lo pide a `https://www.google.com/s2/favicons?domain=<host>&sz=32`.
4. **Modelo:** `TaskLink {id, taskId, ownerId, url, title?, source:'auto'|'manual', createdAt, updatedAt}` con `@@unique([taskId, url])`.
5. **UI:**
   - en la sección **«Adjuntos y enlaces»** del detalle, dos filas de chips: «Adjuntos» (99) y «Enlaces»; misma altura y estilo (`--chip-*`);
   - chip de enlace: favicon de 14 px, título o dominio con elipsis, y una ✕ para quitarlo al pasar el ratón (en móvil, con pulsación prolongada → menú);
   - clic → pestaña nueva;
   - en la fila de la lista, un indicador fino 🔗 con el número (12 px, `--ink-3`) si hay enlaces.
6. **API:** `GET/POST/DELETE /api/v1/tasks/:id/links`. **MCP:** `list_task_links`, `add_task_link {task_id, url, title?}` y `remove_task_link {task_id, link_id}`; `get_task` incluye `links`.

**Criterios de aceptación:**
- [ ] Una tarea con «ver https://example.com/a y www.ttd.dev.» → 2 chips; editar el texto y quitar una URL → 1 chip.
- [ ] Un enlace manual a `javascript:alert(1)` → error de validación; a `http://169.254.169.254/` → se guarda, pero sin *unfurl*. Test SSRF con 10.0.0.1, ::1 y una redirección a una IP privada.
- [ ] Chips de 24 px en escritorio y 32 px en móvil **[medible]**; la fila de la lista muestra «🔗 2».
- [ ] Con MCP: `add_task_link` → sale en `get_task.links` y en la web sin recargar en ≤ 2 s (*refetch*).
- [ ] Capturas antes/después.

#### TTD-AUD-101 · P1 · Pomodoro configurable y visible

<div class="pair"><figure><img src="evidencias/TTD-R80_22-foco.jpg"><figcaption>ttd: Foco; la configuración está escondida en «⋯»</figcaption></figure><figure><img src="evidencias/REF-TICKTICK_29_pomodoro.jpg"><figcaption>TickTick: Pomodoro</figcaption></figure></div>

**Estado actual:**
- los ajustes existen (`domain/focus/cycle.ts`: `FocusSettings` con `pomodoroMinutes`, `shortBreakMinutes`, `longBreakMinutes`, `cyclesBeforeLongBreak` y `DEFAULT_FOCUS_SETTINGS`; API `api/modules/focus/focus.controller.ts`, `SettingsDto`; migración `20261022-focus-preferences`);
- pero en la web solo se llega a ellos desde el menú «⋯» de `web/features/focus/FocusPage.tsx`, y no hay página en Ajustes;
- no hay auto-inicio, ni sonidos configurables, ni objetivo diario.

**Comportamiento esperado:**
1. **Ajustes > Foco** (`/settings/focus`, entrada en `MoreSettings`), con filas de `--settings-row-h` (44 px):

   | Ajuste | Control | Rango | Por defecto |
   |---|---|---|---|
   | Duración del pomo | *stepper* + campo | 5-180 min, de 5 en 5 | 25 |
   | Descanso corto | *stepper* | 1-60 min | 5 |
   | Descanso largo | *stepper* | 5-90 min | 15 |
   | Pomos hasta el descanso largo | *stepper* | 1-12 | 4 |
   | Empezar el descanso automáticamente | interruptor | — | no |
   | Empezar el siguiente pomo automáticamente | interruptor | — | no |
   | Sonido al terminar | selector (ninguno, campana, timbre, digital) + ▶ para probarlo | — | campana |
   | Volumen | deslizador | 0-100 | 70 |
   | Sonido de fondo durante el foco | selector (ninguno, tic-tac, lluvia, ruido blanco) | — | ninguno |
   | Objetivo diario | *stepper* | 1-20 pomos | 8 |
   | Notificación al terminar | enlace a la matriz de 102 (fila «Fin de foco/descanso») | — | — |

2. **En la pantalla de Foco:**
   - icono ⚙ visible de 20 px junto a «Pomo/Cronómetro», que lleva a Ajustes > Foco (o abre una hoja con los mismos controles);
   - **clic en el tiempo del reloj** (estado parado) → edición rápida con chips de presets **15 · 25 · 45 · 60**, de 28 px, bajo el reloj, y un *stepper*;
   - el preset elegido pasa a ser la duración del pomo;
   - debajo del reloj, «Pomo 2 de 4 · descanso largo en 2» y el progreso del objetivo diario («3/8»).
3. Los sonidos son ficheros estáticos de la web (`/sounds/*.mp3`, ≤ 60 KB cada uno, con licencia libre anotada), no del servidor de datos.
4. Se sincroniza entre dispositivos con la API (`PUT /api/v1/focus/settings`) y el MCP (`get_focus_state.settings` y la nueva `update_focus_settings`).

**Criterios de aceptación:**
- [ ] Cambiar el pomo a 45 en Ajustes > Foco → el reloj muestra 45:00 sin recargar; en otra pestaña, ≤ 5 s después (*refetch on focus*).
- [ ] Con «Empezar el descanso automáticamente» activado, al acabar un pomo de 1 min (en test) empieza el descanso en ≤ 1 s.
- [ ] Los presets se ven bajo el reloj (28 ±1 px de alto) **[medible]**; elegir 15 deja 15:00.
- [ ] Fuera de rango (pomo de 200) → error de validación en la UI y 400 en la API.
- [ ] Capturas antes/después de Foco y de Ajustes > Foco, en escritorio y móvil, claro y oscuro.

**Tests:** `cycle.spec.ts` (auto-inicio y ciclos), `focus.controller.spec.ts` (validación) y Playwright.

#### TTD-AUD-102 · P1 · Notificaciones: matriz de canales por tipo de aviso

<figure><img src="evidencias/TTD-R80_37-ajustes-notificaciones.jpg"><figcaption>ttd: Ajustes > Notificaciones, sin matriz ni prueba («testUnavailable»)</figcaption></figure>

**Estado actual:**
- `NotificationSettings` está en `web/features/places/Places.tsx:3200-3470` (fuera de `features/settings`);
- canales `ReminderChannel` (push, email, telegram) en `prisma/schema.prisma:101-105`;
- tipos `ReminderDeliveryKind` (`task`, `daily_digest`, `shutdown_digest`, `overdue`, `due_soon`, `countdown`) en `:115-122`;
- envío en `api/scheduler/scheduler.service.ts` (≈ `:860-1018`, con botones de Telegram) y `api/scheduler/reminder.transport.ts` (`PushTarget`, `TelegramButton` y `ChannelOutcome`);
- la UI no permite elegir canal por tipo, no hay botón de prueba (`testUnavailable` en `i18n/extra.ts:372`) y no se ve el historial, aunque `ReminderDelivery` lo guarda.

**Comportamiento esperado:**
1. **Matriz** en Ajustes > Notificaciones (`features/settings/NotificationsPage.tsx`, que **sale** de `Places.tsx`):
   - **filas:** Recordatorios de tareas · Fin de foco/descanso · Resumen diario · Cierre del día · Vencidas · Próximas a vencer · Hábitos · Cuentas atrás;
   - **columnas:** Push (este navegador) · Email · Telegram;
   - celdas con un interruptor de 44×44 px de zona táctil (`--matrix-cell`) y el control visible de 32×18 px;
   - **por defecto:** push y Telegram (si está vinculado) activados para recordatorios y fin de foco; email solo para el resumen diario.
2. **Cabecera de cada columna:** estado del canal con un punto de `--status-dot` y un texto:
   - **Push:** «Permitido», «Bloqueado en el navegador», «No pedido» o «No compatible»;
   - **Email:** la dirección;
   - **Telegram:** «@usuario», «Sin vincular» o «Bloqueado por el usuario».
   - Debajo, botón fino «**Probar**», que envía un aviso real por ese canal (`POST /api/v1/me/notifications/test {channel}`) y muestra el resultado en línea («Enviado ✓» o el error exacto).
3. **Guía de permisos:** si `Notification.permission === 'denied'`, un panel plegable con los pasos de Chrome, Edge, Firefox, Safari en macOS e iOS (en iOS, añadir a la pantalla de inicio, desde iOS 16.4) y el botón «Volver a comprobar».
4. **Horas de silencio:**
   - de/hasta (`HH:mm`, en la zona del usuario), los días de la semana y «permitir prioridad alta»;
   - en silencio, push y Telegram se aplazan hasta el final del periodo (estado `skipped`, motivo `quiet_hours`, reprogramado) y el email se envía igual.
5. **Acciones en push:** «Completar», «Posponer 10 min» y «Abrir», con `actions` en `showNotification` y `notificationclick` en el *service worker* → `POST /api/v1/reminders/:deliveryId/action {action}` con un token de un solo uso de la notificación. Telegram ya tiene botones: hay que alinear los mismos tres.
6. **Historial:** «Últimos envíos» (50, paginado) con fecha y hora locales, tipo, canal, estado (`scheduled`, `fired`, `failed`, `skipped` o `disconnected`) y motivo, sacado de `ReminderDelivery` (`GET /api/v1/me/notifications/deliveries?cursor=`).
7. **Modelo:**
   - `NotificationPreference(userId, kind, channel, enabled)` con `@@id([userId, kind, channel])`;
   - `QuietHours` en `User.settings` (o en una tabla);
   - nuevos valores de `ReminderDeliveryKind`: `focus_end` y `habit`.
   - El planificador consulta la matriz antes de enviar por cada canal.
8. **MCP:** `get_notification_settings` (lectura) y `send_test_notification {channel}`, que **solo** envía al propio usuario. Cambiar la matriz no se expone por MCP (es un ajuste de cuenta).

**Criterios de aceptación:**
- [ ] 1280×800: la matriz se ve entera sin desplazamiento horizontal; 390×844: las columnas van fijas y las filas se desplazan, sin cortes.
- [ ] Desactivar «Telegram × Recordatorios» y crear un recordatorio a 1 min → llega por push y no por Telegram; el historial muestra Telegram `skipped` con el motivo `disabled_by_user`.
- [ ] «Probar» en cada canal → llega en ≤ 10 s y en la UI sale «Enviado ✓»; con Telegram sin vincular, el botón queda deshabilitado con la explicación.
- [ ] Horas de silencio de 22:00 a 08:00 y un recordatorio a las 23:00 → push con `skipped` (motivo `quiet_hours`) y reprogramado a las 08:00.
- [ ] «Completar» desde la notificación push → la tarea queda completada (e2e con el *service worker* en Playwright).
- [ ] Capturas antes/después, en escritorio y móvil, claro y oscuro.

#### TTD-AUD-103 · P1 · Telegram: conexión guiada y estado

<figure><img src="evidencias/TTD-R80_40-ajustes-integraciones.jpg"><figcaption>ttd: Integraciones; Telegram con código manual «/start &lt;código&gt;»</figcaption></figure>

**Estado actual:**
- `web/features/product/ProductPages.tsx:300-530`: código de vinculación (`pairTelegram`) que el usuario tiene que copiar y mandar como `/start <código>`;
- `api/modules/integrations/telegram-bot.service.ts`: `PAIRING_TTL_MS` = 10 min (`:32`, `:83`); el bot ya acepta `/start <código>` y `/start_<código>` (`:162`), así que el *deep link* funcionaría sin cambiar el bot;
- `telegramEnabled` existe en `api/auth/me.service.ts` (≈ `:60`), pero no hay interruptor claro;
- no se ve con qué cuenta está vinculado ni se detecta que el usuario haya bloqueado el bot.

**Comportamiento esperado:**
1. **Sin vincular:**
   - botón principal «**Abrir Telegram**» → `https://t.me/<bot_username>?start=<código>`; `bot_username` viene del estado de la integración (`getMe` cacheado);
   - en escritorio, además, un **QR** de 160 px con ese enlace (reutiliza `features/settings/TotpQr.tsx` o la misma librería);
   - debajo, «Caduca en 9:58», con «Generar otro» al caducar;
   - plan B plegado: «¿No se abre? Envía `/start <código>` a @bot».
2. **Mientras espera:** sondeo del estado cada 2 s (como mucho, 10 min). Al vincular: «✓ Conectado como **@usuario** (Nombre)» y aviso del sistema.
3. **Vinculado:** tarjeta con @usuario, la fecha de vinculación, el interruptor «**Recibir avisos por Telegram**» (`telegram_enabled`), «Enviar prueba» y «Desvincular». Desvincular pide confirmación, borra `TelegramLink` y el bot envía «Desvinculado de tick-tack-done».
4. **Bloqueo:** si Telegram responde `403 Forbidden: bot was blocked by the user`, el enlace pasa a `status='blocked'`, con un aviso en la tarjeta y en la columna Telegram de la matriz (102): «Has bloqueado el bot. Desbloquéalo en Telegram y pulsa “Volver a comprobar”». Los envíos se registran como `disconnected`.
5. **Telegram como canal en la matriz (102)**, y en «Enviar prueba» los mismos botones de acción.

**Criterios de aceptación:**
- [ ] 1280×800: se ven el QR (160 ±2 px) y el botón «Abrir Telegram»; el `href` empieza por `https://t.me/` y lleva `?start=` con el código.
- [ ] 390×844: sin QR; el botón tiene 44 px de alto y abre la app de Telegram.
- [ ] e2e con un falso Telegram: `/start <código>` → la web pasa a «Conectado como @test» en ≤ 3 s sin recargar.
- [ ] Simular un 403 de bloqueo → `status='blocked'`, con el aviso en la tarjeta y en la matriz.
- [ ] Desvincular → la tarjeta vuelve al estado inicial; un envío posterior queda `skipped`, motivo `not_linked`.
- [ ] Capturas antes/después de los tres estados (sin vincular, vinculado y bloqueado), en escritorio y móvil.

#### TTD-AUD-104 · P2 · Ajustes > Acerca de

**Estado actual:** no se ve la versión en ningún sitio (`TTD-R80_33`). `GET /api/v1/health` ya devuelve `commit` (`api/health/health.response.dto.ts`).

**Comportamiento esperado:** una página «Acerca de» (`/settings/about`) con:
- **Web:** commit corto y fecha de compilación (`define: {__APP_COMMIT__, __BUILD_TIME__}` en Vite);
- **API:** `commit`, `version` y `built_at` de `/health`;
- **MCP:** `serverInfo.version` (85.3);
- un aviso fino si los commits de la web y del API no coinciden;
- «Copiar diagnóstico» (texto con esas versiones, el navegador y la zona horaria, **sin** tokens ni el correo);
- enlaces al repositorio y al CHANGELOG.

**Criterios de aceptación:**
- [ ] Muestra `acd7570`, o el commit desplegado, para el API, y el de la web.
- [ ] «Copiar diagnóstico» copia un texto sin `@` ni `Bearer` (test).
- [ ] Captura en escritorio y móvil.

## 5. Contrato del MCP tras esta ronda (cambios respecto a las 61 herramientas del 22/10)

| Herramienta | Cambio | Punto |
|---|---|---|
| `create_task`, `update_task` | `parse:true` respeta `^lista`; `update_task` acepta `parent_id`; `warnings[]` | 82, 81 |
| `complete_task` | `complete_children`; error con `data.pending_*` | 82 |
| `reopen_task` | Reabre también las canceladas | 82 |
| `cancel_task`, `add_task_reminder` | Descripción corregida; `trigger` normalizado | 82, 85 |
| `list_tasks` | `from` inclusivo y `range_field` | 83 |
| `search`, `list_notes`, `api_catalog`, `list_smart_list_tasks` | `{items, next_cursor}` con cursor opaco | 83 |
| `start_focus` | `task_id`, `type` y `minutes` | 84 |
| **nuevas** `pause_focus`, `resume_focus`, `finish_focus`, `abort_focus`, `get_focus_state`, `update_focus_settings` | Foco completo | 84, 101 |
| `api_request` | Conserva el `status` HTTP en `data` | 85 |
| `replan_day` + **nueva** `discard_replan` | Sin borradores vacíos | 85 |
| `list_task_attachments` | Metadatos de Drive y `drive_state` | 99 |
| **nuevas** `link_drive_file` y `remove_task_attachment` | Adjuntos en Drive, sin binarios | 99 |
| **nuevas** `list_task_links`, `add_task_link` y `remove_task_link` | Enlaces | 100 |
| **nuevas** `get_notification_settings` y `send_test_notification` | Notificaciones (solo lectura y prueba propia) | 102 |
| `initialize` | `version` con commit y `listChanged:true` | 85 |

Total esperado: **61 + 14 = 75 herramientas**: 6 de Foco, `discard_replan`, 2 de adjuntos, 3 de enlaces y 2 de notificaciones. El número exacto va en `docs/mcp/CHANGELOG.md`. Las descripciones nuevas, en inglés y como las actuales.

## 6. Verificación global (para cada PR)

1. `pnpm -r lint && pnpm -r typecheck && pnpm -r test` y `pnpm --filter api test:e2e`, en verde.
2. Playwright con dos proyectos (`desktop` 1280×800 y `mobile` 390×844, `deviceScaleFactor:2`) y los dos temas. Las capturas `antes`/`despues` se generan con `pnpm --filter web e2e:screens -- --grep TTD-AUD-NN`; añade el script si no existe.
3. Tabla en la descripción de la PR: `| ID | Criterio | Resultado | Evidencia |`, con **todos** los criterios de los puntos incluidos.
4. MCP: lista de herramientas (`tools/list`) antes y después adjunta a la PR, y el diff de `api-operations.json`.
5. `docs/audit/ESTADO.md` actualizado: 80-104, con su estado y la PR.

## 7. Evidencias incluidas

| Fichero | Qué muestra |
|---|---|
| `TTD-R80_01-hoy-lista.png`, `TTD-R80_09-lista-casa.png` | Panel derecho vacío (91) |
| `TTD-R80_02-composer-hoy.png`, `TTD-R80_06-composer-global.png` | Composer local frente al global sin contexto (92) |
| `TTD-R80_04-hoy-detalle-panel.png`, `TTD-R80_11-calendario-tarea-modal.png` | Detalle en panel (Hoy) y en modal (Calendario): se mantiene (1.1) |
| `TTD-R80_10-calendario-mes.png`, `TTD-R80_12-calendario-selector-periodo.png`, `TTD-R80_13-calendario-filtro.png` | Sidebar sin filtros e `input` nativo mm/dd/yyyy (93) |
| `TTD-R80_14-calendario-semana.png` | Semana (89) |
| `TTD-R80_15-calendario-dia.png` | Día con tira y «octubre» (87) |
| `TTD-R80_17-calendario-agenda.png` | Agenda (98) |
| `TTD-R80_19-calendario-dos-semanas.png`, `TTD-R80_20-calendario-varios-dias.png` | Dos semanas a media altura (88) |
| `TTD-R80_22-foco.png` | Foco (101) |
| `TTD-R80_25-reporte-semanal.png`, `TTD-R80_26-reporte-semana-anterior.png`, `TTD-R80_27-estadisticas.png` | Cifras y detalle diario (95) |
| `TTD-R80_28-menu-avatar.png` | La racha está en el avatar (1.1) |
| `TTD-R80_29-ajustes-inicio.png`, `TTD-R80_31-ajustes-tokens-lista.png`, `TTD-R80_33-ajustes-cuenta.png` | Ajustes, sin «Acerca de» (104) |
| `TTD-R80_37-ajustes-notificaciones.png` | Notificaciones actuales (102) |
| `TTD-R80_40-ajustes-integraciones.png` | Google/Drive y Telegram (97, 99, 103) |
| `TTD-R80_m01…m06` | Móvil: Hoy, cajón, Semana, Mes, Foco y Tokens/MCP (96) |
| `REF-TICKTICK_*` | Referencias de TickTick (sección 2) |
| `r80/revision-pablo.md` | Revisión de Pablo del 22/10 |
| `r80-mcp/informe-mcp.md` | Informe MCP: 61 herramientas y 53 pruebas en vivo |

## 8. Prompt para Codex (copiar y pegar)

```text
Trabaja en el repo povedica/tick-tack-done partiendo de main actualizado (afc9f5d o posterior).
Lee entero docs/audit/ttd-codex-r80.md (cópialo allí junto con docs/audit/evidencias/r80/ desde el zip si no está).
Es autónomo: implementa los puntos TTD-AUD-80 a 104 en TRES PR, con un commit por punto:
  PR A fix(TTD-AUD-80..86) MCP/API — empieza por 80, 81 y 86 (P0);
  PR C feat(TTD-AUD-99..104) — 99 antes que 100;
  PR B fix(TTD-AUD-87..98) UI — puede ir en paralelo.
Obligatorio en cada PR:
  - Antes de tocar nada, comprueba cada «Estado actual» con las rutas file:línea del documento (si se han movido, busca el símbolo). Lo marcado «a verificar», reprodúcelo primero y anota el resultado.
  - Tests primero (unitario/e2e/Playwright) para cada criterio de aceptación; lint, typecheck, test y e2e en verde.
  - Capturas antes/después de cada pantalla tocada a 1280×800 y 390×844, en tema claro y oscuro, en docs/audit/evidencias/r80/<ID>_<pantalla>_<antes|despues>_<desktop|mobile>_<light|dark>.png, enlazadas en una tabla de la PR.
  - Recorre en la PR, uno a uno, todos los criterios: «✅ cómo/viewport» o «❌ por qué». Las medidas [medible] se comprueban con boundingBox() y una tolerancia de ±1 px.
  - UI compacta, fina y sutil; un solo modal de «Añadir tarea» (TaskComposer/CaptureSheet); solo tokens de styles/tokens.css (crea los de la sección 3); i18n en es, en y extra; accesibilidad con 44 px de zona táctil en móvil.
  - Adjuntos (99): NINGÚN fichero en el servidor (ni copia, ni caché, ni miniatura, ni temporal). Subida directa navegador→Drive con sesión resumable iniciada por el backend. Por el API, solo en streaming a Drive. La BD guarda solo metadatos. Sin Drive: botón deshabilitado + 409 drive_not_connected. Sigue el plan de retirada paso a paso y no borres el volumen ni ficheros de producción sin el OK de Pablo.
  - MCP: actualiza el catálogo según la sección 5, con tests en mcp.service.spec.ts y mcp.e2e-spec.ts, y regenera openapi.json, api-operations.json y el SDK.
  - Migraciones reversibles con su script de bajada; los scripts de datos (close-orphan-series, repair-allday-utc, migrate-attachments-to-drive) con --dry-run y copia de seguridad previa.
  - Actualiza docs/audit/ESTADO.md (80-104) y docs/mcp/CHANGELOG.md.
No toques datos reales de producción fuera de esos scripts. No subas secretos. Si algo del documento choca con el código, explica en la PR qué has decidido y por qué.
```
