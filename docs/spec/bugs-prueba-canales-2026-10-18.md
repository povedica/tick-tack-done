# Spec de parches: prueba de captura del 18/10/2026

Informe para corregir todos los fallos vistos al crear 4 listas y 20 tareas en
`https://todo.reflexionia.com`, por la web, por `POST /api/v1` y por el bot
`@reflexionia_todo_bot`. Esta spec es el encargo de implementación. No reabre
la sección 21 de `especificacion-producto-v1.1.md`, no publica una v1.2 y no
rehace el login (ya está corregido; ver el final).

Trabaja en una rama `fix/prueba-canales` desde `main` actualizado con lo que
ya esté mergeado. Un solo PR: B1, B3 y B6 comparten el parseo, y partirlos
deja la captura a medias. Cita esta spec y los RF que enmienda.

No borres ni muevas datos de producción. La prueba dejó tareas a propósito,
incluida `Reservar el tren` en la bandeja y la tarea `nueva lista Viaje`. El
parche no las reubica.

Al terminar: `pnpm lint`, `pnpm typecheck`, `pnpm test`. Integración de API en
los puntos que tocan `POST /tasks`, tags, listas y Telegram. Regenera OpenAPI
(`pnpm --filter api openapi:generate`) porque cambian `warnings` y, si hace
falta, el texto de la descripción de `raw_text`. Comprueba en el navegador los
flujos de B1, B4, B6 y B7, en escritorio y en una ventana corta (~840×660).

## Lo que la prueba dejó demostrado

Cuentan como fallo solo los puntos B1–B7. Las fechas, prioridades y etiquetas
de las 20 tareas sí se guardaron cuando el texto pasó por la hoja de captura
(`/quick-add`, que envía `raw_text`) o por la API con campos explícitos. El
calendario mensual, en `Europe/Madrid`, colocó cada tarea en el día local
correcto. El desborde `+N` es el fallo del calendario, no el cálculo del día.

## Enmienda de producto (obligatoria en el mismo PR)

Hoy la spec y el test dicen lo contrario de lo que hay que conseguir.

- `docs/spec/especificacion-producto-v1.1.md`, RF-107 (cerca de la línea 368) y el
  párrafo de `POST /tasks` (cerca de la línea 598): si `^lista` o `~lista` no
  existe, la tarea va al inbox y se avisa `list_not_found`; una etiqueta
  desconocida no se crea y avisa `tag_not_found`.
- `apps/api/test/capture.e2e-spec.ts`, el caso
  `RF-107: an empty title creates nothing and a missing list stays in the inbox`.
  Hoy exige que `llamar ^noexiste #fantasma` quede en el inbox, sin lista, sin
  etiqueta y con esos dos warnings.

Sustituye esa regla por esta:

1. Un título que el parser deja vacío sigue sin crear nada (`empty_title`,
   RF-107, primera frase). No se crea lista ni etiqueta en ese caso.
2. Si el texto trae `^nombre` o `~nombre` y no hay proyecto del usuario con
   ese nombre (comparación sin distinguir mayúsculas), se crea el proyecto y
   la tarea entra ahí. No cae en la bandeja.
3. Si el texto trae `#nombre` y no hay etiqueta del usuario con esa clave, se
   crea la etiqueta y se asocia a la tarea. No se descarta.
4. Un campo explícito del cuerpo sigue pisando el parseo (RF-102). `project_id`
   explícito no crea la lista parseada. `tag_ids` explícito no crea las
   etiquetas parseadas. `title` explícito sigue siendo el título guardado.

Actualiza el texto de RF-107 y del párrafo de `POST /tasks` en la spec v1.1.
No cambies el número de versión del documento.

## B1. No hay forma de crear una etiqueta en la interfaz

### Reproducción

1. Entra en la app.
2. En el lateral, la sección Etiquetas solo lista las que ya existen. No hay
   campo, botón ni estado vacío con alta.
