# Spec: Recurrencias en el MCP de tick-tack-done (v1.0)

**Fecha:** 2026-10-20 · **Destinatario:** agente de Cursor · **Repo:** `povedica/tick-tack-done` (commit verificado `8b1ad1f`, igual que el despliegue en vivo)
**Motivación:** ChatGPT conectado al MCP no puede crear tareas recurrentes. No es un límite de ChatGPT: el servidor MCP no expone la recurrencia. Esta spec lo corrige.

---

## 1. Estado actual (verificado en código y en vivo)

Verificado leyendo el repo en `8b1ad1f` y llamando a `POST https://todo.reflexionia.com/api/v1/mcp` con `tools/list` (token de agente, 21 scopes): devuelve **33 tools**; el catálogo `MCP_TOOLS` tiene 40 (las 7 de countdowns quedan ocultas porque el token no tiene `countdowns:*`; es el comportamiento correcto de RF-2001).

### 1.1 Qué tiene hoy el MCP

- `create_task` (`apps/api/src/mcp/mcp.catalog.ts`): solo acepta `title, project_id, due_date, start_date, is_all_day, duration_minutes, priority, someday, evening_only`. **No acepta `repeat_rule` ni `repeat_from`.**
- `update_task`: mismos campos + `id`. Tampoco acepta recurrencia.
- `get_task`: devuelve el `TaskDto` completo, que **sí incluye** `repeat_rule`, `repeat_from` y `series_id` (`apps/api/src/modules/tasks/tasks.dto.ts` ~L562). O sea: leer la recurrencia por MCP ya funciona; crearla y editarla, no.
- `complete_task`: "Mark a task complete. Does not materialize the next occurrence." La siguiente ocurrencia la crea el scheduler (`apps/api/src/scheduler/scheduler.service.ts`, `TICK_MS = 60_000`, `advanceCompleted`), con hasta ~60 s de retraso.
- Todos los schemas usan `additionalProperties: false` (helper `objectSchema`), así que un cliente MCP que intente pasar `repeat_rule` lo rechaza o lo descarta antes de enviar.
- Ninguna descripción de tool menciona la recurrencia: el modelo ni siquiera sabe que la capacidad existe.

### 1.2 Lo que la API REST ya soporta (y el MCP no expone)

- `TaskCreateDto` / `TaskUpdateDto` ya aceptan `repeat_rule` (string, máx 500) y `repeat_from` (`due_date` | `completion_date`) — `tasks.dto.ts` L123-128 y L233-238.
- `TasksService.canonicalRule` valida y ancla la regla: `DTSTART` sale de la `due_date` en la zona horaria de la tarea; errores `missing_anchor` → _"a repeating task needs a due_date"_ e `invalid_rule` → _"repeat_rule must be an RRULE"_.
- `GET /api/v1/tasks/{id}/occurrences?from&to` — ocurrencias teóricas sin persistir (RF-704).
- `POST /api/v1/tasks/{id}/occurrences/detach` — desvincular una ocurrencia con `EXDATE` (RF-705).
- `packages/domain/src/recurrence/rule.ts` ya incluye **todo lo necesario**:
  - `buildRepeatRule(RepeatDraft)` — construye el RRULE desde campos estructurados (`freq, interval, weekdays, monthDay, monthWeek{setpos,weekday}, until, count`). Es la función que usa la web (`apps/web/src/features/repeat/RepeatPage.tsx`).
  - `describeRepeatRule(rule)` — etiqueta en español ("Cada día laborable", "El último viernes de cada mes"…). RF-702.
  - `parseRepeatRule`, `canonicalizeRepeatRule`, `excludeOccurrence`.
  - `packages/domain/src/recurrence/expand.ts`: `firstAfter`, `advanceFromCompletion`, `occurrencesInRange`.

**Conclusión del diagnóstico:** el dominio y la REST ya hacen el 90 %. El trabajo es casi todo en `apps/api/src/mcp/` (catálogo + service) más tests.

---

