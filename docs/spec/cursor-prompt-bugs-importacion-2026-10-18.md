# Prompt para Cursor: tres bugs de la API vistos al importar

Eres el agente de este repo (`tick-tack-done` / `https://todo.reflexionia.com`). Corrige los tres fallos de abajo. No reimportes, no borres ni reescribas las tareas que ya están en producción, y no abras un rediseño de recurrencia. Un solo PR, rama `fix/import-roundtrip` desde `main`.

Al terminar: `pnpm lint`, `pnpm typecheck`, `pnpm test`. Añade tests de dominio y un e2e de `POST /api/v1/tasks` + `GET /api/v1/tasks/:id` por cada bug. Si cambia el contrato, regenera OpenAPI (`pnpm --filter api openapi:generate`) y enmienda la spec citada, en el mismo PR.

## De dónde salen

El 18/10/2026 se importaron los datos propios del usuario desde su gestor anterior (solo lectura) a este API. Listas 22/22 y etiquetas 56/56. Tareas abiertas 93 de 94. Completadas 210 de 222. El resto, y varias tareas que sí se crearon pero no quedaron iguales, está en estas tres causas. Este prompt se basta solo: los cuerpos de abajo son los que se enviaron.

## Bug 1 — el título no se guarda tal cual

Hoy `normalizeTaskTitle` en `packages/domain/src/tasks/subtask.ts` hace `trim()` y rechaza la cadena vacía. `tasks.service.ts` lo usa al crear y al actualizar. El test de dominio exige justo eso (`packages/domain/src/tasks/tasks.spec.ts`: `'  comprar  '` pasa a `'comprar'`, espacios solos dan `ok: false`).

El formato de origen conserva espacios y permite título vacío. En el import:

- `POST /api/v1/tasks` con `"title": ""`, `priority: "none"`, `time_zone: "Europe/Madrid"`, un `parent_id` y un `tag_ids` respondió **400** `validation_failed`: `title must be longer than or equal to 1 characters`. id de origen `69f058c30678114e258226cb`. Es una subtarea de «Rutina casa: repaso diario de pendientes…».
- Títulos con espacio al principio o al final se devolvieron recortados en el GET. Ejemplos reales del 200:
  - enviado `" lista de compra y compra Online #casa #personal #plan #30min"` (espacio inicial) → guardado sin ese espacio
  - enviado `"Mi momento: planificacion y orden personal "` → guardado sin el espacio final
  - enviado `"pedir  llave del garaje a Pilar para entrar por calle Dalia #capturada "` → sin el espacio final
  - enviado `"Recordar a Álvaro el CV de VASS #curro tomorrow   "` (tres espacios) → sin ellos

Los dobles espacios internos sí se conservaron (`pedir  llave`). El fallo es solo el trim de los extremos, más el rechazo del vacío.

Comportamiento nuevo:

- Persistir el título exactamente como llega, incluidos los espacios de los extremos.
- `""` es válido. El máximo sigue siendo 500 caracteres, contados sobre el texto ya guardado (sin recortar antes de medir).
- La UI puede mostrar un placeholder si el título está vacío o es solo espacios. No debe reescribir el valor al leer ni al guardar.
- Quick-add (`apps/api/src/modules/tasks/quick-add.ts`) puede seguir ignorando una captura cuyo texto, tras parsear, no tiene título. Eso no es este bug. El `POST /tasks` con `title` explícito `""` sí debe crear la tarea.

Enmienda `docs/spec/especificacion-producto-v1.1.md` donde diga que el título se normaliza o que es obligatorio no vacío.

## Bug 2 — una subtarea puede vivir en otra lista

`resolveSubtaskProject` (`packages/domain/src/tasks/subtask.ts`) devuelve `project_mismatch` si `requestedProjectId !== parentProjectId`. `tasks.service.ts` lo aplica al crear y al mover (busca las llamadas cerca de las líneas 683 y 1342). El mensaje HTTP es `A subtask stays in its parent list`. RF-205 (`docs/spec/especificacion-producto-v1.1.md`, cerca de la línea 376) y la UI (`docs/spec/tick-tack-done-ui-spec-v1.0.md`, subtareas) dicen que la hija hereda la lista del padre.

En el formato de origen una tarea puede tener `parentId` de otra lista. El import perdió 12 completadas y 1 abierta por esto. Casi todas son ocurrencias de «Lista de compra + compra online #casa #personal #plan #30min» cuyo padre es «Mi momento…», que está en otra lista.

Request que respondió 400 `project_mismatch` (source id `69bcebdd8f08f2a6b54ab7db`):

```json
{
  "title": "Lista de compra + compra online #casa #personal #plan #30min",
  "project_id": "ee19a5c9-441e-4d6e-9e5b-3a0e909e00b9",
  "priority": "high",
  "due_date": "2026-05-05T10:00:00+00:00",
  "start_date": "2026-05-01T12:00:00+00:00",
  "time_zone": "Europe/Madrid",
  "repeat_rule": "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=FR",
  "tag_ids": ["…"],
  "parent_id": "5251fbcb-b6aa-4228-8db1-c96134e1cc54"
}
```

