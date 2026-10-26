# Paquete D · API y MCP (backend): contadores, replan, recordatorios, origen de la actividad, forma de las respuestas y subida de adjuntos por MCP

- **Repo:** povedica/tick-tack-done · **Base:** `main` en `318fbd9`
- **Rama/worktree:** `git worktree add ../ttd-wt-d -b codex/wt-d-api-mcp main`
- **PR:** `fix(wt-d): API/MCP — link_count, replan, canal de recordatorio, source, respuestas y adjuntos MCP`
- **Prioridad:** P1 · **Tamaño:** L (10 puntos, solo `apps/api` + `mcp`)
- **Rutas:** las líneas son de `318fbd9`.

## 1. Objetivo y contexto

Corregir los fallos de API y MCP que encontró la prueba completa de r80 en producción (23/10/2026, ~20:55–21:10, hora de Madrid). El informe completo está en `r80-test-report.md`, secciones 2–3. Añadir además la subida de adjuntos por MCP (TTD-AUD-111).

**Datos de producción usados en la prueba** (lista `grokbot-ticktackdone`, `b7e06139-a8b5-4ed5-b60b-25bd27358b9d`):

| id | Tarea | Para qué sirvió |
|---|---|---|
| `ac63d7aa-9c2f-43ef-b298-849cf7d7c020` | UI-r80 enlaces y adjuntos | 2 enlaces. `get_task` devuelve `link_count:0` y `list_tasks` devuelve `2` |
| `324f10bb-72d4-4531-9e8c-2ba0dbc7b215` / `436abb22-c602-4aa0-8b94-31b637bc2595` | serie diaria T81 | `436abb22` la creó el scheduler con `source:"automation"`; la serie se cerró por MCP |
| `c087805c…`, `bb508114…`, `4f60df4d…`, `7d13e724…` | UI-r80 celda 1–4/6 | creadas en paralelo con el **mismo** `sort_order` `2621440` |
| `fa96e1a3…` | (de Pablo) | día completo con `due` 2026-10-19T13:35Z |

## 2. Reglas de trabajo en paralelo (obligatorias)

Este paquete se trabaja **a la vez que otros 4**, cada uno en su propio worktree. Ninguno depende de que otro se haya fusionado. Para que el merge sea limpio:

1. **Base y rama.**
   - Parte de `main` actualizado: `318fbd9` o posterior; producción está en `318fbd9`.
   - Crea el worktree: `git worktree add ../ttd-wt-d -b codex/wt-d-api-mcp main`.
   - **Una PR** con un commit por punto: `fix(TTD-AUD-NNN): …` o `feat(TTD-AUD-NNN): …`.
2. **Ficheros.**
   - Solo puedes modificar los de la sección «Ficheros que PUEDE tocar». Puedes crear ficheros nuevos dentro de esas carpetas.
   - Si necesitas tocar un fichero de «NO debe tocar», **para**: busca una alternativa local (envolver, componer, CSS con más especificidad en tu propio fichero) o déjalo anotado en la PR como «pendiente de otro paquete». No lo edites.
3. **Sin dependencias nuevas.** No toques `package.json`, `pnpm-lock.yaml`, `.github/` ni `CHANGELOG.md`. La entrada de changelog va en la descripción de la PR; Pablo la consolida al fusionar.
4. **i18n, CSS y Playwright web: no aplica.** Este paquete no toca `apps/web`.
5. **API y BD.**
   - Si cambias rutas o DTO de la API, regenera **al final** con `pnpm --filter api build && pnpm --filter api openapi:generate && pnpm --filter @reflexionia/sdk generate`.
   - Haz commit de `apps/api/openapi.json`, `apps/api/src/mcp/api-operations.json` y `packages/sdk/src/generated/schema.d.ts` **en un commit aparte** `chore(api): regenerate openapi`. No los edites a mano.
   - Si al rebasar chocan, quédate con la versión de `main` y vuelve a generarlos.
   - Para los tests de integración usa una BD propia: `DATABASE_URL=…/ttd_wt_d`.
