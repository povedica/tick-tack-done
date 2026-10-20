# Especificación funcional: sincronización de Google Calendar (calendarios externos) para tick-tack-done

**Versión:** 1.0 — 19 oct 2026
**Destinatario:** agente de desarrollo (Cursor) trabajando sobre `github.com/povedica/tick-tack-done`
**Estilo:** sigue las convenciones de `docs/spec/especificacion-producto-v1.1.md`, `docs/spec/tick-tack-done-ui-spec-v1.0.md` y `docs/spec/countdown-spec-v1.0-*.md` (requisitos RF numerados, modelo Prisma, API REST bajo `/api/v1`, herramientas MCP, UI web/PWA muy parecida a TickTick).

---

## 0. Cómo leer este documento

- Es una especificación **one-shot**: contiene todo lo necesario para implementar la funcionalidad sin preguntar nada más. Si algo te parece ambiguo, elige la opción que se parezca más a TickTick y déjalo anotado en el PR.
- Cada requisito tiene un identificador `RF-25xx` (rango nuevo; en la especificación de producto ya están usados 20xx, 21xx, 22xx, 23xx y en countdown 24xx). Los tests de aceptación referencian estos identificadores.
- Rutas de archivo referenciadas relativas a la raíz del repo.
- **No rompas nada existente**: la suite actual (`pnpm test`, integration tests de `apps/api`, Playwright de `apps/web`) debe seguir en verde al final. En particular, no toques el comportamiento de los feeds iCal de salida, de las suscripciones iCal ni del push de tareas a Google (RF-2004).
- Esta entrega es **solo lectura** desde Google hacia tick-tack-done. El push de tareas a Google que ya existe (dos vías, RF-2004) queda como está.

---

## 1. Estado actual y objetivo

### 1.1 Lo que ya existe (verificado en el repo, 19 oct 2026)

**Modelo de datos** (`apps/api/prisma/schema.prisma`):

- `CalendarSubscription` (línea ~601): `id`, `ownerId`, `url` (nullable), `provider` (string libre: se usa `ical` y `google`), `syncDirection` (`read` | `two_way`), `color`, `lastSyncedAt`, timestamps, `deletedAt`. Relación `events: ExternalEvent[]`.
- `ExternalEvent` (línea ~619): `id`, `ownerId`, `subscriptionId`, `externalUid`, `title`, `startsAt`, `endsAt`, `isAllDay`, `timeZone` (defecto `Europe/Madrid`), `raw` (Json), timestamps, `deletedAt`. Unique `[subscriptionId, externalUid]`, índice `[ownerId, startsAt]`.

**Backend** (`apps/api/src/modules/calendar/`):

- `GET /api/v1/calendar/events?from&to` ya devuelve `{ tasks, external }`: las tareas propias (editables) y los `ExternalEvent` del rango con `color` y `provider` de su suscripción, `editable: false`.
- Suscripciones iCal: `POST /subscriptions` (con preview), `POST /subscriptions/:id/refresh` (fetch + `parseIcal` de `@reflexionia/domain`, upsert por uid), `DELETE` lógico. Feeds iCal de salida (crear/listar/rotar/revocar, `GET /calendar/:token` público por hash).
- `refreshGoogle()` (privado, en `calendar.service.ts`): lee `https://www.googleapis.com/calendar/v3/calendars/primary/events` con ventana fija de -7 días / +30 días, `singleEvents=true`, y hace upsert en `ExternalEvent`. **Limitaciones actuales**: solo el calendario `primary`, sin selector de calendarios, sin `syncToken` (relee todo cada vez), sin paginación (`pageToken`), sin tratar eventos `status: "cancelled"` (nunca se borran), sin guardar `timeZone` ni `raw`, el `update` del upsert no actualiza `isAllDay`, sin sincronización programada (solo manual vía API), sin reintentos.
- Push a Google (RF-2004, `push()`): escribe tareas con fecha en el calendario `primary` cuando la suscripción es `two_way`. **No tocar** salvo lo indicado en §3.7.
- OAuth de Google (`apps/api/src/modules/integrations/google-oauth.ts`): pide scopes `openid email https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file` con `access_type=offline` y `prompt=consent`. El scope `calendar` (lectura y escritura) **ya se solicita**, así que la lectura de Calendar está cubierta por el consentimiento actual; ver RF-2516 para la comprobación de scopes concedidos.
- Token de acceso (`apps/api/src/integrations/google-token.ts` + `CalendarService.googleAccessToken`): refresh token cifrado por usuario (`googleRefreshToken`, cifrado con `security/field-cipher.ts`, se abre con `openField`), con fallback a `GOOGLE_REFRESH_TOKEN` de entorno. Intercambio a access token con timeout de 8 s.
- Estado de conexión: `GET /api/v1/integrations/google` devuelve `{ configured, connected, account }` (no devuelve los scopes concedidos).
- Scopes de API (`apps/api/src/auth/scopes.ts`): **ya existen** `calendar:read` y `calendar:write` en `API_SCOPES`.

**Frontend** (`apps/web/`):

