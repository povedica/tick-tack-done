# Especificación funcional: cierre del día, proyección de carga, «cuándo» vs fecha límite y replanificar el día — tick-tack-done

**Versión:** 1.0 — 19 oct 2026
**Destinatario:** agente de desarrollo (Cursor) trabajando sobre `github.com/povedica/tick-tack-done`
**Estilo:** sigue las convenciones de `docs/spec/especificacion-producto-v1.1.md`, `docs/spec/countdown-spec-v1.0-*.md` y `docs/spec/cursor-prompt-google-calendar-sync-v1.0-*.md` (requisitos RF numerados, modelo Prisma, API REST bajo `/api/v1`, herramientas MCP, UI web/PWA muy parecida a TickTick, textos en español).
**Origen:** el propietario eligió las funciones 1, 3, 4 y 5 de un ranking de huecos frente a Sunsama, Things, Motion y Akiflow. La 5 (replanificar) va en **versión ligera** por decisión suya; la versión pesada (auto-planificación estilo Motion) queda como hoja de ruta en §12, no se construye ahora.

---

## 0. Cómo leer este documento

- Es una especificación **one-shot**: contiene todo lo necesario para implementar las cuatro funcionalidades sin preguntar nada más. Si algo te parece ambiguo, elige la opción que se parezca más a TickTick (o a Things donde el documento lo diga) y déjalo anotado en el PR.
- Cada requisito tiene un identificador `RF-26xx` (rango nuevo; están usados 20xx–23xx en la especificación de producto, 24xx en countdown y 25xx en la sync de Google Calendar). Los tests de aceptación referencian estos identificadores.
- Rutas de archivo referenciadas relativas a la raíz del repo.
- **No rompas nada existente**: la suite actual (`pnpm test`, integration tests de `apps/api`, Playwright de `apps/web`) debe seguir en verde al final. En particular, no toques la sync de Google Calendar (RF-25xx), countdowns (RF-24xx), el wizard de planificación existente ni el digest diario de las 7:00 salvo donde este documento lo dice.
- **El orden de los PRs de §10 importa**: cada función se apoya en la anterior (la proyección necesita duración y «cuándo»; el cierre y replanificar necesitan la proyección).

---

## 1. Estado actual y objetivo

### 1.1 Lo que ya existe (verificado en el repo, 19 oct 2026, commit `26a02b2`, rama `main`)

**Modelo de datos** (`apps/api/prisma/schema.prisma`):