6. **Evidencias:** salida de los tests y ejemplos de petición/respuesta (sin tokens) por punto en la PR.
7. **Verificación antes de la PR:**
   - `pnpm format:check`, `pnpm lint`, `pnpm typecheck` y `pnpm test`.
   - `pnpm test:integration` si tocas la API.
   - Recorre cada criterio en la PR: «✅ cómo/ancho» o «❌ por qué».
8. **KISS:** el cambio mínimo que cumpla los criterios. Sin refactors fuera del alcance. Lo que no puedas reproducir, documéntalo en la PR con evidencia («a verificar»).

## 3. Puntos (orden de commits)

| Orden | ID | Prio | Título | Tamaño |
|---|---|---|---|---|
| 1 | TTD-AUD-112 | P1 | `link_count` es 0 en `get_task`/`create_task`/`update_task` | S |
| 2 | TTD-AUD-113 | P1 | `replan_day` acepta fechas futuras y propone tareas no vencidas | S |
| 3 | TTD-AUD-115 | P2 | Canal por defecto de los recordatorios = `push` aunque push no esté configurado | S |
| 4 | TTD-AUD-116 | P2 | `source` de la actividad mal etiquetado (`automation`/`api` en llamadas MCP) | M |
| 5 | TTD-AUD-117 | P3 | Las respuestas de escritura no incluyen el evento recién creado en `activity` | S |
| 6 | TTD-AUD-118 | P3 | Una serie cerrada sigue exponiendo `repeat_label`/`next_occurrence` | S |
| 7 | TTD-AUD-119 | P3 | `search` duplica los `items` dentro de `groups` | S |
| 8 | TTD-AUD-122 | P3 | `sort_order` duplicado al crear tareas en paralelo | S |
| 9 | TTD-AUD-123 | P3 | Tarea de día completo con `due` fuera de la medianoche (dato) | S |
| 10 | TTD-AUD-111 | P2 | MCP: herramienta de subida de adjuntos y errores de Drive más claros | M |

TTD-AUD-120 y 121 (foco) son del **paquete E**, porque viven en `modules/focus/focus.controller.ts`. **No los toques aquí.**

#### TTD-AUD-112 · P1 · `link_count` es 0 en `get_task`/`create_task`/`update_task`

**Evidencia:** para `ac63d7aa`, `get_task` → `"link_count":0` con `links` de 2 elementos; `list_tasks` → `2`.

**Causa:**
- `apps/api/src/modules/tasks/tasks.service.ts:235` incluye `_count: { select: { links: true } }` **solo en `list()`**.
- `apps/api/src/modules/tasks/task.mapper.ts:102` hace `link_count: row._count?.links ?? 0`, así que en get/create/update (sin `_count`) sale 0.

**Cambio:**
- Incluir `_count: { select: { links: true } }` en todas las lecturas que pasan por el mapper: get, create, update, complete, reopen, restore, move…
- O, si el mapper recibe `links`, usar `row._count?.links ?? row.links?.length ?? 0`.
- Hazlo en un helper `taskInclude()` único para que no vuelva a divergir.

**Aceptación:**
- [ ] Tras `add_task_link` x2, `get_task`, `update_task` (cambiando el título) y `list_tasks` devuelven `link_count: 2`; tras `remove_task_link` → 1 en los tres.
- [ ] `create_task` con 2 URLs en `content` → `link_count: 2` en la respuesta del create.

**Tests:** integración `test/wt-d-links.e2e-spec.ts`.

#### TTD-AUD-113 · P1 · `replan_day` acepta fechas futuras y propone tareas no vencidas

**Evidencia:** `replan_day {date:"2027-06-01"}` creó un borrador con 40 decisiones sobre tareas de Pablo **no vencidas** (todo lo que vence antes de esa fecha). Se descartó con `discard_replan` y no se cambió nada.

**Causa:** `apps/api/src/modules/planning/day-closing.service.ts:237-262` (`replanTool`) acepta cualquier `date` y la usa como «hoy» en `queue(user.id, local, zone, true)`, así que todo lo anterior a esa fecha cuenta como vencido.