- `CalendarPage` (`apps/web/src/features/places/Places.tsx`, ~línea 273): pinta solo tareas propias en las vistas mes/semana/día; consulta tareas por rango, **no** usa `GET /calendar/events`.
- `CalendarExtras` (mismo archivo, ~línea 776): consulta `api.calendarEvents(now, now+31d)` y pinta los `external` como texto plano en `<p>` (lista de depuración sin estilo, sin fecha, sin color), y si no hay muestra el enlace "No hay calendarios externos." (`i18n: externalEmpty`) a `/settings/calendar`.
- `CalendarSettings` (`apps/web/src/features/product/ProductPages.tsx`, ~línea 366): solo ofrece **feeds iCal de salida** (crear/listar/revocar) y lee el flag de conexión de Google. **No hay ningún control para añadir, elegir o sincronizar calendarios de Google.** (Ojo: hay una segunda definición stub de `CalendarSettings` en `features/places/Places.tsx`, ~línea 1350.)
- Vista Hoy (`features/today/TodayPage.tsx`): no muestra eventos externos.

**MCP** (`apps/api/src/mcp/mcp.catalog.ts`): no hay ninguna herramienta de calendario.

**Scheduler** (`apps/api/src/scheduler/scheduler.service.ts`): tick de 60 s con colas de recordatorios, hábitos, countdowns y digests. No hay ningún trabajo de sincronización de calendarios.

### 1.2 Objetivo

Que los eventos de los calendarios de Google del usuario (cuenta ya conectada en Ajustes > Integraciones) aparezcan en tick-tack-done como **calendarios externos de solo lectura**, con:

1. **Selector de calendarios** en Ajustes > Calendario: lista los calendarios de la cuenta de Google (`calendarList`), el usuario elige cuáles sincronizar, con color y visibilidad por calendario.
2. **Vista Calendario** (mes/semana/día): los eventos externos se pintan en las celdas como chips con el color de su calendario, claramente no editables, con popover de detalle de solo lectura.
3. **Vista Hoy**: los eventos externos del día aparecen en una sección propia.
4. **Sincronización robusta**: inicial completa + incremental con `syncToken`, programada (cada 15 min) y manual ("Sincronizar ahora"), con manejo de cancelaciones, recurrentes, todo el día y zonas horarias.
5. **API REST y MCP** para que los agentes del propietario (incluido Instinct) puedan listar calendarios y eventos y forzar sincronización.

### 1.3 No objetivos (fuera de esta entrega)

- Editar o crear eventos de Google Calendar desde tick-tack-done (los externos son **read-only**; el push de tareas RF-2004 ya existente no cambia).
- Notificaciones push de Google (`events.watch` / canales webhook): se deja el diseño preparado (§6.5) pero no se implementa; la sincronización es por polling cada 15 min + manual.
- Calendario corporativo por JSON (ya tiene su propia spec, `spec-calendario-json`): convivirá como otro `provider` sobre el mismo `ExternalEvent`; no lo implementes aquí, pero no rompas esa extensión.
- Compartir calendarios entre usuarios, ni suscripciones de solo escritura.
- Cambiar la conexión OAuth existente (botón "Conectar Google" de Ajustes > Integraciones), salvo la comprobación de scopes de RF-2516.

---

## 2. Comportamiento esperado (referencia)

TickTick permite suscribirse a calendarios externos y muestra sus eventos en la vista Calendario, mezclados con las tareas pero visualmente distintos, no editables, con el color de cada calendario y un selector para mostrar/ocultar calendarios. Ese es el comportamiento de referencia ("TickTick es la referencia, es lo correcto").

Del lado de Google Calendar API v3 (comportamiento documentado de la API, en el que se apoya esta spec):

- `GET /calendar/v3/users/me/calendarList` devuelve los calendarios visibles del usuario: `id`, `summary`, `primary` (bool), `backgroundColor`, `accessRole`, `selected`, `hidden`.
- `GET /calendar/v3/calendars/{calendarId}/events` admite: `timeMin`/`timeMax` (RFC3339), `singleEvents=true` (expande instancias de recurrentes), `orderBy=startTime` (obligatorio con `singleEvents`), `maxResults` (defecto 250, máx. 2500) + `pageToken`/`nextPageToken` para paginar, `timeZone` (zona en la que se devuelven las horas), y `syncToken` para sincronización incremental.
- Sincronización incremental: una primera lectura completa devuelve `nextSyncToken` en la **última página**; las siguientes lecturas con `syncToken` devuelven solo cambios, incluidos eventos con `status: "cancelled"` (hay que marcarlos como borrados). Si el token caduca, Google responde **410 Gone** y hay que hacer resincronización completa. `syncToken` es incompatible con `timeMin`/`timeMax` y con `orderBy`.
- Eventos: `start.dateTime` + `start.timeZone` para eventos con hora; `start.date` (`YYYY-MM-DD`) para todo el día, y en ese caso `end.date` es **exclusivo** (un evento de todo el día del 20 oct llega como `start.date=2026-10-20`, `end.date=2026-10-21`). `summary` puede faltar (eventos sin título). Recurrentes: con `singleEvents=true` cada instancia tiene `id` compuesto (`<idRecurrente>_<timestamp>`) y `recurringEventId` común.

---

## 3. Alcance funcional (RF)

### 3.1 Selector de calendarios de Google