3. Abre una tarea. El selector de etiquetas
   (`apps/web/src/features/tasks/TaskDetail.tsx`) solo ofrece las existentes.
4. En `/quick-add`, escribe `#noexiste`. La API responde 201, la etiqueta no
   se crea y `warnings` incluye `tag_not_found`. El cliente la ignora.

La API ya puede crearlas: `POST /api/v1/tags` y `api.createTag` en el SDK. En
la prueba las siete etiquetas (`casa`, `compra`, `personal`, `trabajo`,
`foco`, `salud`, `viaje`) se crearon por API porque la web no tenía alta.

### Comportamiento que debe quedar

Dos caminos, los dos obligatorios.

**Alta en el lateral.** En la cabecera de Etiquetas, un control «Nueva
etiqueta» (icono más y un campo) llama a `api.createTag({ name }, idempotencyKey)`.
Nombre recortado, de 1 a 100 caracteres, las mismas reglas que
`normalizeTagName` en `packages/domain/src/tags/tags.ts`. Tras el 201, vacía
el campo, deja el foco y invalida la query `tags`. Si el nombre ya existe
(409 / nombre duplicado), no crees otra y muestra el error en español. La
sección se ve también cuando no hay etiquetas, para poder crear la primera.
Textos en `apps/web/src/i18n/es.ts` y `en.ts`.

**Alta al capturar.** `#nombre` desconocido crea la etiqueta dentro de la
misma transacción que la tarea y la asocia. Ver B3, que es el mismo cambio de
`resolveTags`. El aviso pasa de `tag_not_found` a `tag_created`.

### Archivos

- `apps/web/src/shell/Sidebar.tsx` (el bloque de etiquetas empieza tras el
  formulario de lista, alrededor de la línea 168). Hoy solo hace `map` de
  `tags.data?.items`.
- `apps/api/src/modules/tasks/quick-add.ts`, `resolveTags` (líneas 101–127):
  si `byKey` no tiene el nombre, inserta la fila en lugar de
  `warnings.push({ code: 'tag_not_found' })`.
- Copia el alta mínima de `TagsService.insert`: `ownerId`, nombre ya
  normalizado, color nulo, `sortOrder` al final con hueco 65536, y el evento
  `tag.created` (`DomainEvent` que ya emite el módulo de tags) en la misma
  transacción. No importes `TagsModule` desde `TasksModule`: los módulos de
  dominio no se llaman entre sí. Un comentario junto al insert debe apuntar a
  `tags.service.ts` para que los dos altas no diverjan.
- `CaptureWarning` en `quick-add.ts`, `CaptureWarningDto` en
  `apps/api/src/modules/tasks/tasks.dto.ts` (el enum de la línea 579) y
  `apps/web/src/features/capture/notice.ts`. Añade `tag_created` con `name`.
  Conserva `tag_not_found` en el tipo por si un nombre no se puede crear
  (vacío o de más de 100); en el camino feliz de `#fantasma` no debe salir.

### Pruebas

- Integración: `POST /tasks` con `raw_text: 'llamar #fantasma'` crea la
  etiqueta `fantasma`, `tag_ids` la incluye, `warnings` contiene
  `{ code: 'tag_created', name: 'fantasma' }` y un segundo POST con el mismo
  `#fantasma` reutiliza la fila (un solo tag, sin segundo `tag_created` si
  prefieres silencio al reutilizar; no dupliques).
- El caso de título vacío sigue en 400 y no crea etiqueta.
- `tag_ids` explícito no crea las etiquetas que solo venían en `raw_text`.
- Sustituye la aserción actual de `#fantasma` en `capture.e2e-spec.ts`.

## B2. Telegram convierte «nueva lista …» en una tarea

### Reproducción