**Cambio:**
- Validar `date ≤ hoy` (en la zona del usuario). Si es futura → `400 validation_failed`, «replan solo para hoy o días pasados».
- La cola de candidatas toma solo tareas con `due < inicio de hoy` (vencidas respecto a **hoy**), aunque `date` sea pasada.
- Actualiza la descripción de la herramienta en `apps/api/src/mcp/mcp.catalog.ts`.

**Aceptación:**
- [ ] `replan_day {date: mañana}` → 400 y no se crea ninguna sesión (`planning_sessions` sin filas nuevas).
- [ ] `replan_day` sin fecha, con 2 vencidas y 1 que vence la semana que viene → 2 decisiones.
- [ ] `discard_replan` sigue funcionando.

**Tests:** unit del servicio; integración `test/wt-d-replan.e2e-spec.ts`.

#### TTD-AUD-115 · P2 · Canal por defecto de los recordatorios = `push` aunque push no esté configurado

**Evidencia:** `add_reminder` sin `channel` → `channel:"push"`. En producción `VAPID_PUBLIC_KEY` está vacía (`get_notification_settings` → `push.configured:false`), así que el recordatorio no llega por ese canal.

**Causa:**
- `apps/api/src/modules/tasks/tasks.service.ts:1504` (`channel: dto.channel ?? 'push'`) y `:2531`, `:2565`;
- `tasks.dto.ts:518`; `mcp/mcp.service.ts:513`; `mcp/mcp.catalog.ts:442`.

**Cambio (KISS):**
- Función `defaultReminderChannel()` en `modules/tasks/`:
  - `push` si `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` están definidas;
  - si no, `email` si `emailConfigured()` (`apps/api/src/mail/send-email.ts`, solo lectura);
  - si no, `push` (no hay alternativa).
- Úsala en los 3 sitios. Documenta el default en el DTO y en el catálogo MCP.
- **No toques** la entrega (`notifications/**`, `reminder.transport.ts`): son del paquete C. Telegram no es un canal de recordatorio en el DTO actual; no lo añadas aquí.

**Aceptación:**
- [ ] Sin VAPID y con email configurado: `add_reminder` sin canal → `channel:"email"`.
- [ ] Con VAPID: `push`.
- [ ] Un canal explícito se respeta siempre.

**Tests:** unit con variables de entorno simuladas; integración.

#### TTD-AUD-116 · P2 · `source` de la actividad mal etiquetado

**Evidencia:**
- La ocurrencia que crea el scheduler (`436abb22`) tiene `source:"automation"`, y su `update` posterior por MCP también salió como `automation`.
- `link_added`/`link_removed` hechos por MCP → `source:"api"`.
- En `detach_occurrence`, el update de la regla padre sale como `api`.
- En cambio, `task.created`, `task.restored` y `occurrence.detached` sí salen como `mcp`.

**Causa:**
- `apps/api/src/auth/auth-user.ts:23-30`: `actorOf()` pone `actorKind: tokenId === null ? 'user' : 'api'` y **no mira** `X-TTD-Source`.
  - Solo algunos caminos leen la cabecera; por ejemplo, `drive/attachments.controller.ts:166` (`req.header('x-ttd-source') === 'mcp'`). El proxy MCP la envía siempre (`mcp/mcp-api.ts:67`).
- Las ocurrencias las inserta `scheduler/scheduler.service.ts:252-330` (`insertSuccessor`) con `source:'automation'` (`:287`, `:321`), también cuando el origen es un `complete_task {materialize_next:true}` llamado por MCP.
- La actividad posterior de esa tarea parece heredar el `source` de la **fila** en lugar del actor de la petición. A verificar en `tasks.service.ts`, donde se compone `activity[].source`.

**Cambio:**
- `AuthUser` gana `requestSource: 'web' | 'api' | 'mcp' | 'automation'`, rellenado en el guard o middleware a partir de `X-TTD-Source` **solo si la petición viene del proxy MCP interno** (loopback + bearer). No confíes en la cabecera desde fuera.
- `actorOf()` lo propaga al evento.
- `activity[].source` = el `source` del **evento**, no de la fila.
- En `insertSuccessor`: si lo dispara una petición (complete con `materialize_next`), pasa el `source` del actor; el cron sigue con `automation`.