- **RF-2501** — Endpoint `GET /api/v1/calendar/google/calendars` (scope `calendar:read`): llama a `calendarList` con el token del usuario y devuelve `[{ id, summary, primary, background_color, access_role, selected_remote, subscription: { id, color, visible } | null }]` marcando cuáles ya tienen `CalendarSubscription` local. Errores: `google_not_configured` (503) si Google no está configurado/conectado (mismo patrón que hoy), `calendar_fetch_failed` (502) si Google rechaza.
- **RF-2502** — Alta de suscripción: `POST /api/v1/calendar/subscriptions` acepta `{ provider: "google", calendar_id }` (campo nuevo; el primario de Google se identifica con el `id` real devuelto por `calendarList`, no con el literal `primary`, para soportar multi-calendario sin ambigüedad). Si `calendar_id` falta con provider `google`, se usa el calendario primario (resolviendo su id real una vez y guardándolo). Duplicados: si ya existe una suscripción activa del usuario con ese `calendar_id`, devolver la existente (idempotente) en vez de crear otra. Al crearla, se lanza la **sincronización inicial** (RF-2510) antes de responder, devolviendo `{ id, provider, calendar_id, summary, color, visible, last_synced_at, imported }`.
- **RF-2503** — Cada suscripción Google guarda: `calendar_id`, `summary` (nombre visible, editable en local; por defecto el de Google), `color` (por defecto `backgroundColor` de Google), `visible` (bool, defecto true). `PATCH /api/v1/calendar/subscriptions/:id` (scope `calendar:write`) permite cambiar `summary`, `color`, `visible`. Ocultar (`visible=false`) no borra eventos: solo los excluye de las respuestas de eventos (RF-2520) y de la UI.
- **RF-2504** — Baja: `DELETE /api/v1/calendar/subscriptions/:id` (ya existe, borrado lógico) además marca `deletedAt` en sus `ExternalEvent` dentro de la misma transacción (hoy quedan huérfanos: el `onDelete: Cascade` de Prisma no aplica al ser soft-delete).
- **RF-2505** — `GET /api/v1/calendar/subscriptions` (ya existe) amplía su respuesta con `calendar_id`, `summary`, `visible`, `last_synced_at`, `last_error` (último fallo de sincronización, texto corto o null) y `event_count`.

### 3.2 Motor de sincronización

- **RF-2510** — Sincronización inicial por suscripción: lectura completa con `timeMin = ahora - 30 días`, `timeMax = ahora + 12 meses`, `singleEvents=true`, `orderBy=startTime`, `timeZone` = zona del usuario (`settings.timezone`, defecto `Europe/Madrid`), `maxResults=2500`, siguiendo `nextPageToken` hasta la última página; se guarda `nextSyncToken` en la suscripción. Upsert por `(subscriptionId, externalUid)` con `externalUid = event.id` (id compuesto de instancia cuando hay recurrencia). Guardar en `raw` el evento original de Google (para depurar y para el futuro detalle completo). Transacción por página, no una transacción gigante.
- **RF-2511** — Sincronización incremental: si la suscripción tiene `syncToken`, llamar solo con `syncToken` (sin `timeMin`/`timeMax`/`orderBy`); aplicar altas/cambios con el mismo upsert y **borrados**: `status == "cancelled"` → `deletedAt = now()` en el `ExternalEvent`. Al terminar, guardar el nuevo `nextSyncToken`.
- **RF-2512** — Si Google responde **410 Gone** (token caducado): borrar `syncToken`, poner `deletedAt` en todos los eventos de la suscripción y repetir la sincronización inicial (RF-2510). Registrar el evento de dominio `calendar.subscription_resynced`.
- **RF-2513** — Sincronización programada: trabajo nuevo en `scheduler.service.ts` (patrón de las colas `enqueue*` existentes): cada **15 minutos** recorre las suscripciones `provider IN ('google','ical')` activas y lanza su sincronización incremental, con `catchUp` tras reinicio (si `lastSyncedAt` es de hace más de 15 min, sincroniza al arrancar). Una suscripción que falla no bloquea a las demás; el fallo se guarda en `last_error` y se reintenta en el siguiente ciclo. Backoff: tras 3 fallos seguidos de una suscripción, esperar 1 h antes de reintentar (contador en memoria o columna `sync_failures`; decide y documenta).
- **RF-2514** — Sincronización manual: `POST /api/v1/calendar/subscriptions/:id/refresh` (ya existe) usa el mismo motor (incremental si hay token, inicial si no) y devuelve `{ imported, updated, deleted, synced_at }`. Es la acción del botón "Sincronizar ahora" de Ajustes.
- **RF-2515** — Mapeo de eventos (función pura en `packages/domain`, `mapGoogleEvent`): de un evento de Google a `{ uid, title, startsAt, endsAt, isAllDay, timeZone, status }`:
  - Con hora: `startsAt = start.dateTime` (con su offset o `start.timeZone`); `endsAt = end.dateTime`. `timeZone = start.timeZone ?? zona del usuario`.
  - Todo el día: `isAllDay=true`; `startsAt = start.date` a las 00:00 **en la zona del usuario**; `endsAt = end.date - 1 día` a las 23:59:59 en la zona del usuario (recuerda: `end.date` de Google es exclusivo). `timeZone` = zona del usuario.
  - `title = summary ?? "(sin título)"` (igual que hoy).
  - Instancias recurrentes llegan ya expandidas (`singleEvents=true`); se guarda cada instancia con su `id` compuesto como `externalUid` y `recurringEventId` en `raw`.
  - Eventos sin `start` parseable: se descartan y se cuentan en `skipped` de la respuesta de refresh.