## 2. Cambios (RF nuevos: asignar RF-2006 en adelante)

### RF-2006 — Parámetro estructurado `recurrence` en `create_task` y `update_task`

Añadir a ambos schemas una propiedad `recurrence` (objeto) y `repeat_from` (enum). El servidor la convierte a RRULE con `buildRepeatRule` y la persiste llamando al mismo `TasksService.create/update` de siempre (que aplica `canonicalRule`): **nada de lógica nueva de recurrencia en la capa MCP**.

```jsonc
"recurrence": {
  "type": "object",
  "properties": {
    "freq":      { "type": "string", "enum": ["daily", "weekly", "monthly", "yearly"] },
    "interval":  { "type": "integer", "minimum": 1, "maximum": 999 },
    "weekdays":  { "type": "array", "items": { "type": "string", "enum": ["MO","TU","WE","TH","FR","SA","SU"] },
                   "description": "Solo con freq=weekly." },
    "month_day": { "type": "integer", "minimum": 1, "maximum": 31,
                   "description": "Solo con freq=monthly/yearly: el día del mes (19 = 'cada día 19')." },
    "month_week": {
      "type": "object",
      "properties": {
        "setpos":  { "type": "integer", "enum": [1, 2, 3, 4, -1], "description": "-1 = último." },
        "weekday": { "type": "string", "enum": ["MO","TU","WE","TH","FR","SA","SU"] }
      },
      "required": ["setpos", "weekday"],
      "description": "Solo con freq=monthly: 'último viernes del mes' = {setpos:-1, weekday:'FR'}."
    },
    "until": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$", "description": "Fin de la serie (fecha civil, zona de la tarea)." },
    "count": { "type": "integer", "minimum": 1, "description": "Fin tras N ocurrencias." }
  },
  "required": ["freq"],
  "additionalProperties": false
},
"repeat_from": {
  "type": "string", "enum": ["due_date", "completion_date"],
  "description": "due_date (default): la siguiente sale de la regla desde el vencimiento. completion_date: desde cuándo la completaste (hábitos tipo 'regar cada 3 días')."
}
```

Reglas de combinación (validar y rechazar con error claro, no ignorar):

1. `recurrence` exige `due_date` en la misma llamada (o que la tarea ya la tenga, en update). Si no → error `missing_anchor`: _"una tarea recurrente necesita due_date"_.
2. `weekdays` solo con `weekly`; `month_day`/`month_week` solo con `monthly`/`yearly`; `month_day` y `month_week` son mutuamente excluyentes.
3. `month_week` y `weekdays` se mapean a `RepeatDraft.monthWeek` / `RepeatDraft.weekdays` tal cual; `buildRepeatRule` ya valida intervalo (1-999), `monthDay` (1-31) y formato de `until`.
4. **"Último día del mes":** el parser acepta `BYMONTHDAY=-1..-31` pero `buildRepeatRule` solo admite 1-31. Ampliar `RepeatDraft.monthDay` a `-31..-1` (cambio de dos líneas en el dominio) y exponerlo en `month_day` del schema; si no se hace, documentar que "el último día del mes" solo se puede crear con `repeat_rule` cruda (`BYMONTHDAY=-1`). Ojo al renderizar la etiqueta: `describeRepeatRule` hoy imprime "El día -1 de cada mes" para `BYMONTHDAY=-1` (bug de texto tratado en la auditoría UI v2; corregir a "El último día de cada mes" / "N días antes de fin de mes" en la misma pasada).

5. Quitar la recurrencia: `recurrence: null` (o `repeat_rule: null`) en `update_task` → la serie se cierra (`seriesId = null`, `recurrenceOpen = false`, comportamiento ya existente en el service).

### RF-2007 — Modo avanzado: `repeat_rule` cruda

Añadir `repeat_rule` (string) como escape hatch en `create_task`/`update_task`, passthrough directo al service (que canonicaliza). Si llegan `recurrence` y `repeat_rule` a la vez → error `validation_failed: use either recurrence or repeat_rule`. Documentar que la forma persistida es multilínea `DTSTART;TZID=…` + `RRULE:…` (+ `EXDATE`).