**Aceptación:**
- [ ] Por MCP: `add_task_link`, `remove_task_link`, `detach_occurrence` (evento sobre la regla padre), `update_task` sobre una ocurrencia creada por el scheduler, y `complete_task {materialize_next:true}` (la ocurrencia nueva) → todos con `source:"mcp"` en `activity`.
- [ ] Por REST con un token personal → `api`. Por la web → `web` (o el valor actual para usuario).
- [ ] La cabecera `X-TTD-Source: mcp` enviada desde fuera (no loopback) **no** cambia el source (test).

**Tests:** integración `test/wt-d-source.e2e-spec.ts`.

#### TTD-AUD-117 · P3 · Las respuestas de escritura no incluyen el evento recién creado en `activity`

**Evidencia:** `cancel_task` y `complete_task` devolvían `activity` sin su propio evento (`task.cancelled`/`task.completed`); `create_task` sí lo incluye.

**Causa (a localizar):** la respuesta se compone antes de que se haga commit del evento, o la lectura de actividad se hace fuera de la transacción. Revisa en `tasks.service.ts` cómo se adjunta `activity` (`include_activity`) en complete, cancel, reopen y update.

**Cambio:** componer la respuesta **después** del `events.record` dentro de la misma transacción, o releer la actividad tras el commit.

**Aceptación:**
- [ ] `activity[0].type` es el evento de la operación en complete (`task.completed`), cancel, reopen, update, move y restore, por MCP y por REST.

**Tests:** integración parametrizada.

#### TTD-AUD-118 · P3 · Una serie cerrada sigue exponiendo `repeat_label`/`next_occurrence`

**Evidencia:** `324f10bb` (completada; su serie se cerró en `436abb22` con `recurrence:null`) sigue devolviendo `repeat_label:"Cada día"` y `next_occurrence`.

**Causa:** `apps/api/src/mcp/mcp.service.ts:1250-1270` decora con `repeat_label`/`next_occurrence` toda tarea con `repeat_rule`, sin mirar si la serie está abierta (`series.recurrenceOpen` o equivalente).

**Cambio:** si la serie está cerrada o la tarea no es la ocurrencia vigente → `repeat_label` con el sufijo «(serie terminada)» y `next_occurrence: null`. O bien no exponer `next_occurrence` en ocurrencias completadas.

**Aceptación:**
- [ ] Ocurrencia completada de una serie cerrada → `next_occurrence: null`.
- [ ] Ocurrencia activa de una serie abierta → igual que hoy.

**Tests:** unit en `mcp.service.spec.ts`.

#### TTD-AUD-119 · P3 · `search` duplica los `items` dentro de `groups`

**Evidencia:** `search {q:"T81 diaria"}` devuelve las 2 tareas en `items` y otra vez completas en `groups[0].items`: respuesta doble.

**Causa:** `apps/api/src/modules/search/search.service.ts:33-63` llena `groups[].items` con los mismos objetos que `items`.

**Cambio (compatible):** en `groups[]` de tipo task/note, devolver `ids: string[]` (+ `count`) en vez de los objetos. Las listas y etiquetas se quedan como están. Revisa si la web usa `groups[].items` de tareas (`apps/web/src/features/search/**`).
- Si lo usa: este paquete **no** toca la web. Mantén `items` en `groups` para REST y aplica el recorte **solo en la respuesta MCP** (`mcp.service.ts`).

**Aceptación:**
- [ ] La respuesta MCP de `search` no repite objetos de tarea: el tamaño baja ≈ 50 % en el caso de prueba.
- [ ] La búsqueda web sigue funcionando (e2e de humo existente en verde).

#### TTD-AUD-122 · P3 · `sort_order` duplicado al crear tareas en paralelo

**Evidencia:** 4 tareas creadas a la vez → `sort_order` `2621440` en las 4.

**Causa:** el create calcula «al final de la lista» leyendo el máximo y sumando un paso, sin bloqueo (busca el cálculo en `create()` de `tasks.service.ts`; los helpers son `sortOrderAtEnd`).