- **RF-2516** — Comprobación de scopes concedidos: al crear la primera suscripción Google o al fallar una lectura con 403 `insufficientPermissions`, llamar a `https://oauth2.googleapis.com/tokeninfo?access_token=...` y comprobar que el scope `https://www.googleapis.com/auth/calendar` está concedido. Si no lo está, responder `google_scope_missing` (409) con mensaje accionable ("Vuelve a conectar Google desde Ajustes > Integraciones") y la UI lo muestra con enlace a esa pantalla. (El consentimiento actual ya lo pide — `GOOGLE_SCOPES` en `google-oauth.ts` — pero el usuario pudo conceder la integración antes de que el scope existiera.)
- **RF-2517** — Robustez HTTP: timeout 8 s (patrón actual), reintento único ante 5xx o error de red con espera de 2 s, 401 → un solo refresco de token y reintento; 403/404 de un calendario concreto (p. ej. calendario al que ya no se tiene acceso) → `last_error` en la suscripción y no reintentar hasta intervención manual o siguiente ciclo programado.
- **RF-2518** — Eventos de dominio nuevos (patrón de `apps/api/src/events/domain-events.ts`): `calendar.subscription_created`, `calendar.subscription_updated`, `calendar.subscription_deleted`, `calendar.synced` (con `{ imported, updated, deleted, provider, calendar_id }`), `calendar.subscription_resynced`, `calendar.sync_failed` (con el motivo corto). Pasan por el outbox como el resto, disponibles para automatizaciones y delta sync.

### 3.3 API REST pública

Convenciones del repo (copiar de `modules/habits/` o `modules/countdowns/`): controlador con `@ApiTags`, `@Scopes`, `respondJson`, `Idempotency-Key` en POST/PATCH, DTOs con validación en `calendar.dto.ts`, `@ApiOperation` con summary que cita el RF, OpenAPI regenerado y commiteado (`apps/api/openapi.json`), SDK regenerado si procede.

- **RF-2520** — `GET /api/v1/calendar/events?from&to` (ya existe): amplía `external` con `calendar_id`, `summary` (nombre de la suscripción), `time_zone`, `location` (de `raw.location`, string o null), `description` (de `raw.description`, string o null) y `status` (`confirmed` | `cancelled` | `tentative`). Los eventos de suscripciones con `visible=false` **no se devuelven**. Mantiene `editable: false`.
- **RF-2521** — Endpoints (todos bajo `/api/v1/calendar`):
  - `GET /google/calendars` (RF-2501, scope `calendar:read`).
  - `POST /subscriptions` extendido (RF-2502, scope `calendar:write`, respeta `Idempotency-Key`).
  - `PATCH /subscriptions/:id` (RF-2503, scope `calendar:write`, respeta `Idempotency-Key`).
  - `GET /subscriptions` extendido (RF-2505, scope `calendar:read`).
  - `POST /subscriptions/:id/refresh` extendido (RF-2514, scope `calendar:write`).
  - `POST /sync` (scope `calendar:write`): sincroniza **todas** las suscripciones externas del usuario (equivalente al ciclo del scheduler, para el botón general y para agentes); respuesta `{ subscriptions: [{ id, imported, updated, deleted, error }] }`.
- **RF-2522** — Validaciones: `calendar_id` string 1–1024; `color` `#RRGGBB` o null; `summary` 1–200; errores con el formato estándar del repo (400 `validation_failed`, 404 `subscription_not_found`, 409 `google_scope_missing`, 502 `calendar_fetch_failed`, 503 `google_not_configured`).

### 3.4 MCP (servidor de agentes)

Patrón: entrada en `apps/api/src/mcp/mcp.catalog.ts` con `name`, `description` en inglés, `scopes`, `inputSchema` (helper `objectSchema`), y dispatch en `mcp.service.ts` como el resto. Los scopes `calendar:read`/`calendar:write` ya existen.

- **RF-2530** — Herramientas nuevas:
  - `list_external_calendars` (`calendar:read`) — sin parámetros obligatorios. Devuelve las suscripciones externas (provider, calendar_id, summary, color, visible, last_synced_at, last_error, event_count) y, con `include_available: true`, además los calendarios de Google disponibles para añadir (RF-2501).
  - `list_calendar_events` (`calendar:read`) — params: `from` (req, ISO), `to` (req, ISO), `include_external` (defecto true), `subscription_id` (opcional, filtra). Devuelve tareas y eventos externos del rango (mismo contrato que RF-2520).
  - `add_external_calendar` (`calendar:write`) — params: `provider` (`google` | `ical`), `calendar_id` (para google), `url` (para ical), `color`, `visible`. Crea la suscripción y lanza la sincronización inicial.
  - `sync_calendar` (`calendar:write`) — params: `subscription_id` (opcional; sin él, todas). Devuelve el resumen de RF-2514/RF-2521.
  - `update_external_calendar` (`calendar:write`) — params: `id` (req), `summary`, `color`, `visible`.
  - `remove_external_calendar` (`calendar:write`) — params: `id` (req). Borrado lógico (RF-2504).