### RF-2008 — Respuestas con etiqueta humana

En las respuestas de `create_task`, `update_task`, `get_task` y `list_tasks`, cuando la tarea tenga `repeat_rule`, añadir:

- `repeat_label`: `describeRepeatRule(repeat_rule)` ("Cada semana los lunes y jueves").
- `next_occurrence`: primera ocurrencia teórica ≥ ahora (`firstAfter`, zona de la tarea). Puede ser `null` si la serie terminó (`COUNT`/`UNTIL` agotados).

Implementación: post-procesar el `TaskDto` en `mcp.service.ts` (no tocar el DTO compartido).

### RF-2009 — Tool `get_task_occurrences`

```
name: get_task_occurrences
scopes: tasks:read
params: { id (uuid, requerido), from (date-time), to (date-time) }
```

Envuelve `GET /tasks/{id}/occurrences?from&to` (RF-704). Descripción: _"List the theoretical occurrences of a repeating task in a range. Nothing is stored: only the current occurrence exists as a row."_

### RF-2010 — Tool `detach_occurrence`

```
name: detach_occurrence
scopes: tasks:write
params: { id (uuid), due_date (date-time, la ocurrencia a desvincular), title (string, opcional) }
```

Envuelve `POST /tasks/{id}/occurrences/detach` (RF-705). Descripción: _"Edit or skip ONE occurrence without breaking the series: it is excluded with an EXDATE and becomes (or stops being) its own task."_ Restricción heredada: nunca regenerar el RRULE persistido ni quitar `INTERVAL=1` al añadir el `EXDATE` (regla de la spec de bugs de importación).

### RF-2011 — `complete_task` consciente de la recurrencia

Hoy completar una recurrente vencida crea (hasta 60 s después) la siguiente ocurrencia **un solo período después de su fecha vencida** (RF-706, decisión de diseño), que nace ya vencida. Completar "Pagar asistenta" (31 may) genera la del 30 jun, también vencida: el usuario la completa "una y otra vez" sin llegar a hoy. Dos cambios:

1. **Parámetro `advance`:** `"one_period"` (default, comportamiento actual) | `"next_future"`. Con `next_future`, la siguiente ocurrencia se calcula con `firstAfter(rule, tz, ahora)`: la primera fecha futura, saltando las perdidas. Idealmente esto se decide en el servicio de completado para que la web pueda usarlo igual; como mínimo, vía MCP.
2. **Materialización síncrona opcional:** parámetro `materialize_next` (boolean, default false por compatibilidad). Si true, el propio `complete_task` crea la siguiente ocurrencia en la misma transacción (misma lógica que `advanceCompleted`, extraída a un método compartido) en vez de esperar al tick de 60 s del scheduler. El scheduler debe seguir siendo idempotente: si la serie ya tiene ocurrencia activa, no hace nada (ya lo comprueba).

Respuesta de `complete_task` sobre una recurrente: incluir `series: { materialized: bool, next_due_date, eta_seconds }` — si no se materializó síncronamente, `eta_seconds: 60` para que el agente lo explique ("la siguiente aparece en menos de un minuto").

### RF-2012 — Descripciones de tools pensadas para LLMs

Reescribir las descripciones de `create_task`, `update_task` y `complete_task` para que un agente (ChatGPT, Cursor, Instinct) acierte a la primera. Modelo a seguir (inglés, como las actuales, con ejemplos en español entrecomillados):