Con el chat ya vinculado, se envió el texto `nueva lista Viaje` antes de que
la lista existiera. `parseTelegramCommand` no conoce un alta de lista: lo que
no es comando cae en `{ kind: 'capture', text }`
(`packages/domain/src/integrations/telegram.ts`, última línea de
`parseTelegramCommand`). El bot llamó a `capture()` y guardó una tarea en la
bandeja, sin fecha, sin prioridad y sin etiquetas, titulada
`nueva lista Viaje`. El usuario vio una tarea guardada, no una lista.

`/lista` sin argumento lista proyectos. `/lista Viaje` filtra la lista
`Viaje` (`listFilter`). `/lista nueva Viaje` hoy se interpretaría como filtro
de una lista llamada `nueva Viaje`, no como alta.

### Comportamiento que debe quedar

Reconocer el alta **antes** del filtro `/lista …` y **antes** del capture por
defecto. Frases, en este orden, nombre hasta el final del mensaje (puede
llevar espacios):

- `/nuevalista <nombre>`
- `/lista nueva <nombre>`
- `/lista crear <nombre>`
- `nueva lista <nombre>`
- `crear lista <nombre>`

Nombre recortado, de 1 a 200 caracteres (el tope de `ListsService.name`). Si
queda vacío, responde en español que falta el nombre y no crea nada.

Nuevo comando de dominio: `{ kind: 'create_list', name: string }` en el union
`TelegramCommand`. El servicio del bot lo despacha en `handle` **antes** de
`namedList`. Crea el proyecto con `ListsService.createProject` (el módulo de
integraciones ya es adaptador de entrada y ya usa `TasksService`; puede usar
`ListsService` del mismo modo, sin que `TasksModule` importe `ListsModule`).
Clave de idempotencia `telegram-list-<updateId>` para que un reintento de
Telegram no duplique la lista.

Respuestas, sin crear tarea:

- Creada: `Lista creada: Viaje.`
- Ya existe, comparación sin distinguir mayúsculas: `La lista «Viaje» ya existe.`
  No se inserta otra fila.

Añade `/nuevalista` a `setMyCommands`, con descripción en español. Actualiza
el texto de «ese comando no existe» para incluir el alta.

### Pruebas

En el spec de dominio del parser:

- `nueva lista Viaje`, `crear lista Viaje a Lisboa`, `/nuevalista Casa` y
  `/lista nueva Casa` devuelven `create_list` con el nombre indicado.
- `/lista` sigue siendo el listado. `/lista Casa` sigue siendo filtro.
- `Reservar el tren ^Viaje` sigue siendo `capture` (el `^` lo resuelve B3).

Un test del servicio o de integración del webhook: el update con
`nueva lista Viaje` crea un proyecto y cero tareas con ese título.

## B3. `^lista` inexistente deja la tarea en la bandeja

### Reproducción

`Reservar el tren ^Viaje #viaje !alta mañana` se envió por Telegram cuando
`Viaje` no existía. Prioridad alta, fecha del 19/10/2026 y etiqueta `viaje`
se guardaron. La lista no. La tarea está en Bandeja de entrada. Crear `Viaje`
después no la mueve.

Causa: `resolveList` en `apps/api/src/modules/tasks/quick-add.ts` (líneas
72–99). Si el `findMany` no encuentra el nombre, empuja `list_not_found` y
devuelve el inbox. `telegram-bot.service.ts` `capture()` (líneas 116–123)
añade: `La lista «Viaje» no existe, así que quedó en la bandeja.`

El parser solo toma un token tras `^` o `~` (`matchList` en
`packages/domain/src/nlp/parse.ts`). No cambies esa gramática en este parche.
Un nombre con espacios se crea por B2 o por el lateral, no por `^`.

### Comportamiento que debe quedar

Dentro de la misma transacción que inserta la tarea:

1. Buscar como ahora (exacto y, si no, insensible a mayúsculas). Si hay fila,
   usarla. No crear duplicado. No emitir warning.