- **RF-2531** — Las descripciones dejan claro que los eventos externos son de solo lectura y que las horas vienen en ISO 8601 con offset, en la zona del usuario cuando aplica.
- **RF-2532** — Test de catálogo (`mcp.catalog.spec.ts`): las herramientas aparecen solo con el scope correcto, igual que el test existente.

### 3.5 UI web/PWA (parecido a TickTick)

Patrones del repo: rutas en `apps/web/src/app.tsx`, features en `apps/web/src/features/`, textos en español en `apps/web/src/i18n/`, componentes compartidos en `apps/web/src/components/`, tema tipo TickTick.

- **RF-2540** — **Ajustes > Calendario**: unificar las dos definiciones de `CalendarSettings` (quedarse con una, en `features/product/ProductPages.tsx` o en un archivo propio) y añadir la sección **"Calendarios de Google"** encima de los feeds iCal:
  - Si Google no está conectado: tarjeta con el estado y enlace a Ajustes > Integraciones (reutilizar `api.integrationStatus('google')`).
  - Si está conectado: lista de calendarios de la cuenta (`GET /calendar/google/calendars`) con checkbox para activar/desactivar cada uno (activar = RF-2502; desactivar = RF-2504 con confirmación "Se ocultarán sus N eventos"), punto de color (editable con la paleta del tema), nombre editable, y por suscripción: `Última sync: hace X min`, error en rojo si `last_error`, y botón "Sincronizar ahora" (RF-2514) con spinner.
  - Interruptor por suscripción "Mostrar en el calendario" (`visible`).
  - Debajo, la sección de feeds iCal de salida exactamente como está hoy.
- **RF-2541** — **Vista Calendario** (`CalendarPage`): sustituir la consulta de tareas sueltas + `CalendarExtras` por `GET /calendar/events?from&to` para el rango visible (mes/semana/día, ya calculado en `range`):
  - Cada celda pinta sus tareas (como hoy) **y** los eventos externos como chips con el color de su calendario (borde o fondo suave `color-mix`, como `cardPaint`), con hora de inicio si no es de todo el día (`HH:mm` local).
  - Orden dentro de la celda: primero eventos de todo el día, luego por hora de inicio; tareas y eventos mezclados por hora, como TickTick.
  - Evento de varios días: se pinta en cada día que toca.
  - Clic en un evento externo: popover de **solo lectura** (título, calendario al que pertenece con su color, fecha/hora inicio-fin, todo el día, ubicación y descripción si las hay, y nota "Evento de Google Calendar · solo lectura"). Sin acciones de edición ni borrado. Reutilizar el patrón del popover/panel de tarea pero sin formulario.
  - Selector de calendarios visibles: menú junto al título (patrón `ViewMenu`) con todos los calendarios externos (punto de color + nombre + checkbox) + "Tareas". Persistir en `visible` del servidor (RF-2503), para que aplique igual en web, PWA y agentes.
  - Eliminar el render de depuración de `CalendarExtras` (los `<p>` de texto plano). El estado vacío solo se muestra si no hay suscripciones y enlaza a Ajustes > Calendario.
- **RF-2542** — **Vista Hoy**: sección "Agenda de hoy" con los eventos externos de hoy ordenados por hora: hora o "Todo el día", título, punto de color del calendario. Clic → mismo popover de solo lectura. Si no hay eventos, la sección no se muestra.
- **RF-2543** — Offline: los eventos externos se cachean con el patrón offline del repo (TanStack Query) y se ven sin conexión; las acciones de suscripción (añadir/quitar/sincronizar) requieren conexión y muestran el aviso estándar offline.
- **RF-2544** — Estados y textos nuevos en `i18n` (español): "Calendarios de Google", "Conecta Google en Integraciones para añadir calendarios", "Sincronizar ahora", "Última sync: {{relativo}}", "Error al sincronizar", "Evento de Google Calendar · solo lectura", "Agenda de hoy", "Todo el día", vacío "Aún no has añadido calendarios externos".

### 3.6 Integración ligera con el resto del producto

- **RF-2550** — El dashboard del jardín digital **no** cambia en esta entrega.
- **RF-2551** — El reporte semanal honesto (`modules/reports`) añade una línea opcional: número de eventos externos de la semana entrante (próximos 7 días). Solo si es trivial; si no, anotarlo como pendiente.
- **RF-2552** — Las automatizaciones pueden usar como disparador los eventos de dominio de §3.2 (`calendar.synced`, `calendar.sync_failed`) sin trabajo adicional; solo documentarlo en `docs/` si el catálogo de disparadores se lista en algún sitio.

### 3.7 Lo que NO cambia

- El push de tareas a Google (RF-2004, `push()` en `calendar.service.ts`): se mantiene igual. Único cambio permitido: que use el mismo helper de cliente Google del §5 si se extrae, sin cambiar su comportamiento.
- Feeds iCal de salida, suscripciones iCal (salvo pasarlas por el mismo ciclo programado de RF-2513), countdowns, Telegram, MCP existente.