```
create_task: "Create a task. … To make it REPEAT, pass `recurrence` (structured) —
the task needs a due_date, which anchors the series. Examples: 'cada día' =
{freq:'daily'}; 'cada lunes y jueves' = {freq:'weekly', weekdays:['MO','TH']};
'cada 19 de mes' = {freq:'monthly', month_day:19}; 'el último viernes del mes' =
{freq:'monthly', month_week:{setpos:-1, weekday:'FR'}}; 'cada día laborable' =
{freq:'weekly', weekdays:['MO','TU','WE','TH','FR']}. Default interval is 1;
'cada 3 días' = {freq:'daily', interval:3}. End with until (date) or count (N times).
repeat_from:'completion_date' repeats from when it was completed ('regar cada 3 días
desde que lo hice'). Advanced: pass a raw RRULE string as repeat_rule instead.
One occurrence exists at a time; the next one appears after completing the current
(see complete_task)."
```

```
complete_task: "Mark a task complete. On a repeating task the next occurrence is
created by a scheduler within ~60 s unless materialize_next=true. advance controls
the next date: 'one_period' (default, one period after the current due date — an
overdue task may repeat in the past) or 'next_future' (first future occurrence;
skipped occurrences are gone for good). Use get_task_occurrences to preview."
```

Y en `update_task`: añadir que `recurrence: null` quita la repetición y que cambiar la regla **no** regenera ocurrencias pasadas ni el `series_id` salvo quitarla.

### RF-2013 — Errores claros

Mapear los fallos del dominio a mensajes accionables (el MCP ya envuelve `DomainException` como `toolError(code)`; añadir el mensaje):

| Situación                             | Código              | Mensaje                                                     |
| ------------------------------------- | ------------------- | ----------------------------------------------------------- |
| `recurrence` sin `due_date`           | `missing_anchor`    | "a repeating task needs a due_date"                         |
| Regla mal formada (raw)               | `invalid_rule`      | "repeat_rule must be an RRULE" + qué línea falló si se sabe |
| `weekdays` con `freq != weekly`, etc. | `validation_failed` | "weekdays only applies to weekly recurrence"                |
| `recurrence` y `repeat_rule` a la vez | `validation_failed` | "use either recurrence or repeat_rule, not both"            |
| Zona horaria no IANA                  | `invalid_zone`      | "time_zone must be an IANA name like Europe/Madrid"         |

### RF-2014 — Scopes y seguridad

- Sin scopes nuevos: `tasks:read` / `tasks:write` bastan (mismo principio RF-2001: el MCP nunca tiene más privilegios que el token). Las tools nuevas (`get_task_occurrences`, `detach_occurrence`) usan esos mismos scopes.
- Mantener `additionalProperties: false` en todos los schemas nuevos.
- Validar **antes** de llamar al servicio; nunca construir RRULE concatenando texto sin pasar por `buildRepeatRule`/`parseRepeatRule`.
- Respetar la regla de oro de EXDATE: al desvincular, añadir el `EXDATE` al texto original persistido; no regenerar el RRULE (evita pisar ediciones manuales).
- Los cambios quedan en el log de auditoría de eventos (`EventRecorder`) como el resto de mutaciones MCP.

---

## 3. Otros huecos del MCP que también bloquean a ChatGPT

Detectados comparando catálogo MCP vs API REST. No van en esta entrega salvo el primero si es trivial; listarlos como backlog priorizado:

1. **No hay forma de borrar/papelera por MCP.** REST tiene `GET /tasks/trash`, `DELETE /tasks/trash/{id}`, `POST /tasks/trash/{id}/restore`, `DELETE /tasks/trash`. Falta `trash_task` / `restore_task` (scope `tasks:trash` ya existe). Sin esto ChatGPT no puede "borra esta tarea".
2. **`create_task`/`update_task` no aceptan `tag_ids`, `content` (notas), `parent_id` (subtareas), `column_id` (kanban) ni `kind: 'note'`** — todos soportados por la REST. Sin `tag_ids` no se puede etiquetar al crear.
3. **Sin tools de recordatorios** pese a que existe el scope `reminders:write` y REST tiene `GET/POST/DELETE /tasks/{id}/reminders` + snooze. ChatGPT no puede "recuérdamelo 10 min antes".
4. **Countdowns invisibles con el token actual** (correcto por scopes, pero conviene saberlo: quien conecte ChatGPT debe dar `countdowns:read/write` en el PAT/OAuth si los quiere).
5. **Sin `update`/`delete` de proyectos, etiquetas, hábitos ni filtros** (solo list/create).