**Cambio (KISS):** dentro de la transacción del create, `pg_advisory_xact_lock(hashtextextended('task-order:'||project_id,0))` antes de leer el máximo (el mismo patrón que `telegram-settings.service.ts:40`). Alternativa: desempate con `id` en `ORDER BY`, que ya existe (`tasks.service.ts:81`), y aceptar duplicados. Elige el lock.

**Aceptación:**
- [ ] 10 `create_task` concurrentes en la misma lista → 10 `sort_order` distintos y crecientes por orden de commit.

**Tests:** integración con `Promise.all`.

#### TTD-AUD-123 · P3 · Tarea de día completo con `due` fuera de la medianoche

**Evidencia:** de 28 tareas de día completo revisadas, `fa96e1a3` (de Pablo) tiene `due` 2026-10-19T13:35Z.

**Cambio:**
1. Ejecutar `scripts/repair-allday-utc.ts` en **dry-run** contra una copia o staging y adjuntar la salida a la PR. **No** contra producción desde Codex.
2. Si el script no la detecta, ampliarlo: `is_all_day = true` y `due` ≠ medianoche local en `time_zone`.
3. Añadir una guardia en el create/update: si `is_all_day`, normalizar `due`/`start` a la medianoche local (puede que ya exista: compruébalo y añade el test).
- La corrección del dato en producción la hará Pablo con el script (paso documentado en la PR).

**Aceptación:**
- [ ] El dry-run lista `fa96e1a3` (u otras) con el valor propuesto.
- [ ] `update_task {is_all_day:true, due_date:"2026-10-19T15:35+02:00"}` → `due` = medianoche local.

#### TTD-AUD-111 (especificación completa)

##### TTD-AUD-111 · P2 · MCP: herramienta dedicada de subida de adjuntos y errores de Drive más claros

**Comprobado el 23/10 a las 20:59–21:00 (hora de Madrid), sobre la tarea de prueba «Prueba adjuntos 23-oct» (lista grokbot-ticktackdone), con Drive conectado (yoyyosemite@gmail.com):**
- Subir por MCP **funciona**, pero solo con la herramienta genérica `api_request` (`POST /api/v1/tasks/{id}/attachments` con `files[{field:'file', filename, base64}]`). Responde 201 con `source:"mcp"`, `drive_state:"ok"` y `web_view_link` de Drive. Una `.html` se rechaza con `unsupported_media_type`. `remove_task_attachment` con `trash_in_drive:true` → `{"removed":true}`, y el fichero ya no se puede volver a vincular.
- **No hay ninguna herramienta MCP específica de subida.** Un agente tiene que descubrir `api_catalog` → `api_request` y montar el multipart a mano.
- `link_drive_file` con un id que la app no puede ver (con el permiso `drive.file`, solo ve ficheros creados por ttd o elegidos en el Picker) devuelve `drive_file_not_found: The file is no longer in Drive`. Ese mensaje es engañoso: el fichero puede existir y simplemente no estar autorizado (`api/drive/drive-client.ts:67-68`, que traduce cualquier 404).
- La llamada interna del MCP tiene un límite de 30 s (`api/mcp/mcp-api.ts:61`). Con 25 MiB y subida a Drive en trozos de 7,75 MiB podría cortarse (**a verificar**).

**Comportamiento esperado:**
1. Nueva herramienta `upload_task_attachment {task_id, filename, base64, content_type?}`. Internamente reutiliza `DriveAttachmentsService.stream` (sin pasar por HTTP de loopback) y devuelve el mismo `DriveAttachmentResponseDto`. Mismos límites: 25 MiB, 50 por tarea, tipos de `acceptedMime`.
2. Error distinto, `drive_file_not_accessible` (404, con el mensaje «El fichero no existe o ttd no tiene permiso: elígelo con el Picker»), cuando Drive responde 404 a `files.get` en `link`. Se mantiene `drive_file_not_found` para los ficheros en la papelera.
3. Límite de la subida del MCP igual al de la API (≥ 120 s) o sin pasar por loopback (punto 1).
4. Quitar la dependencia `multer` si solo queda el `import { MulterError }` de `api/http/api-exception.filter.ts:10`.