---

## 4. Modelo de datos (migración Prisma)

Extender `CalendarSubscription` y `ExternalEvent` (no crear tablas nuevas). Migración con `pnpm db:migrate`, nombre sugerido `google_calendar_sync`:

```prisma
model CalendarSubscription {
  id            String                @id @default(uuid()) @db.Uuid
  ownerId       String                @map("owner_id") @db.Uuid
  owner         User                  @relation(fields: [ownerId], references: [id], onDelete: Restrict)
  url           String?
  provider      String?
  calendarId    String?               @map("calendar_id")        // id real del calendario de Google (RF-2502)
  summary       String?               // nombre visible (RF-2503)
  visible       Boolean               @default(true)
  syncDirection CalendarSyncDirection @default(read) @map("sync_direction")
  color         String?
  syncToken     String?               @map("sync_token")         // RF-2510/2511
  lastSyncedAt  DateTime?             @map("last_synced_at") @db.Timestamptz(6)
  lastError     String?               @map("last_error")         // RF-2505/2517
  createdAt     DateTime              @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime              @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt     DateTime?             @map("deleted_at") @db.Timestamptz(6)
  events        ExternalEvent[]

  @@unique([ownerId, provider, calendarId]) // idempotencia de altas (RF-2502); ojo: calendarId nullable
  @@index([ownerId])
  @@map("calendar_subscriptions")
}

model ExternalEvent {
  id             String               @id @default(uuid()) @db.Uuid
  ownerId        String               @map("owner_id") @db.Uuid
  owner          User                 @relation(fields: [ownerId], references: [id], onDelete: Restrict)
  subscriptionId String               @map("subscription_id") @db.Uuid
  subscription   CalendarSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  externalUid    String               @map("external_uid")
  title          String
  startsAt       DateTime             @map("starts_at") @db.Timestamptz(6)
  endsAt         DateTime?            @map("ends_at") @db.Timestamptz(6)
  isAllDay       Boolean              @default(false) @map("is_all_day")
  timeZone       String               @default("Europe/Madrid") @map("time_zone")
  status         String               @default("confirmed")   // confirmed | tentative | cancelled
  raw            Json                 @default("{}")
  createdAt      DateTime             @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime             @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt      DateTime?            @map("deleted_at") @db.Timestamptz(6)

  @@unique([subscriptionId, externalUid])
  @@index([ownerId, startsAt])
  @@map("external_events")
}
```

Notas de implementación:

- El unique `[ownerId, provider, calendarId]` con `calendarId` nullable: en Postgres los NULL no colisionan, así que las suscripciones iCal (sin `calendarId`) no se ven afectadas. Si Prisma se resiste, índice único parcial vía SQL en la migración; documenta lo elegido.
- Migración de datos: las suscripciones `provider='google'` existentes (si las hay) quedan con `calendarId = null`; al primer refresh se resuelve el id del calendario primario y se guarda (RF-2502).
- `ExternalEvent.status`: la incremental marca cancelaciones con `deletedAt`; el campo `status` se guarda para UI/depuración (`cancelled` llega en la incremental antes de marcarse).
- No se guarda ningún token en estas tablas: el refresh token sigue en `User.googleRefreshToken` cifrado, como hoy.

---

## 5. Arquitectura y puntos de extensión (mapa de archivos)

Nuevos:

- `apps/api/src/integrations/google-calendar.ts` — cliente fino de Google Calendar: `listCalendars(accessToken)`, `listEvents(accessToken, calendarId, opts)` (paginación, syncToken, errores tipados 410/401/403), `tokenScopes(accessToken)` (RF-2516). Reutiliza `exchangeGoogleRefreshToken` de `integrations/google-token.ts`. Timeout 8 s, fetch nativo, sin librería de Google.
- `apps/api/src/modules/calendar/google-sync.service.ts` — motor de sincronización (RF-2510..2517) si `calendar.service.ts` crece demasiado (recomendado: extraer; hoy ya tiene ~600 líneas).
- `packages/domain/src/google-events.ts` — `mapGoogleEvent` (RF-2515) + tests.
- `apps/api/src/modules/calendar/calendar-sync.spec.ts` y tests de integración en `apps/api/test/`.
- `apps/web/src/features/settings/GoogleCalendarsCard.tsx` (sección de Ajustes > Calendario) + estilos.
- `apps/web/e2e/calendar-google.spec.ts`.

A tocar:

- `apps/api/prisma/schema.prisma` + migración nueva.
- `apps/api/src/modules/calendar/calendar.controller.ts` (endpoints RF-2521) y `calendar.service.ts` (o el servicio extraído).
- `apps/api/src/modules/calendar/calendar.dto.ts`.
- `apps/api/src/scheduler/scheduler.service.ts` (ciclo de RF-2513; extraer a `calendar-sync.ts` si crece).
- `apps/api/src/mcp/mcp.catalog.ts` + `mcp.service.ts` (6 herramientas, RF-2530) y `mcp.catalog.spec.ts`.
- `apps/api/src/events/domain-events.ts` (eventos RF-2518).
- `apps/api/openapi.json` (regenerar) y `packages/sdk/` si se genera desde OpenAPI.
- `apps/web/src/features/places/Places.tsx` (`CalendarPage`, eliminar `CalendarExtras` actual) o extraer calendario a `apps/web/src/features/calendar/` si el archivo es ya demasiado grande (recomendado).
- `apps/web/src/features/product/ProductPages.tsx` (`CalendarSettings` real) y eliminar la definición duplicada de `Places.tsx` (~línea 1350).
- `apps/web/src/features/today/TodayPage.tsx` (sección Agenda de hoy, RF-2542).
- `apps/web/src/i18n/` (textos RF-2544).
- `docs/spec/especificacion-producto-v1.1.md`: actualizar la sección de calendarios (RF-200x) con un resumen de esta funcionalidad y enlace a este documento.

---

## 6. Detalles de diseño

### 6.1 Zona horaria

La zona del usuario es `settings.timezone` (defecto `Europe/Madrid`). Se pasa como `timeZone` en las lecturas iniciales para que Google normalice las horas; además se guarda `start.timeZone` de cada evento en `ExternalEvent.timeZone`. Los eventos de todo el día son de fecha civil: nunca se convierten con offset UTC (un cambio de hora de verano no puede moverlos). La API devuelve ISO 8601 con offset; la web formatea en local.

### 6.2 Ventana y volumen

Sincronización inicial: -30 días / +12 meses (los eventos antiguos fuera de ventana no se importan; si hace falta más histórico, decisión futura). Un usuario normal: < 5.000 instancias por calendario y ventana; con `maxResults=2500` y paginación cabe. La incremental no tiene ventana (solo cambios).

### 6.3 Colores

Google da `backgroundColor` hex por calendario. Se guarda tal cual en `CalendarSubscription.color` (el modelo ya admite hex; `cardPaint` ya valida `#RGB`/`#RRGGBB`). Si el usuario lo cambia en local, manda el local. No se sincroniza el color hacia Google.

### 6.4 Ejemplos de payload

`POST /api/v1/calendar/subscriptions`:

```json
{ "provider": "google", "calendar_id": "usuario@gmail.com", "color": "#4772FA" }
```

Respuesta 201:

```json
{
  "id": "8f3d...",
  "provider": "google",
  "calendar_id": "usuario@gmail.com",
  "summary": "Personal",
  "color": "#4772FA",
  "visible": true,
  "last_synced_at": "2026-10-19T18:10:00+02:00",
  "imported": 214
}
```

`GET /api/v1/calendar/events?from=2026-10-19T00:00:00+02:00&to=2026-10-20T00:00:00+02:00` (fragmento):

```json
{
  "tasks": [{ "id": "...", "title": "Recoger a los niños...", "editable": true }],
  "external": [
    {
      "id": "evt-1",
      "title": "Reunión de equipo",
      "starts_at": "2026-10-19T10:00:00+02:00",
      "ends_at": "2026-10-19T11:00:00+02:00",
      "is_all_day": false,
      "time_zone": "Europe/Madrid",
      "color": "#4772FA",
      "provider": "google",
      "calendar_id": "usuario@gmail.com",
      "summary": "Personal",
      "location": null,
      "description": null,
      "status": "confirmed",
      "editable": false
    }
  ]
}
```

### 6.5 Preparado para push de Google (futuro, no implementar)

Diseñar el motor para que luego quepa `events.watch` (canal webhook por suscripción): guardar en el PR una nota de dónde irían `channelId`/`channelExpiration` (columnas nuevas en `CalendarSubscription`) y qué endpoint público recibiría los pings (reutilizaría `POST /subscriptions/:id/refresh`). Solo nota en el PR, sin código muerto.

### 6.6 Seguridad y privacidad

- Nunca loguear access ni refresh tokens; los errores guardan solo código y mensaje corto (RF-2517).
- El `raw` del evento puede contener asistentes y descripción: se guarda en la base de datos del propio usuario (mismo criterio que el resto de sus datos); los endpoints públicos solo exponen los campos de RF-2520 (no `raw` completo).
- `calendar_id` se trata como dato del usuario; todas las consultas filtran por `ownerId` (patrón actual).
- Las lecturas a Google van a hosts fijos de Google; no aplicar `safeFetch` (es para URLs de usuario) pero sí timeout y validación de forma de respuesta.

---

## 7. Casos límite (obligatorios en tests)