El `project_id` del body es el de la lista de la hija. El `parent_id` ya es el id de Reflexionia del padre, y ese padre está en otra lista. Esperado: **201**, la tarea queda con ese `project_id` y ese `parent_id`. No la muevas a la lista del padre. No rechaces el alta.

La misma regla tumbó al padre de origen `69e72178c9c4466e323fc24f`. Por eso la hija `69e72178c9c4466e323fc252` ni siquiera se intentó (`Parent … was not migrated`). Arreglar la regla basta; no hardcodees esos ids.

Sigue siendo inválido un `parent_id` que no existe, que es de otro usuario, o que forma un ciclo. Una subtarea en otra lista es válida.

Dónde se ve:

- En la lista del `project_id` de la hija, la hija aparece (también con `flat=true`).
- En el detalle del padre, sigue saliendo como subtarea.
- La vista plana no la esconde por el hecho de tener `parent_id`.

Enmienda RF-205 y el párrafo de subtareas de la spec UI. El test `RF-205: a subtask keeps the parent list` hay que invertirlo: listas distintas son `ok: true` y se respeta el `projectId` pedido.

## Bug 3 — `repeat_rule` no vuelve como se envió

`canonicalizeRepeatRule` (`packages/domain/src/recurrence/rule.ts`) reescribe la regla antes de guardarla (`tasks.service.ts`, `canonicalRule`). Hace dos cosas que rompen el ida y vuelta:

1. Antepone `DTSTART;TZID=<zona>:<fecha local compacta>` aunque el cliente no lo mandó. La zona y el ancla ya están en `time_zone`, `start_date` y `due_date`.
2. `normalizeBody` omite `INTERVAL` cuando vale 1.

Caso real. Se envió, con `due_date` y `start_date` `2026-05-04T11:10:00+00:00` y `time_zone` `Europe/Madrid`:

```text
RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO
```

El GET devolvió:

```text
DTSTART;TZID=Europe/Madrid:20260504T131000
RRULE:FREQ=WEEKLY;BYDAY=MO
```

La tarea sí se creó (prioridad, fechas, tags y estado cuadraban). El fallo es solo la regla guardada. Le pasó a las recurrentes del import, entre ellas «Asistenta lunes…», «Asistenta jueves…», «Pagar asistenta», «Revisión hogar…», «Rutina casa…», «Mi momento: planificación y orden personal #personal #review», «Weekly review + preparar weekly plan…» y «Lectura · check-in semanal…».

Comportamiento nuevo:

- Si `repeat_rule` es un RRULE válido (solo, o ya con `DTSTART` / `EXDATE`), `GET` devuelve **el mismo string** que se envió, carácter a carácter.
- No metas el `DTSTART` dentro de `repeat_rule`. El ancla sigue siendo `due_date` + `time_zone` (y `start_date` si viene).
- `INTERVAL=1` se conserva. No es ruido: es lo que manda el formato de origen y lo que el cliente envió.
- Una regla inválida sigue en 400 `validation_failed` / `repeat_rule must be an RRULE`. Sin `due_date`, el comportamiento actual de «a repeating task needs a due_date» puede quedarse.
- El motor que calcula la siguiente ocurrencia, el `EXDATE` al saltar una ocurrencia (`excludeOccurrence`, RF-705) y el detach pueden canonicalizar **en memoria**. No pueden pisar el `repeat_rule` persistido salvo que el usuario edite la regla o el producto añada un `EXDATE` de verdad. Si al excluir una ocurrencia hay que guardar un `EXDATE`, añádelo al texto original; no regeneres el RRULE ni quites `INTERVAL=1`.
- Los tests de `packages/domain/src/recurrence/recurrence.spec.ts` que afirman la forma con `DTSTART` delante y sin `INTERVAL=1` hay que cambiarlos para que describan el cálculo interno, no el valor que vuelve por la API.

No hace falta una columna nueva si el string original cabe en `repeat_rule`. Si el cálculo necesita un DTSTART, derívalo al leer y no lo escribas de vuelta.

## Fuera de este PR

- No lances otra migración ni borres las tareas ya importadas (incluidas las de prueba «Reservar el tren», «ZZ», etc.).
- No cambies prioridades, tags, fechas ni checklist: en el import esos campos sí coincidieron cuando el POST devolvió 201.
- Hábitos, adjuntos, comentarios y recordatorios del formato de origen no forman parte de este fallo.
- No toques el importador externo. El importador externo repetirá estos POST cuando la API acepte el ida y vuelta.

## Hecho cuando

1. El POST del título `""` crea la tarea y el GET devuelve `""`.
2. Un título con espacios al principio y al final vuelve idéntico.
3. El POST de subtarea con `project_id` distinto del padre crea la tarea en esa lista, con ese `parent_id`, sin 400.
4. El POST con `RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO` y el GET devuelven ese mismo texto, sin `DTSTART` añadido y sin perder `INTERVAL=1`.
5. `pnpm lint`, `pnpm typecheck` y `pnpm test` pasan.