2. Si no hay fila, crear el proyecto: `ownerId`, nombre con las mayúsculas
   que salieron del parser (`normalizeTagName` solo recorta y limita a 100),
   `color` null, `folderId` null, `viewMode: 'list'`, `kind: 'TASK'`,
   `isInbox: false`, `sortOrder` = máximo de los proyectos vivos del usuario
   - 65536, o 65536 si no hay ninguno. Emitir `project.created` con el mismo
     shape que `ListsService.createProject` (líneas 212–231 de
     `lists.service.ts`). No importes `ListsModule`.
3. Poner la tarea en ese `id`. Warning `{ code: 'list_created', name }` en
   lugar de `list_not_found`.
4. Si no viene nombre de lista, seguir en el inbox. Sin warning.
5. `project_id` explícito sigue ganando y no crea la lista parseada.

Telegram, en `capture()`: si el warning es `list_created`, la respuesta es
`Guardada: <título>. Lista creada: <nombre>.` Si es una etiqueta nueva, puede
añadir `Etiqueta creada: <nombre>.` No uses la frase de la bandeja cuando la
lista se acaba de crear.

La hoja de captura debe enseñar `list_created` y `tag_created` como aviso
claro en español («Se ha creado la lista X», «Se ha creado la etiqueta X»),
no como error.

`list_not_found` puede quedar en el enum por compatibilidad del tipo, pero el
camino de un nombre nuevo y válido no debe emitirlo.

### Pruebas

Sustituye el tramo de `^noexiste` en `capture.e2e-spec.ts`:

- `llamar ^noexiste #fantasma` → 201, título `llamar`, `project_id` de un
  proyecto nuevo llamado `noexiste` (no el inbox), etiqueta `fantasma`
  asociada, warnings `list_created` y `tag_created`, y existe el evento
  `project.created`.
- Repetir `otra ^noexiste` no crea un segundo proyecto.
- `^NOEXISTE` reutiliza `noexiste`.
- `raw_text` con `^otra` más `project_id` del inbox deja la tarea en el inbox
  y no crea `otra`.
- Título vacío sigue en 400 sin proyecto nuevo.

## B4. El mes del calendario corta a 3 tareas y `+N` no se abre

### Reproducción

En `/calendar/month`, el 18/10/2026 la celda mostró tres títulos y el texto
`+2`. Ese `+2` es un `<span>`, no un enlace ni un botón. No lleva a ningún
sitio. El día tenía cinco tareas (las tres visibles más Meditar diez minutos
y Cambiar las bombillas).

Código: `Month` en `apps/web/src/features/places/Places.tsx` (líneas 259–280).

```tsx
{items.slice(0, 3).map((task) => (
  <Link ...>{task.title}</Link>
))}
{items.length > 3 ? <span>+{items.length - 3}</span> : null}
```

La vista día (`current === 'day'`, líneas 220–236) vuelca todas las tareas
con fecha, sin filtrar el día, en una lista plana. Abrir `/calendar/day` no
sirve como destino del `+2`.

Además, la página pide `api.listTasks({ status: 'active', limit: 100, sort: 'due' })`
una sola vez. Con más de 100 activas, el mes y el `+N` mienten. En la prueba
no se llegó a 100; el parche tiene que dejar de depender de esa página única.

### Cómo se asigna el día (no lo rompas)

La celda y la tarea se comparan así:

```ts
const key = day.toISOString().slice(0, 10);
task.due_date.slice(0, 10) === key;
```

En un navegador en `Europe/Madrid` (CEST, UTC+2, el 18/10/2026), una tarea de
día completo guardada como `2026-10-17T22:00:00.000Z` cae en la celda cuyo
número visible es 18, porque ambas cadenas quedan en `2026-10-17` y
`day.getDate()` es 18. Eso se comprobó en producción. El parche no debe
mover esas tareas a otro número.

El enlace del día no puede usar esa clave UTC como fecha humana. La fecha
visible es la local de la celda.