**Criterios de aceptación:**
- [ ] `tools/list` incluye `upload_task_attachment`; test en `mcp.service.spec.ts` y en `test/mcp.e2e-spec.ts` (con un Drive simulado): .txt → 201 con `source:"mcp"`; .html → 415; > 25 MiB → 413.
- [ ] Un test garantiza que ningún camino de subida escribe en disco: se simula `node:fs` y se comprueba que no se llama a `writeFile`/`createWriteStream`.
- [ ] `link_drive_file` con un id no autorizado → `drive_file_not_accessible`; con un fichero en la papelera → `drive_file_not_found`.
- [ ] Subida de 24 MiB por MCP completada sin timeout (e2e con Drive simulado y latencia artificial).

## 4. Ficheros que PUEDE tocar (propiedad exclusiva de D)

- `apps/api/src/modules/tasks/**`: `tasks.service.ts`, `task.mapper.ts`, `tasks.dto.ts`, `task-links.ts`, `quick-add.ts`… y sus specs.
- `apps/api/src/modules/planning/**`: `day-closing.service.ts`, `planning.service.ts`…
- `apps/api/src/modules/search/**`.
- `apps/api/src/scheduler/scheduler.service.ts`: **solo D**. C no lo toca.
- `apps/api/src/mcp/**`: `mcp.service.ts`, `mcp.catalog.ts`, `mcp-api.ts`, `mcp.controller.ts` y specs. `api-operations.json` solo se regenera.
- `apps/api/src/drive/**` (111).
- `apps/api/src/auth/auth-user.ts` y el guard o middleware que rellena `AuthUser` (116). **Solo D.**
- `apps/api/src/prisma/series-lock.ts`.
- `scripts/repair-allday-utc.ts`.
- `apps/api/test/wt-d-*.e2e-spec.ts` (nuevos) y specs unitarios junto a los ficheros.
- **Generados** (commit aparte): `apps/api/openapi.json`, `apps/api/src/mcp/api-operations.json`, `packages/sdk/src/generated/schema.d.ts`.

## 5. Ficheros que NO debe tocar

| Fichero o carpeta | Propietario |
|---|---|
| `apps/api/src/modules/integrations/**`, `apps/api/src/integrations/telegram-*`, `notifications/**`, `scheduler/reminder.transport.ts`, `events/domain-events.ts`, `security/runtime-config.ts` | C |
| `apps/api/prisma/schema.prisma` y `prisma/migrations/**` | C (única migración de la ronda) |
| `apps/api/src/modules/focus/**`, `modules/reports/**`, `reading/**`, `modules/stats/**` | E |
| `apps/web/**` (todo) | A / B / C / E |
| `packages/domain/**` | C (`reminders/preferences.ts`); el resto, nadie |
| `package.json`, `pnpm-lock.yaml`, `CHANGELOG.md`, `.github/**` | nadie |

## 6. Cómo evitar conflictos (específico de D)

- **Sin migraciones.** Si un punto parece necesitarla (por ejemplo, un índice para 122), resuélvelo con un advisory lock o con el código, y anótalo en la PR como mejora futura.
- **Sin eventos nuevos** en `domain-events.ts`, que es de C. 116 reutiliza los existentes.
- **`auth-user.ts`:** solo D lo edita. Añade el campo nuevo como **opcional**, para no romper la compilación de ramas que construyen `AuthUser` en sus tests.
- **OpenAPI/MCP:** regenera al final en un commit aparte. En conflicto, quédate con `main` y vuelve a generar. Si cambias el catálogo MCP, actualiza el test de recuento de herramientas (`mcp.service.spec.ts`).
- **BD de tests propia:** `DATABASE_URL=…/ttd_wt_d`.

## 7. Tests a añadir