- `Task` (~línea 401) ya tiene: `startDate`, `dueDate`, `isAllDay`, `durationMinutes`, `estimatedPomodoros`, `timeZone`, `repeatRule`, `status`, `priority`.
- Planificación diaria ya modelada: `DayPlan` (~línea 1184, único por `ownerId + localDate + timeZone`), `PlanMember` (rank, source), `PlanSession` (state `draft|applying|applied|discarded`, `revision`, `sources`, `snapshot`), `PlanDecision` (`done|plan_day|later|cancel|trash|skip`, `targetDate`), `PlanOperation` (único por `ownerId + idempotencyKey`).
- `User` (~línea 212) ya tiene: `timeZone` (defecto `Europe/Madrid`), `dailyReminderTime` (el digest de las 7:00), `quietHoursStart/End`, `weeklyReportSettings` (Json), `telegramEnabled`. **No** tiene jornada laboral, hora de cierre, estimación por defecto ni feature flags.
- `ExternalEvent` + `CalendarSubscription` (sync de Google Calendar, RF-25xx, mergeada hoy en PR #45): eventos externos de solo lectura con `startsAt`, `endsAt`, `isAllDay`, `timeZone`, visibilidad por suscripción.

**Backend:**

- `apps/api/src/modules/planning/`: wizard «Planifica tu día» completo — `POST /planning/sessions`, `GET /planning/sessions/:id`, `PUT/DELETE /planning/sessions/:id/decisions/:taskId`, `POST /planning/sessions/:id/apply` (con `expected_revision` + `Idempotency-Key`), `GET /plans?date&time_zone`. Lógica pura en `packages/domain/src/planning/day-plan.ts` (`planQueue`, secciones `today_timed|today|overdue|inbox|undated`).
- `apps/api/src/modules/review/`: `GET /review/daily` (`proposeDaily`, RF-2301) y `GET /review/weekly` (revisión guiada, RF-2302/2303).
- `apps/api/src/scheduler/scheduler.service.ts`: `enqueueDigests` envía el digest diario «Planifica tu día» a la `dailyReminderTime` (`kind: 'daily_digest'`, canal `both` + Telegram vía `reminder.transport.ts`, que entrega push/email/Telegram). Patrón de cola con `dedupeKey` y `catchUp` listo para reutilizar.
- `apps/api/src/modules/tasks/tasks.dto.ts`: create/update ya aceptan `start_date` y `duration_minutes`.
- `apps/api/src/mcp/`: catálogo con ~30 herramientas. Ojo: `create_task` hoy **solo acepta `title` y `project_id`** (`mcp.catalog.ts` línea ~49, `mcp.service.ts` línea ~158); `list_calendar_events` y `review_daily` ya existen.
- Eventos de dominio por outbox (`apps/api/src/events/domain-events.ts`), patrón `task.*`, `calendar.*`, `countdown.*`.

**Web/PWA:**

- `apps/web/src/features/today/TodayPage.tsx`: sección de plan (`messages.planTitle`), bloque de vencidas, secciones agrupadas, «Próximas fechas» (countdowns), agenda de eventos externos (`TodayAgenda.tsx`). La pertenencia a Hoy se deriva de `dueDate` (partición cliente vencidas/hoy) más los miembros del plan del día.
- `apps/web/src/features/planning/PlanDayPage.tsx`: el wizard de planificación (tarjetas con decisiones y resumen editable antes de aplicar).
- `apps/web/src/features/tasks/TaskDetail.tsx`: el `DateDraft` del panel ya edita `durationMinutes` junto a la fecha.
- Ajustes en `apps/web/src/features/settings/` + `features/places/Places.tsx`; i18n en `apps/web/src/i18n/es.ts` (la app va en español). Hay en camino (auditoría de hoy, aún no mergeada) una sección **Ajustes > Funciones** con interruptores por funcionalidad.

### 1.2 Objetivo

Cuatro funcionalidades nuevas, construidas en este orden porque cada una usa a la anterior:

1. **«Cuándo» vs fecha límite, con «Algún día» y «Esta noche»** (estilo Things): separar el día en que planeo hacer una tarea del día en que vence, y dar a Hoy dos válvulas para no llenarse.
2. **Proyección de carga del día** (estilo Sunsama): al planificar y en Hoy, ver si lo de hoy cabe según la jornada y la agenda externa, con aviso de sobrecarga.
3. **Ritual de cierre del día** (estilo Sunsama shutdown): repasar lo hecho, mover lo pendiente, cerrar. Es la pareja del wizard «Planifica tu día» de las 7:00.
4. **Replanificar el día cuando se rompe** (versión ligera): un botón que propone qué hacer con lo que queda de hoy, editable, con un clic para aplicar.

Más la base que las sostiene (duración visible y ajustes de jornada, §3.1) y los interruptores en Ajustes > Funciones (§3.8).

### 1.3 No objetivos (fuera de esta entrega)

- **Auto-planificación estilo Motion** (colocar tareas en huecos libres del calendario automáticamente, reoptimizar solo, bloques horarios arrastrables). Qué añadiría y por qué no entra: §12. La entrega actual deja los cimientos (duración, «cuándo», carga, sesiones) para que la fase 2 sea incremental.
- Editar o crear eventos de Google Calendar (los externos son de solo lectura, RF-25xx).
- Estimación de duración con IA (la fase 2 puede aprender de pomodoros/sesiones de foco reales; ahora hay estimación fija por defecto).
- Jornada distinta por día de la semana (una sola ventana diaria; mejora futura trivial sobre el mismo campo).
- Calendario corporativo por JSON (tiene su propia spec; convive como `provider` sobre `ExternalEvent`).
- Importar «cuándo/límite» desde TickTick (no hay importador).

---

## 2. Referencias de comportamiento

- **Sunsama — daily planning y shutdown ritual** (`https://www.sunsama.com/features/daily-planning-and-shutdown`): por la mañana se planifica el día con tiempo estimado por tarea y aviso de sobrecarga; por la noche, el shutdown repasa lo hecho, mueve lo pendiente a otro día y «cierra» la jornada. De ahí salen las funciones 2 y 3 de esta entrega.
- **Things 3 (Cultured Code)** (`https://culturedcode.com/things/features/`): una tarea tiene **cuándo** («When», el día que la harás) y opcionalmente **fecha límite** («Deadline»); Hoy muestra el cuándo, la fecha límite se ve como aviso; **Someday** aparca lo que no es para ahora; **This Evening** separa dentro de Hoy lo reservado a la noche. De ahí sale la función 1.
- **Motion / Akiflow**: auto-planificación. Solo inspira §12 (fase 2); en esta entrega, replanificar es un botón con propuesta editable (función 4 ligera).

Regla de la casa cuando haya duda: TickTick es la referencia de comportamiento general («TickTick es la referencia, es lo correcto»); en estas cuatro funciones, la referencia puntual es la indicada arriba.

---

## 3. Alcance funcional (RF)

### 3.1 Base: duración visible y ajustes de jornada

La duración ya existe en el modelo (`Task.durationMinutes`) y en el panel de detalle (`DateDraft`), pero falta exponerla del todo y dar los ajustes que la proyección necesita.

- **RF-2601** — Fila de tarea: si la tarea tiene duración, la fila de Hoy/listas la muestra junto a la hora (`09:00 · 45 m`, discreto, en el chip de fecha existente).
- **RF-2602** — Edición rápida de duración: en el selector de fecha del panel (`DatePopover`), presets `15 / 30 / 45 / 60 / 90 min` + valor personalizado (5–480). Ya existe el campo en `DateDraft`; completar la UI si falta.
- **RF-2603** — Parser de captura rápida (el compartido de web, Telegram, email y API): sintaxis `~45m`, `~1h30` o `~2h` al final del texto → `duration_minutes`. Se documenta donde se documentan `!high` y `#etiqueta`.
- **RF-2604** — Ajustes nuevos de usuario (columnas de `User`, expuestos en `GET/PATCH /api/v1/me` con la validación de `me.service.ts`, patrón `dailyTime`):
  - `work_day_start`, `work_day_end` (`HH:mm`, defecto `09:00` y `18:00`; **null en ambos = sin jornada → la proyección se desactiva**, RF-2646).
  - `default_task_duration_minutes` (entero 5–240, defecto `30`): lo que cuenta una tarea sin duración en la proyección.
  - `deadline_soon_days` (entero 1–14, defecto `2`): desde cuántos días antes se avisa de una fecha límite.
  - `evening_start` (`HH:mm`, defecto `18:00`): desde cuándo la sección «Esta noche» está activa.
- **RF-2605** — Ajustes > General: tarjeta nueva «Jornada y estimaciones» con los campos de RF-2604 y una línea de ayuda por campo. Textos en español.
- **RF-2606** — MCP: `create_task` y una herramienta nueva `update_task` (scope `tasks:write`) aceptan `due_date`, `start_date`, `is_all_day`, `duration_minutes`, `priority`, y (tras §3.2–3.4) `someday`, `evening_only`. `list_tasks` y `get_task` devuelven esos campos. Las descripciones (en inglés, convención actual) explican la diferencia cuándo/límite. La ampliación es aditiva: no rompe a los agentes existentes.

### 3.2 «Cuándo» vs fecha límite (estilo Things)

- **RF-2610** — Semántica (documentarla en `docs/` y en las descripciones MCP):
  - `startDate` = **cuándo**: el día (y hora opcional) en que planeo hacer la tarea.
  - `dueDate` = **fecha límite**: el día en que vence de verdad.
  - **Compatibilidad**: una tarea con solo `dueDate` (todo lo existente y la captura rápida actual) se comporta como hasta ahora: aparece en Hoy el día de su fecha. Internamente se interpreta como «cuándo implícito = fecha límite» y el día D muestra además el aviso de vencimiento (RF-2612).
  - Con las dos fechas: la tarea aparece desde su cuándo hasta su límite (si el cuándo es anterior); el día del límite lleva el aviso rojo.
  - Validación: `dueDate < startDate` → 422 `deadline_before_when`.
- **RF-2611** — Panel de detalle: dos campos separados, **Cuándo** y **Fecha límite** (este con icono de bandera y texto en rojo cuando proceda), cada uno con su `DatePopover`. El popover de fecha límite ofrece quitarla sin tocar el cuándo, y viceversa. Si solo hay una fecha, se muestra como hoy («Fecha»), para no confundir lo existente.
- **RF-2612** — Avisos de vencimiento: en Hoy y en filas de listas, una tarea con límite a `deadline_soon_days` o menos muestra chip ámbar `Vence en N días` / `Vence mañana`; el día D, chip rojo `¡Vence hoy!`. Pasado el límite sin completar: sigue en vencidas como hoy. Los avisos se calculan en cliente con los campos de la tarea + `GET /me` (no hace falta endpoint nuevo).
- **RF-2613** — Parser NLP (español): «el viernes» → cuándo (`start_date`); «**para** el viernes», «a más tardar el viernes», «fecha límite: viernes», «deadline viernes» → `due_date`. La captura rápida sin esas marcas sigue escribiendo `dueDate` (compatibilidad con el hábito actual del propietario y con Telegram; decisión en §11).
- **RF-2614** — API: ningún cambio de lectura (los campos ya viajan); solo la validación de RF-2610 y que `GET /tasks` incluya siempre `start_date`, `due_date`, `duration_minutes` en el payload de lista (verificar; si el listado ligero los omite, añadirlos).
- **RF-2615** — Subtareas: cuándo/límite son por tarea, como las fechas actuales; no se heredan.

### 3.3 «Algún día» (Someday)

- **RF-2620** — `Task.isSomeday` (bool, defecto false). Una tarea «Algún día»:
  - No aparece en Hoy, ni en Próximos 7 días, ni en vencidas, ni en el wizard de planificación, ni en la proyección de carga.
  - Sigue en su lista y en la búsqueda (con marca «Algún día»), y aparece como candidata en la revisión semanal (`GET /review/weekly`).
  - Si tiene fecha límite, no genera aviso de vencimiento mientras esté en Algún día.
- **RF-2621** — Lista inteligente «Algún día» en la barra lateral (icono 🌤️, tras las listas inteligentes de fecha): muestra todas las `isSomeday` activas. Clave `someday` en el módulo de smart lists y en MCP (`list_smart_lists` / `list_smart_list_tasks` la incluyen).
- **RF-2622** — Acciones rápidas: menú contextual de tarea → `Mover a Algún día` / `Quitar de Algún día` (con `UndoToast`); en el panel, junto a Cuándo. Al mover a Algún día se limpia el **cuándo** (`startDate = null`); la fecha límite se conserva (es un compromiso real). Al quitar de Algún día queda sin cuándo (vuelve a su lista/bandeja), salvo que el usuario elija día en la misma acción.
- **RF-2623** — Decisión `someday` nueva en el wizard de planificación, el cierre y replanificar (enum `PlanDecisionKind`, migración): al aplicar, pone `isSomeday = true` y limpia el cuándo (misma regla de RF-2622).
- **RF-2624** — Parser: «algún día» al final del texto → `someday = true` y sin fecha.
- **RF-2625** — MCP: `create_task`/`update_task` aceptan `someday`; `list_tasks` lo devuelve y admite filtro `someday: true|false` (defecto: excluye las de Algún día, igual que la UI).

### 3.4 «Esta noche» (This Evening)

- **RF-2630** — `Task.eveningOnly` (bool, defecto false): la tarea de hoy reservada para la noche. Solo tiene efecto visual y de carga cuando la tarea está en Hoy.
- **RF-2631** — Hoy: sección **«Esta noche»** al final de las secciones de tareas (antes de «Próximas fechas»). Antes de `evening_start` aparece colapsada/atenuada con la nota `A partir de las {{evening_start}}`; después, sección normal. Las tareas «Esta noche» **no cuentan** en el numerador de la proyección de carga (RF-2640: ocurren fuera de la jornada).
- **RF-2632** — Acciones: menú contextual → `Esta noche` (marca/desmarca); `DatePopover` con opción «Esta noche» (cuándo = hoy + `eveningOnly`); wizard de planificación: decisión `plan_day` con marca «noche» → al aplicar, `eveningOnly = true`.
- **RF-2633** — Parser: «esta noche» → cuándo hoy + `eveningOnly` (y hora si la dice: «esta noche a las 21:00»).
- **RF-2634** — Al mover la tarea a otro día, `eveningOnly` se conserva (es intención «por la noche») y se aplica el día que corresponda. Al completar una recurrente marcada como noche, la siguiente ocurrencia nace sin `eveningOnly` (la marca es de esta vez, no de la serie; anotar en el PR si se elige lo contrario).

### 3.5 Proyección de carga del día (estilo Sunsama)

- **RF-2640** — Función pura nueva en `packages/domain/src/planning/day-load.ts` (con tests de tabla, §8):

  ```ts
  dayLoad({
    date, timeZone,
    tasks: [{ id, durationMinutes, isAllDay, eveningOnly, status }],
    events: [{ id, startsAt, endsAt, isAllDay }],
    settings: { workDayStart, workDayEnd, defaultTaskDuration },
  }) → {
    taskMinutes, eventMinutes, availableMinutes,
    unestimatedCount, unestimatedTaskIds,
    ratio, status: 'ok' | 'tight' | 'overload',
  }
  ```

  Reglas: `availableMinutes = workDayEnd − workDayStart` (jornada null → `availableMinutes = null` y proyección desactivada). Eventos de todo el día cuentan 0; eventos con hora cuentan solo su **solape con la jornada**. Tareas: activas del día (RF-2641), cada una cuenta `durationMinutes ?? defaultTaskDuration`; las `eveningOnly` y las de Algún día no cuentan; las de todo el día sin duración también cuentan el defecto. `status`: `≤ 0,85` ok; `≤ 1,0` tight; `> 1,0` overload.
- **RF-2641** — Endpoint `GET /api/v1/planning/load?date=YYYY-MM-DD&time_zone=...` (scope `tasks:read`): tareas del día = activas con cuándo ≤ fecha ≤ límite (o límite null) **o** miembros del plan de esa fecha **o** límite = fecha; eventos = `ExternalEvent` visibles del día. Devuelve el desglose de RF-2640. Sin caché en BD (volumen: decenas de tareas/día, un usuario).
- **RF-2642** — Hoy, cabecera de la sección de plan: chip `3 h 30 min de 9 h · bien / justo / no cabe` (verde/ámbar/rojo). En `overload`, el chip enlaza a replanificar (RF-2671) con texto `No cabe: sobran 45 min`. Si hay tareas sin estimar, tooltip `N sin duración (cuentan 30 min)`.
- **RF-2643** — Wizard de planificación: cabecera con la carga resultante recalculada en vivo al decidir cada tarjeta; aviso ámbar al pasar de tight y rojo al pasar de 100 %.
- **RF-2644** — Digest diario de las 7:00 (`enqueueDigests`, `kind: 'daily_digest'`): una línea nueva al final del cuerpo: `Hoy: N tareas (~3 h 30 min) + 2 h de agenda, de 9 h de jornada.` Solo si la jornada está configurada; si no hay nada que contar, la línea se omite. No cambia el título ni el resto del digest.
- **RF-2645** — MCP `get_day_load` (scope `tasks:read`): params `date` (defecto: hoy civil del usuario), `time_zone` (defecto: la del usuario). Devuelve el desglose de RF-2641. Descripción en inglés dejando claro que sirve para el briefing matinal de agentes (Instinct lo usará en el resumen de las 7:00 por WhatsApp).
- **RF-2646** — Con jornada desactivada (ambos campos null): endpoint devuelve `availableMinutes: null` y `status: 'ok'`; la UI no muestra el chip; el digest no añade la línea. Es la forma de apagar la función sin toggle.

### 3.6 Ritual de cierre del día (estilo Sunsama shutdown)

Reutiliza la maquinaria del wizard (`PlanSession`, `PlanDecision`, `PlanOperation`, apply con `expected_revision` + `Idempotency-Key`). El flujo es el mismo: sesión → decisiones sin efecto → resumen → aplicar.

- **RF-2650** — `PlanSession.kind` nuevo (`plan` | `shutdown` | `replan`, defecto `plan`) y `PlanDecisionKind` ampliado con `someday` (RF-2623). Migración Prisma.
- **RF-2651** — Endpoints (mismo patrón y DTOs que `planning.controller.ts`):
  - `POST /api/v1/planning/shutdown/sessions` `{ local_date, time_zone }` → crea la sesión `kind=shutdown` y devuelve: `review.done_today` (tareas completadas hoy: título, lista, hora de completado; solo lectura, con acción «No estaba hecha» = reabrir) y `queue` (pendientes de hoy: miembros activos del plan + cuándo ≤ hoy ≤ límite + límite = hoy, activas, raíz).
  - `PUT/DELETE /api/v1/planning/shutdown/sessions/:id/decisions/:taskId` — decisiones: `done` (la terminé ahora), `plan_day` (`target_date`, defecto mañana), `later` (`target_date`), `someday`, `cancel`, `trash`, `skip` (se queda como está).
  - `POST /api/v1/planning/shutdown/sessions/:id/apply` `{ expected_revision }` + `Idempotency-Key` → aplica como el wizard (`PlanOperation` para idempotencia, 409 `revision_conflict` si la revisión no cuadra).
  - `local_date` debe ser el día civil actual del usuario **o el anterior** (cerrar ayer a la 1:00 es válido); otro valor → 422.
- **RF-2652** — Efectos al aplicar: `done` usa el mismo camino de completar de la app (con su manejo de series); `plan_day`/`later` → `startDate = target_date` y, si el target es mañana, alta en el plan de mañana (`PlanMember`, source `shutdown`); `someday` → RF-2622; `cancel`/`trash` como en el wizard. Si una tarea con límite ≤ target quedaría vencida, el preview la marca `over_deadline: true` (se permite, se avisa en el resumen antes de aplicar).
- **RF-2653** — Pantalla de cierre (`/cierre`, `ShutdownPage`, patrón de `PlanDayPage`, usable en móvil PWA): paso 1 `Lo que has hecho hoy` (lista colapsable + contador + minutos de foco del día si es trivial leerlos de `FocusSession`; si no, anotar pendiente); paso 2 `Lo que queda` con una tarjeta por tarea y botones `Hecha · Mañana · Elegir fecha · Algún día · Cancelar`; paso 3 resumen editable (`Vas a mover N a mañana, M a Algún día…`) → `Cerrar el día`. Tras aplicar: pantalla final `Día cerrado` con el resumen (snapshot en la sesión, state `applied`).
- **RF-2654** — Recordatorio de cierre: `User.shutdownReminderTime` (`HH:mm`, null = desactivado, defecto null). Scheduler: `enqueueShutdownDigests` clonando `enqueueDigests` (`kind: 'shutdown_digest'`, `dedupeKey: 'shutdown:{user}:{fireAt}'`, canal `both` + Telegram, misma política de quiet hours que el digest diario). Texto: `🌙 Cierra tu día: quedan N tareas de hoy` + enlace a `/cierre`. Si N = 0, el recordatorio no se encola (ese día ya está cerrado de facto).
- **RF-2655** — Entradas: botón `Cerrar el día` en la cabecera de la sección de plan de Hoy (badge con el nº de pendientes); desde el recordatorio (push/Telegram/email); sin entrada en la barra lateral (la función vive en Hoy).
- **RF-2656** — MCP (scope `tasks:write`, descripciones en inglés): `start_day_shutdown` (devuelve sesión + candidatos), `record_shutdown_decision`, `apply_day_shutdown` (`expected_revision`, `idempotency_key`). Pensado para que Instinct pueda guiar el cierre por WhatsApp/Telegram con confirmación del propietario.
- **RF-2657** — Eventos de dominio por outbox: `plan.shutdown_started`, `plan.shutdown_applied` (payload: contadores por decisión), disponibles para automatizaciones y delta sync.
- **RF-2658** — Reporte semanal honesto: línea `Cerraste el día N de 7 días; moviste M tareas en los cierres.` (lee sesiones `kind=shutdown` aplicadas de la semana).

### 3.7 Replanificar el día (versión ligera: un botón)

- **RF-2670** — Sesión `kind='replan'`: `POST /api/v1/planning/replan/sessions` `{ local_date, time_zone }` → candidatos = pendientes de hoy (mismo conjunto que la queue de RF-2651). Cada tarjeta trae **propuesta prellenada editable**: límite = hoy → se queda hoy; límite = mañana → `plan_day` mañana; resto → `plan_day` mañana (si mañana la carga proyectada también supera 100 %, propone el primer día laborable siguiente con hueco, máx. +7 días, usando RF-2640). La respuesta incluye la carga de hoy y de mañana **antes y después** de la propuesta.
- **RF-2671** — UI: botón `Replanificar el día` en la sección de plan de Hoy y en el chip de sobrecarga (RF-2642). Abre la sesión (misma pantalla de tarjetas): por tarea `Hoy · Mañana · Elegir fecha · Algún día · Cancelar`; cargas actualizadas en vivo; botones `Aplicar` (tras resumen) y `Aplicar propuesta tal cual` (un clic). Apply idéntico al del cierre.
- **RF-2672** — MCP `replan_day` (scope `tasks:write`): params `date` (defecto hoy), `auto_apply` (defecto false), `decisions` (opcional, override por tarea), `idempotency_key`. Devuelve la propuesta y, si `auto_apply`, el resultado aplicado. Así Instinct puede proponer por WhatsApp y aplicar solo tras el «sí» del propietario.
- **RF-2673** — Evento de dominio `plan.replan_applied` (payload: contadores).
- **RF-2674** — Nada automático: solo actúa al pulsar el botón o llamar a la herramienta. No reordena horas ni coloca bloques en el calendario (eso es §12).
- **Esfuerzo honesto**: con §3.6 hecho, esto es un PR pequeño (reutiliza sesión, decisiones, apply y pantalla de tarjetas; lo nuevo es la regla de propuesta y los dos botones). Por eso entra en esta entrega.

### 3.8 Interruptores en Ajustes > Funciones

- **RF-2680** — `User.featureFlags` (Json, defecto `{}`), expuesto en `GET/PATCH /me` (validación: solo claves conocidas). Claves de esta entrega, todas **activadas por defecto**: `when_deadline` (§3.2–3.4), `day_load` (§3.5), `day_closing` (§3.6), `day_replan` (§3.7).
- **RF-2681** — Ajustes > Funciones: si la sección de la auditoría de hoy (toggles de countdown, foco, Eisenhower…) ya está mergeada, añadir ahí estas cuatro filas (nombre + descripción corta + interruptor). Si aún no existe, este trabajo crea la sección con estas cuatro y deja el patrón listo para las demás.
- **RF-2682** — Efecto de apagar: se ocultan las entradas de UI (chip de carga, botones `Cerrar el día` / `Replanificar el día`, campos Cuándo/Límite avanzados, sección «Esta noche», lista «Algún día») y se desactiva el recordatorio de cierre programado. **La API y MCP siguen funcionando** (los agentes no se rompen por un toggle de UI); documentarlo en la sección.

### 3.9 Integraciones ligeras

- **RF-2690** — Eventos de dominio nuevos (patrón de `domain-events.ts`): `plan.shutdown_started`, `plan.shutdown_applied`, `plan.replan_applied`, `task.someday_set`, `task.someday_unset`. Todos por outbox.
- **RF-2691** — Digest diario (RF-2644) y recordatorio de cierre (RF-2654) según lo especificado; sin otros cambios en notificaciones.
- **RF-2692** — Reporte semanal: línea de cierres (RF-2658) y, si es trivial, media de carga de la semana (`ratio` medio por día con jornada configurada); si no, anotar como pendiente.

---

## 4. Modelo de datos (migraciones Prisma)

Dos migraciones sugeridas (o una si van en el mismo PR): `when_someday_evening` y `day_sessions_kind`.

```prisma
enum PlanSessionKind {
  plan
  shutdown
  replan
}

// PlanDecisionKind: añadir
//   someday

model Task {
  // …campos existentes (startDate, dueDate, durationMinutes ya existen)…
  isSomeday   Boolean @default(false) @map("is_someday")
  eveningOnly Boolean @default(false) @map("evening_only")

  @@index([ownerId, status, deletedAt, isSomeday], map: "tasks_owner_someday_idx")
}

model PlanSession {
  // …campos existentes…
  kind PlanSessionKind @default(plan)
}

model User {
  // …campos existentes…
  shutdownReminderTime String?  @map("shutdown_reminder_time")
  workDayStart         String?  @map("work_day_start")   // null = sin jornada
  workDayEnd           String?  @map("work_day_end")     // null = sin jornada
  defaultTaskDuration  Int      @default(30) @map("default_task_duration")
  deadlineSoonDays     Int      @default(2) @map("deadline_soon_days")
  eveningStart         String   @default("18:00") @map("evening_start")
  featureFlags         Json     @default("{}") @map("feature_flags")
}
```

Notas de implementación:

- Los valores por defecto de `User` se aplican en la migración a las filas existentes (jornada 09:00–18:00 activada por defecto; el recordatorio de cierre, desactivado hasta que el propietario elija hora).
- `PlanSession.kind` con defecto `plan` no requiere backfill.
- Nada de esto toca `ExternalEvent`, `CalendarSubscription` ni `Countdown`.

---

## 5. Arquitectura y puntos de extensión (mapa de archivos)

Nuevos:

- `packages/domain/src/planning/day-load.ts` + `day-load.spec.ts` (RF-2640).
- `apps/api/src/modules/planning/shutdown.controller.ts` y `replan.controller.ts` (o separación análoga; servicio compartido `day-closing.service.ts` si `planning.service.ts` crece — ya tiene ~670 líneas, recomendado extraer).
- `apps/web/src/features/closing/ShutdownPage.tsx` (+ css, patrón de `features/planning/`).
- `apps/web/e2e/day-closing.spec.ts`, `apps/web/e2e/day-load.spec.ts`.
- Sección/tarjeta «Jornada y estimaciones» en `apps/web/src/features/settings/` (RF-2605) y filas de Funciones (RF-2681).

A tocar:

- `apps/api/prisma/schema.prisma` + migraciones (§4).
- `apps/api/src/auth/me.dto.ts`, `me.service.ts` (campos RF-2604, RF-2654, RF-2680) y sus tests.
- `apps/api/src/modules/planning/planning.controller.ts` y `planning.service.ts` (kind de sesión, RF-2650).
- `apps/api/src/modules/tasks/` (validación RF-2610, filtros de Algún día en listados, acciones `someday`/`evening`).
- `apps/api/src/modules/review/review.controller.ts` (Algún día como candidatas, RF-2620).
- `apps/api/src/scheduler/scheduler.service.ts` (`enqueueShutdownDigests`, RF-2654; línea de carga en el digest, RF-2644).
- `apps/api/src/mcp/mcp.catalog.ts` + `mcp.service.ts` (RF-2606, RF-2625, RF-2645, RF-2656, RF-2672) y `mcp.catalog.spec.ts`.
- `apps/api/src/events/domain-events.ts` (RF-2690).
- `packages/domain/src/nlp/` (parser: RF-2603, RF-2613, RF-2624, RF-2633) — el parser compartido, no copias por canal.
- `apps/api/openapi.json` (regenerar) y `packages/sdk/` si se genera desde OpenAPI.
- `apps/web/src/features/today/` (chip de carga RF-2642, sección «Esta noche» RF-2631, botones RF-2655/RF-2671, chips de vencimiento RF-2612, duración en fila RF-2601).
- `apps/web/src/features/planning/PlanDayPage.tsx` (carga en vivo RF-2643, decisión `someday`, marca «noche»).
- `apps/web/src/features/tasks/TaskDetail.tsx`, `components/DatePopover.tsx` (Cuándo vs Fecha límite RF-2611, presets de duración RF-2602, opciones Algún día/Esta noche).
- `apps/web/src/app.tsx` (ruta `/cierre`), barra lateral (lista «Algún día», RF-2621), `i18n/es.ts` (+ `en.ts` si la clave es obligatoria).
- `docs/spec/especificacion-producto-v1.1.md`: resumen de estas cuatro funciones y enlace a este documento.

---

## 6. Detalles de diseño

### 6.1 Zona horaria y «hoy»

Todo lo de esta entrega trabaja en fecha civil del usuario (`settings.timezone`, defecto `Europe/Madrid`), misma convención que countdown y calendario: el servidor calcula con la zona del usuario; la web formatea en local. DST: un recordatorio de cierre a las 21:30 sale a las 21:30 locales reales también en semana de cambio de hora.

### 6.2 Ejemplos de payload

`GET /api/v1/planning/load?date=2026-10-20&time_zone=Europe/Madrid`:

```json
{
  "date": "2026-10-20",
  "task_minutes": 210,
  "event_minutes": 120,
  "available_minutes": 540,
  "unestimated_count": 3,
  "unestimated_task_ids": ["…", "…", "…"],
  "ratio": 0.61,
  "status": "ok"
}
```

`POST /api/v1/planning/shutdown/sessions` → 201 (fragmento):

```json
{
  "id": "sess-…",
  "kind": "shutdown",
  "revision": 1,
  "review": {
    "done_today": [{ "id": "…", "title": "Preparar la comida", "completed_at": "2026-10-20T13:40:00+02:00" }],
    "focus_minutes": 50
  },
  "queue": {
    "cards": [
      { "task_id": "…", "title": "Enviar el informe", "priority": "high", "deadline": "2026-10-21", "suggested": { "decision": "plan_day", "target_date": "2026-10-21" } }
    ]
  }
}
```

`POST …/apply` `{ "expected_revision": 1 }` con cabecera `Idempotency-Key` → 200 `{ "applied": true, "effects": [ … ], "closed": true }`.

### 6.3 Carga: qué cuenta y qué no (resumen para UI y agentes)

Cuentan: tareas activas del día (menos «Esta noche» y «Algún día») con su duración o la estimación por defecto + solape de los eventos externos con la jornada. No cuentan: eventos de todo el día, tareas completadas, subtareas por separado (cuenta la raíz), tareas de Algún día. La UI y las descripciones MCP repiten esta regla en una línea para que el número nunca sorprenda.

### 6.4 Seguridad y privacidad

- Todos los endpoints nuevos filtran por `ownerId` (patrón actual) y llevan scopes (`tasks:read`/`tasks:write`); no hacen falta scopes nuevos. Decidir y documentar: si se prefiere granularidad, `planning:read`/`planning:write` nuevos; esta spec se queda con los de tareas por simplicidad.
- Las sesiones guardan snapshots de títulos de tareas: son datos del propio usuario en su base de datos, mismo criterio que el wizard actual.
- Nada de esta entrega llama a servicios externos (la proyección lee `ExternalEvent` ya sincronizado; no habla con Google).

---

## 7. Casos límite (obligatorios en tests)

1. Tarea con solo `dueDate` (todo lo existente): se comporta como hoy y muestra «¡Vence hoy!» el día D; ninguna tarea migrada cambia de sitio al desplegar.
2. `dueDate < startDate` → 422 `deadline_before_when`, en create y en update.
3. Mover a «Algún día» una tarea con límite: desaparecen los avisos de vencimiento; al sacarla de Algún día sin fecha, no aparece en vencidas aunque el límite esté pasado hasta elegir cuándo (decisión: el límite vuelve a avisar al salir; documentar lo elegido).
4. «Esta noche» antes de las 18:00: sección atenuada y fuera de la carga; a las 18:00 (recargando o al cambiar de día civil) pasa a normal.
5. Proyección con jornada null: todo desactivado sin errores (RF-2646).
6. Proyección con evento externo que empieza antes de la jornada y acaba dentro: cuenta solo el solape.
7. Cierre a la 1:00 con `local_date` de ayer: permitido (RF-2651); con cualquier otra fecha: 422.
8. Doble `apply` con el mismo `Idempotency-Key` (reintento de red en la PWA): una sola aplicación, misma respuesta.
9. `apply` con `expected_revision` vieja tras decidir otra tarjeta en otro dispositivo: 409 `revision_conflict`.
10. Cierre con 0 pendientes: pantalla final directa («Día cerrado, nada que mover»); el recordatorio de cierre de ese día no se encola (RF-2654).
11. Replanificar con límite = hoy: la propuesta la deja hoy y explica por qué en la tarjeta.
12. Replanificar cuando mañana tampoco cabe: propone el siguiente día con hueco (máx. +7) y lo dice.
13. Parser: «Para el viernes, ~45m, enviar informe, fecha límite: lunes» — duración 45, cuándo viernes, límite lunes. Y «sacar al perro esta noche» — cuándo hoy + noche.
14. Recurrente completada desde el cierre (`done`): la serie avanza igual que al completarla en Hoy (sin duplicar ocurrencias).
15. Cambio de zona horaria del usuario: jornada, «Esta noche» y recordatorios se recalculan solos (todo deriva de hora civil + tz en cada lectura; no cachear minutos en BD).

---

## 8. Tests

- **Dominio** (`packages/domain`): tabla de casos de `dayLoad` (todos los de §7 aplicables: solape de eventos, todo el día, noche, Algún día, jornada null, umbrales 0,85/1,0); parser NLP con los casos 3, 4 y 13; regla de propuesta de replanificar (casos 11 y 12).
- **API integración** (`apps/api/test/`): endpoints de carga, shutdown y replan (ciclo completo sesión → decisiones → apply, idempotencia, 409 de revisión, 422 de fecha, validación `deadline_before_when`, filtros de Algún día en listados y smart list).
- **Scheduler**: reloj falso — digest con línea de carga solo si hay jornada; recordatorio de cierre a su hora, sin encolar si 0 pendientes, dedupe.
- **MCP**: catálogo filtrado por scopes + round-trip de `create_task`/`update_task` con los campos nuevos, `get_day_load`, ciclo shutdown por MCP.
- **E2E Playwright**: Cuándo vs Fecha límite en el panel; mover a Algún día y verlo en la lista inteligente; sección «Esta noche»; chip de carga en Hoy; cierre completo con 2 pendientes; replanificar con «Aplicar propuesta tal cual».
- **Regresión**: `pnpm test`, integration y Playwright en verde antes de cada PR.

---

## 9. Criterios de aceptación

- [ ] En el panel de una tarea puedo poner **cuándo** el jueves y **fecha límite** el lunes; la tarea aparece en Hoy el jueves con aviso `Vence en 4 días`, y el lunes con `¡Vence hoy!`.
- [ ] Puedo mover una tarea a **Algún día** desde el menú contextual; desaparece de Hoy y aparece en la lista inteligente «Algún día»; la revisión semanal la propone.
- [ ] Marco una tarea «Esta noche»; a las 17:00 está atenuada en su sección y no cuenta en la carga; a las 18:00 se ve normal.
- [ ] Hoy muestra el chip `X h Y min de 9 h`; al añadir tareas hasta pasar de la jornada el chip pasa a rojo `No cabe` y ofrece replanificar.
- [ ] El digest de las 7:00 incluye la línea de carga del día (con jornada configurada).
- [ ] A la hora de cierre configurada llega el recordatorio (Telegram/push) y al abrirlo repaso lo hecho, muevo 2 pendientes a mañana y 1 a Algún día, aplico, y veo `Día cerrado` con el resumen.
- [ ] «Replanificar el día» propone destinos razonables, muestra la carga antes/después, y «Aplicar propuesta tal cual» funciona en un clic; repetir con el mismo idempotency-key no duplica efectos.
- [ ] Los cuatro toggles de Ajustes > Funciones ocultan/muestran sus funciones sin romper API ni MCP.
- [ ] Por MCP (token con `tasks:read`/`tasks:write`): crear tarea con cuándo+límite+duración, `get_day_load`, ciclo de cierre completo y `replan_day` con `auto_apply=false`.
- [ ] Suite completa en verde; OpenAPI y SDK regenerados y commiteados.

---

## 10. Plan de implementación sugerido (PRs pequeños, en este orden)

1. **PR 1 — Ajustes y duración end-to-end**: campos de `User` (RF-2604, RF-2654, RF-2680) + `/me`, tarjeta «Jornada y estimaciones», duración en fila y presets (RF-2601/2602), parser `~45m` (RF-2603), MCP `create_task`/`update_task` ampliados (RF-2606 parcial), mecanismo `featureFlags` + sección Funciones (RF-2680/2681). Sin cambios de comportamiento visibles si los toggles salen apagados… no: salen activados, pero esta PR solo añade UI de duración.
2. **PR 2 — Cuándo vs fecha límite + Algún día + Esta noche**: migración de `Task`, validación 422, panel y popovers, chips de vencimiento, smart list «Algún día», sección «Esta noche», parser (RF-2613/2624/2633), decisión `someday` en el enum, MCP (resto de RF-2606, RF-2625). La parte más delicada: revisar que ninguna vista actual asume `dueDate` = cuándo (Hoy, próximos 7 días, filtros, wizard).
3. **PR 3 — Proyección de carga**: `day-load.ts` + endpoint + chip en Hoy + carga en el wizard + línea en el digest + `get_day_load` (RF-2640–2646). Aditivo puro.
4. **PR 4 — Ritual de cierre**: `PlanSession.kind`, endpoints, pantalla `/cierre`, recordatorio programado, MCP de cierre, eventos, línea del reporte semanal (RF-2650–2658).
5. **PR 5 — Replanificar**: sesión `kind='replan'`, regla de propuesta, botones en Hoy y en el chip, `replan_day` (RF-2670–2674). Pequeño gracias a PR 3 y PR 4.
6. **PR 6 — Docs y cierre**: `especificacion-producto-v1.1.md` actualizada, nota de fase 2 (§12) enlazada, limpieza.

Cada PR desplegable de forma independiente y tras el cual la app sigue coherente.

---

## 11. Decisiones tomadas (no preguntar)

- **Compatibilidad primero**: la captura rápida sin marcas sigue escribiendo `dueDate` y comportándose igual que hoy. «Cuándo» explícito es opt-in (panel, parser «el viernes» vs «para el viernes», MCP).
- **Reutilizar `startDate` como cuándo** en vez de crear un campo nuevo: ya existe, ya viaja por la API y ya lo edita el panel.
- **Algún día y Esta noche como flags de tarea**, no como listas ocultas ni fechas ficticias (la fecha lejana tipo 9999 queda prohibida).
- **La proyección no se cachea en BD**: se calcula al leer (volumen pequeño, siempre fresco).
- **Cierre y replanificar reutilizan la maquinaria de sesiones del wizard** (mismo patrón de decisiones sin efecto + apply idempotente), no un flujo nuevo distinto.
- **Los toggles apagan UI y recordatorios, no la API/MCP**: los agentes no se rompen por un interruptor visual.
- **Textos de UI en español; herramientas MCP documentadas en inglés** (convención actual).
- **Recordatorio de cierre desactivado por defecto** (hora null): el propietario elige su hora en Ajustes.

---

## 12. Hoja de ruta — fase 2: auto-planificación estilo Motion (NO construir ahora)

El propietario vio la «magia» de Motion y le gustó. Esta sección deja el boceto para cuando toque, y explica por qué no entra en esta entrega: es la versión pesada de la función 5, descartada de momento por complejidad.

**Qué añadiría sobre los cimientos de esta entrega** (duración RF-2601, cuándo RF-2610, carga RF-2640, eventos externos RF-25xx, sesiones RF-2650):

1. **Entradas**: huecos libres = jornada − eventos externos − bloques ya colocados; tareas candidatas = cuándo ≤ hoy, activas, con duración (estimada si falta).
2. **Motor de colocación**: asignar cada tarea a un bloque horario concreto (greedy por prioridad y fecha límite; trocear tareas largas en bloques de, p. ej., 25/50 min con descansos); guardar el resultado como `PlanBlock` por día (modelo nuevo) y pintarlo en la vista Calendario.
3. **Estado «no cabe»**: cuando las candidatas superan los huecos, propone qué se cae (a mañana, a Algún día) en vez de colapsar.
4. **Reoptimización**: ante un evento nuevo o una tarea que se alarga, recolocar solo los bloques afectados respetando **bloqueos** (bloques fijados por el usuario).
5. **ETA del día**: hora estimada de fin («terminas a las 17:40») visible en Hoy.
6. **Estimación aprendida**: ajustar duraciones con el histórico real de `FocusSession`/pomodoros por tipo de tarea.

**Por qué no ahora**: necesita un planificador con casos límite difíciles (huecos fragmentados, tareas sin duración fiable, eventos que se mueven, DST, troceado) y una UI de línea de tiempo que hoy no existe; mal hecha, la magia se convierte en ruido que el usuario apaga. La versión ligera de §3.7 resuelve el 80 % del dolor (el día se rompe → un clic) con el 20 % del riesgo.

**Camino**: PRs de esta entrega → vista Calendario con rejilla horaria (pendiente de la auditoría de hoy) → prototipo de colocación de solo lectura (propone bloques sin aplicarlos) → aplicar bloques con deshacer → reoptimización y bloqueos.