### Comportamiento que debe quedar

1. Sigue mostrando como máximo 3 pastillas por celda.
2. Si hay más, `+N` es un enlace o botón con nombre accesible en español
   («2 tareas más el 18 de octubre») que abre
   `/calendar/day?date=YYYY-MM-DD`, donde `YYYY-MM-DD` sale de
   `getFullYear()`, `getMonth()` y `getDate()` de esa celda (el 18, no la
   clave UTC `2026-10-17`).
3. El número del día es el mismo enlace.
4. La vista día, cuando hay `?date=`, lista solo las tareas que la celda de
   ese día local ya agrupaba (el mismo predicado `toISOString().slice(0, 10)`
   contra la medianoche local de esa fecha). Las muestra todas, no tres. Cada
   fila sigue enlazando a `/list/{project_id}?task={id}`.
5. Sin `?date=`, la vista día usa hoy (medianoche local del navegador).
6. Carga del mes: pide el intervalo con `dueAfter` y `dueBefore` del mes
   visible (y los días de relleno de la rejilla de 42 celdas) y sigue
   `next_cursor` hasta agotar. El `+N` y la vista día cuentan con esa lista
   completa, no con el primer page de 100.
7. Textos nuevos en `es.ts` y `en.ts`.

### Pruebas

Un test de componente o de la función pura que agrupa: cinco tareas en la
misma clave de celda producen tres enlaces de tarea y un enlace `+2` cuyo
`href` lleva `date` con el día local de la celda, no la clave UTC. La vista
día con esa query devuelve las cinco.

Comprueba en el navegador, con la sesión de la cuenta de prueba, que el 18
abre las cinco tareas y que el 19, el 20 y el 2 de noviembre siguen en su
celda.

## B5. La transacción interactiva de Prisma corta a los 5 s

### Qué se vio

En los logs de `todo-api-1`, durante la prueba (marca del contenedor
`10/18/2026, 5:00:01 PM`; en Madrid eran las 19:00):

`Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 6544 ms passed since the start of the transaction.`

Es el timeout por defecto de `$transaction(async () => …)` cuando no se pasa
`timeout`. Las peticiones de alta siguieron respondiendo 201 y el webhook
200, así que el fallo puede ser una transacción hermana (eventos, outbox u
otra escritura) que expira mientras el trabajo ya se ha hecho, o una escritura
que el cliente llegó a ver y el proceso soltó a medias. No se capturó el
stack: las líneas siguientes iban con códigos ANSI y se perdieron.

### Qué hay que hacer

1. En el servidor, si el log aún está, saca el stack que sigue a esa línea
   (`docker logs todo-api-1`). El call site real manda sobre esta hipótesis.
2. Hipótesis principal, por el momento de la prueba: `IdempotencyService.run`
   (`apps/api/src/idempotency/idempotency.service.ts`, líneas 59–69) envuelve
   cada `POST /tasks` (y el alta de listas y etiquetas) en una transacción
   interactiva sin `timeout`. `insertTask` hace el parseo, varias lecturas,
   el insert, etiquetas y el outbox. Con varias altas seguidas (web, API y
   Telegram) esa transacción pasó de 5 s.
3. Sube el timeout de **esa** transacción a 15 s:
   `this.prisma.$transaction(async (tx) => { … }, { timeout: 15_000 })`.
   No subas en bloque las demás transacciones del repositorio. Si el stack
   señala otro `$transaction`, aplica el mismo `{ timeout: 15_000 }` solo ahí
   y dilo en el PR.
4. Ninguna de esas transacciones puede esperar red: `sendMessage` de
   Telegram, Google o SMTP van después del `await` de la transacción, como
   ya hace `capture()` respecto a `tasks.create`. Revísalo y no lo metas
   dentro.