---

## 4. Tests

- **`mcp.catalog.spec.ts`** (ya existe el patrón): las tools nuevas aparecen con `tasks:read`/`tasks:write`; los schemas nuevos llevan `additionalProperties: false`; `visibleTools` las oculta sin scopes.
- **Unit del mapeo `recurrence` → `buildRepeatRule`**: cada ejemplo de las descripciones (diaria, L+X, día 19, último viernes, laborables, intervalo 3, until, count, completion_date) produce el RRULE esperado.
- **`mcp.service.spec.ts`**: `create_task` con `recurrence` llega a `TasksService.create` con el `repeat_rule` construido y el `repeat_from`; `missing_anchor` y combinaciones inválidas devuelven el mensaje exacto; `recurrence: null` cierra la serie.
- **Integración (apps/api)**: crear recurrente vía MCP → `get_task` devuelve `repeat_rule`, `repeat_label`, `next_occurrence`; `get_task_occurrences` lista fechas; `detach_occurrence` añade EXDATE sin tocar el resto del texto; `complete_task` con `advance:'next_future'` + `materialize_next:true` deja la siguiente ocurrencia activa en fecha futura en la misma llamada; el scheduler no duplica (idempotente).
- **E2E manual de aceptación**: conectar ChatGPT, pedirle en lenguaje natural "crea una tarea que se repita el día 19 de cada mes" y "recuérdala cada lunes" y comprobar que salen bien a la primera.

## 5. Criterios de aceptación

1. ChatGPT (u otro cliente MCP) puede crear, leer, editar y quitar recurrencias usando solo las tools del MCP, sin tocar la REST.
2. Las descripciones bastan para que el cliente elija bien los parámetros sin documentación externa (probar con los 6 ejemplos de RF-2012).
3. `complete_task` puede dejar la siguiente ocurrencia materializada en la misma llamada y en fecha futura (`advance: 'next_future'`).
4. `get_task`/`list_tasks` muestran `repeat_label` en español y `next_occurrence`.
5. Ningún comportamiento existente cambia por defecto (`advance` default `one_period`, `materialize_next` default false, scheduler intacto e idempotente). Suite `pnpm test` + integración + Playwright en verde.
6. Actualizar `docs/spec/especificacion-producto-v1.1.md` (sección 9.20, RF-2006..RF-2014) y el README del MCP si existe.

## 6. Referencias de código

| Pieza                                | Archivo                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Catálogo de tools                    | `apps/api/src/mcp/mcp.catalog.ts`                                                                                               |
| Dispatch/validación MCP              | `apps/api/src/mcp/mcp.service.ts`                                                                                               |
| DTO con `repeat_rule`/`repeat_from`  | `apps/api/src/modules/tasks/tasks.dto.ts` (L123, L233, L562)                                                                    |
| Canonicalización y ancla DTSTART     | `apps/api/src/modules/tasks/tasks.service.ts` (`canonicalRule`, ~L1508 create / ~L356 update)                                   |
| Builder/etiqueta/parser RRULE        | `packages/domain/src/recurrence/rule.ts` (`buildRepeatRule`, `describeRepeatRule`, `parseRepeatRule`, `canonicalizeRepeatRule`) |
| Expansión de ocurrencias             | `packages/domain/src/recurrence/expand.ts` (`firstAfter`, `advanceFromCompletion`, `occurrencesInRange`)                        |
| Scheduler que materializa (60 s)     | `apps/api/src/scheduler/scheduler.service.ts` (`TICK_MS`, `advanceCompleted`)                                                   |
| Endpoints REST a envolver            | `apps/api/src/modules/tasks/tasks.controller.ts` (`:id/occurrences`, `:id/occurrences/detach`)                                  |
| Spec producto (RF-701..706, RF-2001) | `docs/spec/especificacion-producto-v1.1.md`                                                                                     |