1. Evento de todo el día de 1 día: `end.date` exclusivo → se pinta solo el día correcto (ni el anterior ni el siguiente).
2. Evento de todo el día de varios días: se pinta en todos los días que toca.
3. Evento con hora cruzando medianoche local.
4. Recurrente semanal: se expande en instancias; al mover una instancia en Google, la incremental actualiza solo esa.
5. Evento borrado en Google: llega `cancelled` en la incremental → desaparece de la UI tras sincronizar.
6. `syncToken` caducado (410): resync completo, sin duplicados ni eventos fantasma.
7. Cambio de hora de verano (marzo/octubre, Europe/Madrid): un evento de las 09:00 sigue a las 09:00 local.
8. Dos calendarios de Google con eventos a la misma hora: ambos se pintan, cada uno con su color.
9. Suscripción con `visible=false`: sus eventos no salen en `/calendar/events` ni en Hoy, pero siguen en BD.
10. Google desconectado (DELETE /integrations/google) con suscripciones activas: las sincronizaciones fallan con `google_not_configured` en `last_error`, sin romper el scheduler ni la UI.
11. Calendario compartido al que se pierde acceso (404/403): `last_error` y sin reintentos agresivos (RF-2517).
12. Evento sin título → "(sin título)"; evento sin `end` → `endsAt = startsAt + 1 h` (decisión documentada).
13. Alta duplicada del mismo `calendar_id` → devuelve la suscripción existente (RF-2502).
14. Paginación: calendario con > 2.500 eventos en la ventana se importa entero.

---

## 8. Tests

- **Unitarios (dominio)**: `mapGoogleEvent` con los casos 1, 2, 3, 5, 7 y 12 (eventos sintéticos; reutilizar el estilo de los tests de `parseIcal`).
- **Unitarios (API)**: motor de sync con `fetch` mockeado: inicial con 2 páginas + `nextSyncToken`; incremental con altas/cambios/cancelaciones; 410 → resync; 403 scope → `google_scope_missing`; duplicados.
- **Integración (`apps/api/test/`)**: endpoints RF-2521 con suscripción iCal existente para verificar que no se rompe nada, y flujo Google con `google-calendar.ts` mockeado en el borde.
- **Catálogo MCP** (RF-2532).
- **Playwright (`apps/web/e2e/calendar-google.spec.ts`)**: con API mockeada — Ajustes lista calendarios y permite activar uno; la vista mes pinta un evento externo con su color; el popover es de solo lectura; Hoy muestra la agenda del día.
- **Verificación en vivo (manual, la hace el propietario)**: conectar su cuenta real, activar su calendario, comprobar que el evento real de hoy aparece en Calendario y en Hoy, mover un evento en Google y ver el cambio tras "Sincronizar ahora".

---

## 9. Criterios de aceptación

1. En Ajustes > Calendario veo mis calendarios de Google y activo uno; sin recargar, aparece como suscripción con color y contador de eventos.
2. La vista Calendario (mes/semana/día) pinta los eventos de Google con el color de su calendario, mezclados con las tareas, y ninguno es editable (popover solo lectura).
3. La vista Hoy muestra los eventos externos de hoy.
4. "Sincronizar ahora" refleja en < 5 s un cambio hecho en Google Calendar (mover, crear, borrar).
5. La sincronización automática ocurre al menos cada 15 min sin tocar nada (visible en "Última sync").
6. Borrar un evento en Google lo quita de tick-tack-done tras la siguiente sincronización.
7. Un evento de todo el día aparece exactamente en su día (ni un día antes ni después).
8. Los eventos de un calendario oculto desaparecen de la UI y de la API, y vuelven al reactivarlo.
9. MCP: `list_external_calendars` y `list_calendar_events` funcionan con un PAT con `calendar:read` y se rechazan (403) sin él.
10. `pnpm test`, integration tests y Playwright en verde; OpenAPI y SDK regenerados y commiteados.

---

## 10. Plan de implementación sugerido (PRs pequeños)

1. **PR 1 — Dominio y migración**: `mapGoogleEvent` + tests, migración Prisma, eventos de dominio. Sin cambiar comportamiento.
2. **PR 2 — Cliente Google + motor de sync** (`google-calendar.ts`, `google-sync.service.ts`, RF-2510..2517) con tests unitarios; el `refreshGoogle` actual pasa a usar el motor.
3. **PR 3 — API REST** (RF-2501..2505, RF-2520..2522) + OpenAPI/SDK + integración.
4. **PR 4 — Scheduler** (RF-2513).
5. **PR 5 — MCP** (RF-2530..2532).
6. **PR 6 — UI Ajustes** (RF-2540) y **PR 7 — UI Calendario + Hoy** (RF-2541..2544). Pueden ir en uno si salen pequeños.
7. **PR 8 — Docs**: actualizar `especificacion-producto-v1.1.md` y nota de §6.5.

---

## 11. Decisiones tomadas (no preguntar)

- **Solo lectura**: los eventos de Google no se editan ni borran desde tick-tack-done. El push de tareas existente (RF-2004) es lo único que escribe en Google.
- **Multi-calendario desde el primer día**: nada de "solo primary"; el `calendar_id` real se guarda siempre.
- **Incremental con `syncToken`** y polling de 15 min; sin webhooks de Google en esta entrega.
- **Ventana inicial**: -30 días / +12 meses.
- **Visibilidad en servidor** (`visible` en la suscripción), no solo en el navegador, para que aplique igual en web, PWA y agentes.
- **Color por defecto** = el de Google; editable en local; no se devuelve a Google.
- **Textos de la UI en español**; descripciones de herramientas MCP en inglés (convención actual).
- **Sin librería de Google**: fetch nativo, patrón del repo.
- Si algo choca con la spec del calendario corporativo JSON (`spec-calendario-json`), ambos conviven como `provider` distintos sobre `ExternalEvent`; no unificar en esta entrega.