5. Cuando Prisma lance el timeout (código `P2028`), el log debe incluir una
   frase fija con el sitio, por ejemplo `interactive transaction timed out`
   más el método (`IdempotencyService.run`). Sin cuerpos de petición ni
   secretos.
6. `remember()` del bot (línea 373) es un upsert corto. No es el candidato.
   No lo toques si el stack no lo nombra.

No hace falta un test que duerma 6 s. Sí un test de unidad o de integración
que siga viendo el `POST /tasks` en 201, y una lectura del diff que demuestre
que el `$transaction` de idempotencia recibe `timeout: 15_000`.

## B6. «Añadir tarea» en Hoy y en una lista no parsea

### Reproducción

La hoja `/quick-add` envía `{ raw_text }` (`CaptureSheet.tsx`) y el servidor
aplica RF-102. Los otros dos campos no:

- `apps/web/src/features/today/TodayPage.tsx`, el formulario `quick-add`
  (alrededor de las líneas 338–355) envía `{ title, project_id: inbox.id }`.
- `apps/web/src/features/tasks/TaskList.tsx`, el formulario `inline-add`
  (alrededor de las líneas 101–117) envía `{ title, project_id: createProjectId }`.

Escribir `Regar ^Casa #casa !baja mañana` en Hoy guarda ese texto como título,
en la bandeja, sin fecha, sin prioridad y sin etiqueta. La tarea no aparece
en Hoy. Un `project_id` explícito además impide que un `^` futuro elija lista,
porque el cuerpo pisa el parseo.

### Comportamiento que debe quedar

**Hoy.** El campo envía `raw_text` con lo escrito. No envía `title` ni
`project_id`, para que `^lista`, `#etiqueta`, `!prioridad` y la fecha los
resuelva el servidor (y B1/B3 creen lo que falte).

Si el parser de `packages/domain` no saca fecha, el cliente añade la fecha de
hoy en la zona del usuario, el mismo límite con el que la vista Hoy decide
qué es «hoy». Así un título pelado en Hoy sigue apareciendo en Hoy. Si el
texto ya trae fecha (`mañana`, `21/10`, `25 de octubre`), no añadas otra:
mandar `due_date` explícito pisaría el parseo.

Tras el 201: vacía el campo, deja el foco, invalida las queries de Hoy, de
tareas de la lista afectada y de contadores del lateral, y enseña el aviso
de lista o etiqueta creada (B3). Si falla, toast de error y el texto se
queda.

**Dentro de una lista.** Envía `raw_text` y el `project_id` de esa lista. El
`project_id` mantiene la tarea en la lista (el `^` del texto no la mueve).
`#`, `!` y la fecha sí se aplican. No fuerces la fecha de hoy: en una lista,
un título sin fecha es una tarea sin fecha.

La cola offline (`newMutation`) tiene que guardar el mismo cuerpo que el
POST, no un `{ title, project_id }` distinto, para que el replay no pierda
el parseo.

### Pruebas

- En Hoy, un título sin símbolos crea una tarea con fecha de hoy que la vista
  Hoy lista sin recargar.
- En Hoy, `Regar ^Casa #casa !baja mañana` (con B1 y B3 ya hechos) crea o
  reutiliza Casa y la etiqueta, prioridad baja, fecha de mañana, y el título
  guardado es `Regar`.
- En una lista, `Informe #trabajo !alta mañana` se queda en esa lista, con
  etiqueta, prioridad y fecha, título `Informe`.
- Compruébalo en el navegador en `/today` y en `/list/{id}` de una lista de
  la cuenta de prueba.

## B7. «Nueva lista» no se puede usar en una ventana corta

### Reproducción

El alta de lista es un `<form>` al final de las listas, dentro de
`aside.sidebar`, que hace scroll él solo (`Sidebar.tsx`, líneas 146–167).
No tiene botón. El único envío es Enter sobre el input, y el valor sale del
estado React `draft`, no de un `name` del input.