| Tipo | Fichero | Puntos |
|---|---|---|
| Integración | `test/wt-d-links.e2e-spec.ts` | 112 |
| Integración | `test/wt-d-replan.e2e-spec.ts` | 113 |
| Unit + integración | `modules/tasks/reminder-channel.spec.ts`, `test/wt-d-reminders.e2e-spec.ts` | 115 |
| Integración | `test/wt-d-source.e2e-spec.ts` | 116 (incluido el spoofing de cabecera) |
| Integración | `test/wt-d-activity.e2e-spec.ts` | 117 |
| Unit | `mcp/mcp.service.spec.ts` (ampliar) | 118, 119, 111 (`tools/list`) |
| Integración | `test/wt-d-sort-order.e2e-spec.ts` | 122 |
| Unit | `scripts/repair-allday-utc.spec.ts` o equivalente | 123 |
| Integración | `test/wt-d-mcp-attachments.e2e-spec.ts` (Drive simulado) | 111: .txt → 201 `source:"mcp"`; .html → 415; > 25 MiB → 413; sin escrituras a disco (mock de `node:fs`) |

## 8. Checklist de verificación manual (tras desplegar, por MCP sobre tareas de prueba de `grokbot-ticktackdone`)

| # | Llamada | Esperado |
|---|---|---|
| 1 | `get_task ac63d7aa-9c2f-43ef-b298-849cf7d7c020` | `link_count: 2` |
| 2 | `replan_day {date: <mañana>}` | 400; no se crea sesión. **No aplicar ningún replan sobre tareas reales.** |
| 3 | `add_reminder` sin canal sobre una tarea de prueba | `channel:"email"` mientras no haya VAPID |
| 4 | `add_task_link` → `get_task include_activity` | `task.link_added` con `source:"mcp"` |
| 5 | `cancel_task` y luego `reopen_task` sobre una tarea de prueba | `activity[0]` es el evento propio |
| 6 | `get_task 324f10bb-72d4-4531-9e8c-2ba0dbc7b215` | `next_occurrence: null` |
| 7 | `search {q:"UI-r80"}` | sin objetos duplicados en `groups` |
| 8 | 5 `create_task` en paralelo en la lista de prueba | `sort_order` distintos |
| 9 | `tools/list` | aparece `upload_task_attachment` |

## 9. Prompt para Codex (también en `ttd-wt-d-api-mcp-prompt.txt`)

```text
Trabaja en el repo povedica/tick-tack-done.
Crea un worktree propio desde main actualizado (318fbd9 o posterior):
  git worktree add ../ttd-wt-d -b codex/wt-d-api-mcp main
Copia en el repo docs/audit/ttd-wt-d-api-mcp.md (este documento). Si docs/ no existe, usa test-artifacts/audit/.
Léelo entero: es autónomo y es la única fuente de requisitos.

Objetivo: API/MCP backend (link_count, replan, canal de recordatorio, source, respuestas, sort_order, all-day y subida de adjuntos por MCP).
Puntos: TTD-AUD-112, 113, 115, 116, 117, 118, 119, 122, 123, 111.

Reglas clave:
- Este paquete se desarrolla EN PARALELO con otros 4 paquetes (A–E) en otros worktrees.
- Modifica SOLO los ficheros de «Ficheros que PUEDE tocar».
- NO edites los de «NO debe tocar», ni i18n/es.ts, en.ts o extra.ts, ni styles/tokens.css, package.json, pnpm-lock.yaml, CHANGELOG.md o .github/.
- Este paquete no toca apps/web: sin i18n, CSS ni Playwright web. Sin migraciones Prisma ni eventos nuevos.
- OpenAPI/SDK solo regenerados, en un commit aparte.
- Una PR «fix(wt-d): API/MCP backend (link_count, replan, canal de recordatorio, source, respuestas, sort_order, all-day y subida de adjuntos por MCP)», con un commit por punto en el orden de la sección 3.
- Tests unitarios y de integración según el documento (BD propia ttd_wt_d).
- pnpm format:check, lint, typecheck, test y test:integration, todo en verde.
- En la PR, recorre cada criterio de aceptación con ✅/❌ y evidencia.
- KISS. No inventes datos: lo que no reproduzcas, anótalo como «a verificar» con evidencia.
```