En una ventana de 834×660 el campo queda fuera del trozo visible del lateral.
Un clic no puede llevarlo a la vista porque el scroll que hay que mover es el
del `aside`, no el de la página. Sin botón, quien no llega al campo no crea
la lista. En la prueba, Casa y Trabajo se crearon solo al disparar
`requestSubmit()` con el campo ya relleno; no hay un control visible
equivalente.

### Comportamiento que debe quedar

En la cabecera de Listas, un botón «Nueva lista» abre un campo con estilo de
la app (no un input siempre colgando al final del scroll). Enter crea.
Escape cierra y no crea. Un botón «Crear» junto al campo envía el formulario
aunque Enter no llegue a disparar el submit nativo. El control se alcanza sin
hacer scroll hasta el fondo del lateral.

El alta sigue siendo `api.createProject({ name, color: '#4772fa' }, key)`,
vacía el campo e invalida `projects`. Nombre vacío no llama a la API. Nombre
de 1 a 200 caracteres. Duplicado: enseña el error y no crea otra.

Mismo patrón visual que el alta de etiqueta de B1, para que las dos secciones
se comporten igual.

### Prueba

En el navegador, a ~840×660: el botón de la cabecera se ve sin scrollear el
lateral hasta el fondo, Crear añade la lista y aparece en el lateral sin
recargar. Escape con el campo abierto no crea nada.

## Fuera de este parche

No los implementes en esta rama.

**Ya corregido el 18/10/2026.** La web de producción se servía sin exigir
sesión y el cliente mandaba `X-Dev-User-Email` en lugar de la cookie. Quedó
en el modo sesión (`VITE_AUTH_MODE=session`), `RequireSession`, login y
registro reales, y `GET /api/v1/auth/session`. No lo rehagas.

**Huecos de despliegue, no de esta prueba.** `TELEGRAM_VOICE_PROVIDER` está
vacío, así que la voz no se transcribe. `SMTP_HOST` en el entorno de
producción es `localhost`, así que el correo no sale de la máquina. No son
parches de código de B1–B7.

**Pantallas de recuperación.** `ForgotPage` en `Places.tsx` sigue siendo un
texto fijo. No formó parte de los fallos de las 20 tareas.

## Orden dentro de la rama

1. B5, el timeout, para que las altas de la prueba de integración no dependan
   de un corte a 5 s.
2. B3 y la parte de API de B1 (`resolveList`, `resolveTags`, warnings,
   enmienda de RF-107, test e2e, OpenAPI).
3. B2, el comando de Telegram, que reutiliza `createProject`.
4. B6, los dos campos de la web, que ya pueden mandar `raw_text`.
5. B1, el control del lateral, y B7, el de listas.
6. B4, el calendario.

## Hecho cuando

- `#fantasma` y `^noexiste` crean etiqueta y lista, y la tarea no cae en la
  bandeja. El test viejo de RF-107 que exigía lo contrario queda sustituido.
  La spec v1.1 dice la regla nueva.
- `nueva lista Viaje` por Telegram crea la lista y ninguna tarea.
- En Hoy, un texto con `^`, `#`, `!` y fecha se parsea; un título pelado
  queda con fecha de hoy y se ve al momento.
- En una lista, `#`, `!` y la fecha se parsean y la tarea se queda en esa
  lista.
- El lateral crea la primera etiqueta y una lista nueva desde la cabecera,
  con botón Crear, en una ventana de ~840×660.
- En el mes, `+N` y el número del día abren ese día local con todas sus
  tareas. Las tareas del 18, 19, 20 y 2 de noviembre no cambian de celda.
- El `$transaction` de idempotencia tiene `timeout: 15_000`, y un `P2028`
  deja en el log el sitio, sin datos de la petición.
- Lint, typecheck, unitarios e integración de API en verde. OpenAPI
  regenerado. Nada de lo ya guardado en producción se borra ni se mueve.
