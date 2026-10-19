# Especificación funcional: Countdown (cuenta atrás) para tick-tack-done

**Versión:** 1.0 — 19 oct 2026
**Destinatario:** agente de desarrollo (Cursor) trabajando sobre `github.com/povedica/tick-tack-done`
**Estilo:** sigue las convenciones de `docs/spec/especificacion-producto-v1.1.md` y `docs/spec/tick-tack-done-ui-spec-v1.0.md` (requisitos RF numerados, modelo Prisma, API REST bajo `/api/v1`, herramientas MCP, UI web/PWA muy parecida a TickTick).

---

## 0. Cómo leer este documento

- Es una especificación **one-shot**: contiene todo lo necesario para implementar la funcionalidad sin preguntar nada más. Si algo te parece ambiguo, elige la opción que se parezca más a TickTick y déjalo anotado en el PR.
- Cada requisito tiene un identificador `RF-24xx` (rango nuevo; el 24 no está usado en la especificación de producto). Los tests de aceptación referencian estos identificadores.
- Rutas de archivo referenciadas relativas a la raíz del repo.
- **No rompas nada existente**: la suite actual (`pnpm test`, integration tests de `apps/api`, Playwright de `apps/web`) debe seguir en verde al final.

---

## 1. Estado actual y objetivo

### 1.1 Lo que ya existe (verificado en el repo, 19 oct 2026)

- El modelo Prisma `Countdown` **ya está migrado** (`apps/api/prisma/schema.prisma`, línea ~740) con los campos mínimos de la spec de producto §5.15:
  `id`, `ownerId`, `title`, `targetDate` (`@db.Date`), `color`, `showInSidebar`, `createdAt`, `updatedAt`, `deletedAt`.
- `account.service.ts` ya borra countdowns en cascada al eliminar la cuenta (`tx.countdown.deleteMany`).
- **No existe nada más**: no hay módulo API (`apps/api/src/modules/` no tiene `countdowns/`), no hay endpoints en `apps/api/openapi.json`, no hay herramientas MCP en `apps/api/src/mcp/mcp.catalog.ts`, no hay UI en `apps/web/src/`, no hay eventos de dominio, ni recordatorios, ni entrada en la barra lateral.

### 1.2 Objetivo

Llevar Countdown a paridad funcional con TickTick (`https://ticktick.com/webapp/#countdown`), con las extensiones propias de tick-tack-done: **disponible también por API REST y por MCP** (requisito explícito del propietario), recordatorios multicanal (push/email/Telegram) y eventos de dominio para automatizaciones.

### 1.3 No objetivos (fuera de esta entrega)

- Plantillas de tarjeta premium de TickTick (foto tipo polaroid, degradados con marco): solo se guarda el campo `style` para futuro; el MVP pinta color sólido.
- Compartir countdowns con otros usuarios (la colaboración es V2 global del producto).
- Widget de pantalla de inicio del móvil (la PWA no lo soporta; el widget es dentro del dashboard de la app).
- Importar countdowns desde TickTick (no hay importador en el producto; se crean a mano o por API/MCP).

---

## 2. Referencia observada: Countdown en TickTick (19 oct 2026)

Observado en vivo en la cuenta del propietario (solo lectura, sin crear ni modificar datos):

**Vista principal** (`#countdown`): rejilla de tarjetas. Cada tarjeta muestra icono/emoji + título, un número grande de días y debajo `Days until DD/MM/YYYY` (fecha futura) o `Days since DD/MM/YYYY` (fecha pasada: cuenta hacia arriba). Al pasar el ratón la tarjeta muestra iconos de fijar (pin) y menú. Cabecera: título `Countdown` con desplegable **Active / Archived**, botón **+** y menú **···** con opción **Show Group**.

**Menú +** (crear): cuatro tipos — **Countdown, Anniversary, Birthday, Holiday**.

**Diálogo de creación/edición**:
- Selector de emoji/icono (a la izquierda del nombre).
- `Name`.
- `Date` (mes/día/año).
- `Reminder`: multiselección — *On the day (09:00)*, *1 day early (09:00)*, *2 days early (09:00)*, *3 days early (09:00)*, *1 week early (09:00)*, *Custom*; más interruptor **Constant Reminder**.
- `Repeat`: *None, Daily, Weekly (día), Monthly (día), Yearly (fecha), Custom*.
- `Type`: los cuatro tipos anteriores.
- `Day Calculation Mode`: *Standard* («Day 1 starts the day after selected date») y *Standard +1 day* («Day 1 starts on selected date»).
- `Show`: *Show on the day in the Smart List*.

**Menú contextual de tarjeta**: *Edit, Style, Notes, Archive, Delete*. El diálogo **Style** muestra una vista previa, una fila de plantillas de tarjeta (varias premium) y una paleta de ~13 colores (incluye "sin color" y multicolor).

El propietario usa hoy 6 countdowns reales en TickTick, tanto futuros ("Days until") como pasados ("Days since"), con emojis y estilos de color distintos.

---

## 3. Alcance funcional (RF)

### 3.1 CRUD y ciclo de vida

- **RF-2401** — CRUD completo de countdowns: crear, listar (activos y archivados por separado), leer uno, editar, borrar (borrado lógico con `deletedAt`, igual que el resto del dominio).
- **RF-2402** — Campos: `title`, `type` (`countdown` | `anniversary` | `birthday` | `holiday`), `emoji` (un emoji o null), `targetDate` (fecha sin hora), `color` (token de paleta o null), `style` (texto libre, reservado para plantillas futuras; por defecto null), `notes` (texto largo opcional), `dayMode` (`standard` | `plus_one`), `showInSidebar` (bool, ya existe), `showInSmartList` (bool, por defecto true), `pinned` (bool, por defecto false), `sortOrder` (entero para orden manual), `archivedAt` (timestamp o null).
- **RF-2403** — Archivar y desarchivar (`archivedAt`). Un countdown archivado no aparece en la vista Active, no dispara recordatorios nuevos y no aparece en Hoy ni en el dashboard; sigue existiendo y se puede desarchivar.
- **RF-2404** — Fijar (pin): los fijados van primero en la rejilla, ordenados por `sortOrder` y después por proximidad de fecha; el resto, por proximidad de fecha (los pasados, al final, ordenados por antigüedad descendente... ver RF-2411 para el criterio exacto).
- **RF-2405** — Borrado lógico con restauración desde la papelera si la papelera global del producto lo contempla; si no, basta con soft-delete + endpoint de restaurar, igual que tareas (`task.restored` ya existe como patrón).

### 3.2 Cálculo de días

- **RF-2410** — La fecha es **solo día** (sin hora), interpretada en la zona horaria del usuario (`settings.timezone`; por defecto `Europe/Madrid`). Un cambio de hora de verano nunca puede mover el contador.
- **RF-2411** — Contador mostrado:
  - Fecha futura: `daysUntil = targetDate − hoy` en días naturales. El día D muestra `0` («¡Hoy!» en la UI, no «0»).
  - Fecha pasada (sin repetición): `daysSince = hoy − targetDate` («Days since», cuenta hacia arriba).
  - `dayMode = standard`: el cómputo "día 1" empieza al día siguiente de `targetDate` (paridad TickTick: `daysSince` el día D+1 muestra 1). `dayMode = plus_one`: el día D ya cuenta como día 1 (`daysSince` el día D muestra 1; `daysUntil` el día D-1 muestra 2). Implementación: `plus_one` equivale a sumar 1 al resultado de `standard` en ambos sentidos.
- **RF-2412** — Repetición (`repeatRule`, ver §4): cuando hay repetición, el contador **siempre mira a la próxima ocurrencia futura o de hoy** y nunca entra en modo "days since": al llegar el día D, muestra «¡Hoy!» y al día siguiente vuelve a contar hacia la ocurrencia siguiente. `anniversary` y `birthday` llevan repetición anual por defecto (se puede quitar); `holiday` y `countdown` llevan `none` por defecto.
- **RF-2413** — Repeticiones soportadas: `none`, `daily`, `weekly` (día de semana de `targetDate`), `monthly` (día del mes de `targetDate`; si el mes no tiene ese día, último día del mes), `yearly` (misma fecha; **29 de febrero → 28 de febrero en años no bisiestos**). Sin repetición "custom" en esta entrega (queda el campo preparado).
- **RF-2414** — Función pura en `packages/domain`: `nextOccurrence(targetDate, repeatRule, dayMode, today, timezone)` y `daysLabel(countdown, today, timezone) → { kind: 'until' | 'since' | 'today', days: number }`. Todo el cálculo pasa por ahí: API, scheduler y web la usan; la web la recibe ya calculada por la API (`days`, `kind`, `effectiveDate` de la próxima ocurrencia) para no duplicar lógica de zona horaria.

### 3.3 Recordatorios y notificaciones

- **RF-2420** — Cada countdown puede tener varios recordatorios por **adelanto**: `on_day`, `1d`, `2d`, `3d`, `1w` o `custom` (número de días antes, 1–365). Hora de disparo: 09:00 hora local del usuario (misma convención que TickTick; configurable a nivel usuario en el futuro, no en esta entrega).
- **RF-2421** — Interruptor **recordatorio constante** (`constantReminder`): si está activo, desde 3 días antes de la fecha (o desde su creación si falta menos) recuerda 1 vez al día a las 09:00 hasta el día D inclusive. Se apaga solo el día D+1 (o al archivar/borrar).
- **RF-2422** — Los recordatorios de countdown se integran en el **scheduler existente** (`apps/api/src/scheduler/scheduler.service.ts`, tick de 60 s) y se entregan por el **ReminderTransport** actual (push + email + Telegram, según configuración del usuario), reutilizando `ReminderDelivery` para trazabilidad. Formato del mensaje: `⏳ <emoji> <título>: ¡es hoy!` / `…: quedan N días` / Telegram admite el emoji tal cual.
- **RF-2423** — Con repetición, los recordatorios se recalculan para la próxima ocurrencia tras cada disparo del día D (no se disparan dos veces en la misma ocurrencia: deduplicar por `(countdownId, occurrenceDate, offset)`).
- **RF-2424** — Al editar `targetDate`, `repeatRule` o los recordatorios, se reprograman los pendientes de ese countdown (los ya entregados quedan en el histórico).
- **RF-2425** — Eventos de dominio nuevos (patrón `task.*`, `habit.*` de `apps/api/src/events/domain-events.ts`): `countdown.created`, `countdown.updated`, `countdown.deleted`, `countdown.archived`, `countdown.unarchived`, `countdown.reached` (el día D) y `countdown.reminder_due`. Todos pasan por el outbox y quedan disponibles para automatizaciones y para el delta sync.

### 3.4 API REST pública

Convenciones del repo (copiar de `modules/habits/`): controlador con `@ApiTags`, `@Scopes`, `respondJson`, paginación por cursor (`pageLimit`), `Idempotency-Key` en POST/PATCH, ETag/validación condicional si el módulo de referencia lo hace, DTOs con validación en `<modulo>.dto.ts`, `@ApiOperation` con summary que cita el RF.

- **RF-2430** — Scopes nuevos en `apps/api/src/auth/scopes.ts`: `countdowns:read` y `countdowns:write` (se conceden por defecto a los PAT nuevos solo si el usuario los marca, como el resto; los PAT existentes no los reciben automáticamente).
- **RF-2431** — Endpoints bajo `/api/v1`:
  - `GET /countdowns?archived=false&limit=&cursor=` → página de countdowns (cada uno con `days`, `kind`, `effectiveDate` calculados).
  - `POST /countdowns` → crear (201; respeta `Idempotency-Key`).
  - `GET /countdowns/:id` → uno.
  - `PATCH /countdowns/:id` → editar (incluye `pinned`, `sortOrder`, recordatorios).
  - `DELETE /countdowns/:id` → borrado lógico.
  - `POST /countdowns/:id/archive` y `POST /countdowns/:id/unarchive`.
  - `POST /countdowns/:id/restore` (desde papelera), si el patrón de tareas lo tiene; si no, omitir y anotarlo.
- **RF-2432** — Validaciones: `title` 1–200 caracteres; `targetDate` fecha ISO válida (`YYYY-MM-DD`); `emoji` un solo grafema; `color` uno de los tokens de la paleta (§6.3) o null; `reminders` máximo 8 por countdown, offsets únicos; errores 422 con el formato de error estándar del repo.
- **RF-2433** — El OpenAPI generado (`apps/api/openapi.json`) se regenera y queda commiteado, como ya hace el repo.
- **RF-2434** — `GET /countdowns` admite `?dueWithinDays=N` (devuelve solo los que llegan en ≤ N días, próxima ocurrencia) — pensado para el dashboard, Hoy y agentes.

### 3.5 MCP (servidor de agentes)

Patrón: entrada en `apps/api/src/mcp/mcp.catalog.ts` con `name`, `description`, `scopes`, `inputSchema` (helper `objectSchema`), y dispatch en el servicio MCP como el resto de herramientas.

- **RF-2440** — Herramientas nuevas:
  - `list_countdowns` (scope `countdowns:read`) — params: `archived`, `limit`, `cursor`, `due_within_days`. Devuelve id, título, tipo, emoji, fecha, `days`, `kind`, `effectiveDate`.
  - `get_countdown` (`countdowns:read`) — params: `id`.
  - `create_countdown` (`countdowns:write`) — params: `title` (req), `target_date` (req, `YYYY-MM-DD`), `type`, `emoji`, `color`, `repeat`, `day_mode`, `reminders` (array de offsets), `notes`, `show_in_sidebar`, `show_in_smart_list`.
  - `update_countdown` (`countdowns:write`) — params: `id` (req) + cualquier campo editable.
  - `delete_countdown` (`countdowns:write`) — params: `id`.
  - `archive_countdown` / `unarchive_countdown` (`countdowns:write`) — params: `id`.
- **RF-2441** — Las descripciones de las herramientas van en inglés (como las existentes) y deben dejar claro que `days` ya viene calculado en la zona horaria del usuario.
- **RF-2442** — Test de catálogo (`mcp.catalog.spec.ts`): las herramientas aparecen solo con el scope correcto, igual que el test existente para `tasks`.

### 3.6 UI web/PWA (parecido a TickTick)

Patrones del repo: rutas en `apps/web/src/app.tsx`, features en `apps/web/src/features/<nombre>/`, textos en `apps/web/src/i18n/` (la app está en español; TickTick se muestra en inglés en las capturas — **los textos de esta funcionalidad van en español**), componentes compartidos en `apps/web/src/components/` (`Popover.tsx`, `ViewMenu.tsx`, `UndoToast.tsx`), estilos propios por feature (`today.css` como referencia). Tema actual: look tipo TickTick.

- **RF-2450** — Ruta nueva `/countdowns` con página `CountdownsPage` y entrada en la barra lateral (icono ⏳, debajo de Hábitos) **solo si** existe al menos un countdown con `showInSidebar` o el usuario la fija; la ruta siempre funciona aunque no haya entrada. Orden de la entrada según la barra actual.
- **RF-2451** — Rejilla de tarjetas responsive (4 columnas en escritorio ancho, 2 en móvil). Tarjeta: emoji + título arriba, número grande de días centrado, y debajo `Faltan N días · DD/MM/YYYY` / `Han pasado N días · DD/MM/YYYY` / destacado especial `¡Es hoy!` cuando `kind = today`. Color de tarjeta = `color` (paleta §6.3); el número en color de acento cuando la tarjeta es blanca (como TickTick).
- **RF-2452** — Cabecera: título `Cuenta atrás` con desplegable **Activos / Archivados**; botón **+** con menú de los 4 tipos (Cuenta atrás, Aniversario, Cumpleaños, Festivo); menú **···** con `Agrupar por tipo` (Show Group): agrupa las tarjetas por tipo con encabezados.
- **RF-2453** — Diálogo de creación/edición (modal centrado, patrón de los diálogos existentes): emoji (selector simple con input de emoji nativo), nombre, fecha (date picker existente), recordatorios (multiselección con las opciones de RF-2420 + personalizado N días + interruptor "recordatorio constante"), repetición (Ninguna/Diaria/Semanal/Mensual/Anual), tipo, modo de cálculo (Estándar / Estándar +1 día, con la descripción corta como TickTick), y checkbox `Mostrar el día D en Hoy`.
- **RF-2454** — Menú contextual de tarjeta (clic derecho y botón ··· en hover, reutilizar `TaskContextMenu` como referencia): Editar, Estilo (color), Notas, Fijar/Desfijar, Archivar, Eliminar (con confirmación y `UndoToast` de deshacer como en tareas).
- **RF-2455** — Vista Archivados: misma rejilla, con acciones Desarchivar y Eliminar.
- **RF-2456** — **Hoy**: un countdown con `showInSmartList` y `kind = today` aparece en la vista Hoy como una tarjeta informativa arriba (no es una tarea; no se completa, enlaza a `/countdowns`). Además, los countdowns con `dueWithinDays <= 7` aparecen en una sección discreta "Próximas fechas" al final de Hoy (opcional configurable; por defecto activada).
- **RF-2457** — **Dashboard**: widget nuevo `next_countdowns` (título "Cuenta atrás") con los 3 más próximos (emoji, título, días). Se registra en `dashboard/widgets` como el resto de widgets y entra en `DashboardLayout` por defecto al final.
- **RF-2458** — Offline: la rejilla se puede ver offline con los datos cacheados (patrón offline-first del repo: cola de mutaciones con `Idempotency-Key`); crear/editar offline se encola y se sincroniza al reconectar.
- **RF-2459** — Estados vacíos: sin countdowns → ilustración/texto "Crea tu primera cuenta atrás" + botón; Archivados vacío → "Nada archivado".

### 3.7 Reporte semanal y revisión (integración ligera)

- **RF-2460** — El reporte semanal honesto (`modules/reports`) añade una línea opcional: countdowns que llegan en los próximos 7 días y los que "llegaron" esta semana. Sin métricas nuevas en el dashboard de KPIs de jardín digital en esta entrega.

---

## 4. Modelo de datos (migración Prisma)

Extender el modelo existente (no crear tabla nueva). Migración con `pnpm db:migrate` (`prisma migrate dev`), nombre sugerido `countdown_full_feature`:

```prisma
enum CountdownType {
  countdown
  anniversary
  birthday
  holiday
}

enum CountdownDayMode {
  standard
  plus_one
}

enum CountdownRepeat {
  none
  daily
  weekly
  monthly
  yearly
}

model Countdown {
  id              String            @id @default(uuid()) @db.Uuid
  ownerId         String            @map("owner_id") @db.Uuid
  owner           User              @relation(fields: [ownerId], references: [id], onDelete: Restrict)
  title           String
  type            CountdownType     @default(countdown)
  emoji           String?
  targetDate      DateTime          @map("target_date") @db.Date
  repeatRule      CountdownRepeat   @default(none) @map("repeat_rule")
  dayMode         CountdownDayMode  @default(standard) @map("day_mode")
  color           String?
  style           String?
  notes           String?
  showInSidebar   Boolean           @default(true) @map("show_in_sidebar")
  showInSmartList Boolean           @default(true) @map("show_in_smart_list")
  pinned          Boolean           @default(false)
  sortOrder       Int               @default(0) @map("sort_order")
  archivedAt      DateTime?         @map("archived_at") @db.Timestamptz(6)
  createdAt       DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt       DateTime?         @map("deleted_at") @db.Timestamptz(6)
  reminders       CountdownReminder[]

  @@index([ownerId])
  @@index([targetDate])
  @@map("countdowns")
}

model CountdownReminder {
  id          String    @id @default(uuid()) @db.Uuid
  countdownId String    @map("countdown_id") @db.Uuid
  countdown   Countdown @relation(fields: [countdownId], references: [id], onDelete: Cascade)
  offsetDays  Int       @map("offset_days") // 0 = el día D, 1..7 predefinidos, hasta 365 en custom
  constant    Boolean   @default(false)     // RF-2421 (máx. una fila con constant=true por countdown)
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([countdownId, offsetDays, constant])
  @@map("countdown_reminders")
}
```

Notas de implementación:
- `targetDate` sigue siendo `@db.Date` (sin hora) — la hora de disparo la calcula el scheduler (09:00 local).
- Reutilizar `ReminderDelivery` para registrar entregas si el modelo lo permite con una referencia genérica; si está acoplado a `Reminder` de tareas, crear `CountdownReminderDelivery` análogo (decisión del implementador, documentarla en el PR).
- `onDelete: Restrict` del owner se mantiene; el borrado de cuenta ya hace `deleteMany` en `account.service.ts` — añadir también `countdownReminder.deleteMany` en la misma transacción.

---

## 5. Arquitectura y puntos de extensión (mapa de archivos)

Nuevos:
- `apps/api/src/modules/countdowns/countdowns.module.ts`
- `apps/api/src/modules/countdowns/countdowns.controller.ts`
- `apps/api/src/modules/countdowns/countdowns.service.ts`
- `apps/api/src/modules/countdowns/countdowns.dto.ts`
- `apps/api/src/modules/countdowns/countdowns.service.spec.ts` (+ integration test en `apps/api/test/`)
- `apps/web/src/features/countdowns/` (`CountdownsPage.tsx`, `CountdownCard.tsx`, `CountdownDialog.tsx`, `CountdownStylePopover.tsx`, `api.ts`, `countdowns.css`, `next.spec.ts`)
- `apps/web/e2e/countdowns.spec.ts`

A tocar:
- `apps/api/prisma/schema.prisma` + migración nueva.
- `apps/api/src/auth/scopes.ts` (scopes nuevos) y su spec.
- `apps/api/src/mcp/mcp.catalog.ts` y dispatch (7 herramientas).
- `apps/api/src/scheduler/scheduler.service.ts` (tick de countdowns; extraer a `countdown-reminders.ts` si crece).
- `apps/api/src/events/domain-events.ts` (eventos nuevos).
- `apps/api/src/app.module.ts` (registrar el módulo).
- `apps/api/openapi.json` (regenerar).
- `apps/web/src/app.tsx` (ruta), barra lateral (shell), `features/today` (tarjetas del día D), `features/dashboard` (widget), `i18n`.
- `packages/domain/src/` (funciones puras de cálculo + tests).
- `packages/sdk/` (recursos generados/regenerados si el SDK se genera desde OpenAPI).
- `docs/spec/especificacion-producto-v1.1.md`: sustituir la §5.15 por un resumen de esta funcionalidad y enlace a este documento.

---

## 6. Detalles de diseño

### 6.1 Zona horaria y "hoy"

`today` = fecha civil del usuario ahora mismo (`settings.timezone`, defecto `Europe/Madrid`). El scheduler calcula por usuario; la API devuelve siempre `days`, `kind` y `effectiveDate` ya calculados para que web y agentes no recalculen.

### 6.2 Orden de la rejilla (RF-2404, exacto)

1. Fijados primero (por `sortOrder` asc, luego `updatedAt` desc).
2. No fijados con ocurrencia hoy o futura: por `effectiveDate` asc (desempate: `sortOrder`, `createdAt`).
3. No fijados pasados sin repetición: por `targetDate` desc (el más reciente primero).

### 6.3 Paleta de colores (tokens)

`none` (blanco), `blue`, `teal`, `green`, `lime`, `orange`, `red`, `pink`, `purple`, `navy`, `brown`, `black`, `rainbow`. La web los mapea a variables CSS del tema; en API se guarda el token, no el hex.

### 6.4 Ejemplos de payload

`POST /api/v1/countdowns`:

```json
{
  "title": "Año Nuevo",
  "type": "countdown",
  "emoji": "🎇",
  "targetDate": "2027-01-01",
  "repeatRule": "none",
  "dayMode": "standard",
  "color": "pink",
  "reminders": [{ "offsetDays": 0 }, { "offsetDays": 3 }],
  "showInSmartList": true
}
```

Respuesta (201):

```json
{
  "id": "7c9e…",
  "title": "Año Nuevo",
  "kind": "until",
  "days": 74,
  "effectiveDate": "2027-01-01",
  "...": "…"
}
```

MCP `create_countdown` acepta los mismos campos en snake_case (`target_date`, `repeat`, `day_mode`, `reminders` como array de enteros de offset).

---

## 7. Casos límite (obligatorios en tests)

1. **El día D**: `kind = today`, UI muestra «¡Es hoy!»; dispara recordatorios `offset 0` y el evento `countdown.reached` una sola vez por ocurrencia.
2. **Fecha en el pasado sin repetición**: modo "days since" desde el primer día; archivar no cambia el contador al desarchivar.
3. **Aniversario/cumpleaños anual**: tras el día D pasa solo a la próxima ocurrencia; un cumpleaños 29/02 se celebra el 28/02 en años no bisiestos.
4. **Cambio de zona horaria** del usuario: los contadores se recalculan solos (todo deriva de fecha civil + tz en cada lectura; no cachear `days` en BD).
5. **Recordatorio constante**: se detiene al archivar, borrar o pasar el día D; no se duplica si se edita el countdown el mismo día.
6. **Edición de fecha con recordatorios ya entregados** este ciclo: no se reenvían los pasados; sí se reprograman los futuros.
7. **Borrado con recordatorios pendientes**: se cancelan (soft-delete también en `CountdownReminder` o cascada lógica equivalente).
8. **DST**: creación y disparo alrededor del cambio de hora (marzo/octubre en Europe/Madrid): el recordatorio sale a las 09:00 local reales.
9. **Título con emoji y acentos** (p. ej. "Cumpleaños de mamá 🎂"): persiste y se muestra tal cual; cuidado con longitud en grafemas, no en UTF-16.
10. **Multi-dispositivo**: crear en web y leer por MCP devuelve lo mismo; el delta sync (`/api/v1/sync`) incluye los cambios de countdowns vía outbox.

---

## 8. Tests

- **Dominio** (`packages/domain`): tabla de casos de `daysLabel`/`nextOccurrence` (incluye todos los de §7) — unitarios puros, sin reloj real (inyectar `today`).
- **API integración** (`apps/api/test/countdowns.integration.spec.ts`): CRUD completo, validaciones 422, idempotencia en POST, scopes 403 sin scope, archivar desactiva recordatorios, `dueWithinDays`.
- **Scheduler**: test con reloj falso: disparo a las 09:00 del día correcto, deduplicación, constante on/off.
- **MCP**: catálogo filtrado por scopes + round-trip create/list.
- **E2E Playwright** (`apps/web/e2e/countdowns.spec.ts`): crear desde el botón +, ver la tarjeta con el número correcto, editar color, archivar y ver en Archivados, borrar con deshacer.
- **Regresión**: `pnpm test` completo en verde antes del PR.

---

## 9. Criterios de aceptación

- [ ] Puedo crear un countdown desde la web, verlo en la rejilla con los días correctos ("Faltan N días"), editarlo, fijarlo, archivarlo, desarchivarlo y borrarlo.
- [ ] Un aniversario anual pasa automáticamente a la próxima ocurrencia tras el día D.
- [ ] El día D aparece en Hoy como tarjeta informativa y llega el recordatorio (Telegram y/o push según mi configuración) a las 09:00.
- [ ] Desde un agente por MCP puedo listar, crear, editar, archivar y borrar countdowns solo con scopes `countdowns:*`; sin esos scopes las herramientas no aparecen.
- [ ] `GET /api/v1/countdowns?dueWithinDays=7` devuelve solo los próximos, con `days` calculado en mi zona horaria.
- [ ] El dashboard muestra el widget "Cuenta atrás" con los 3 próximos.
- [ ] Todo funciona offline para lectura y las mutaciones se encolan.
- [ ] Suite completa en verde; OpenAPI y SDK regenerados y commiteados.

---

## 10. Plan de implementación sugerido (PRs pequeños)

1. **PR-1 Modelo + dominio**: migración Prisma, enums, funciones puras en `packages/domain` con tests de §7. Sin API.
2. **PR-2 API + eventos**: módulo `countdowns`, scopes, OpenAPI, eventos, sync. Tests de integración.
3. **PR-3 Recordatorios**: scheduler + transport + deduplicación + constante. Tests con reloj falso.
4. **PR-4 MCP**: 7 herramientas + tests de catálogo.
5. **PR-5 UI**: página, diálogo, estilos, menú contextual, Archivados, estados vacíos. E2E.
6. **PR-6 Integraciones**: Hoy, dashboard widget, reporte semanal, entrada en barra lateral, doc §5.15 actualizada.

Cada PR desplegable de forma independiente (la funcionalidad es aditiva; con PR-2 la API ya es usable por agentes).

---

## 11. Decisiones tomadas (no preguntar)

- Entidad separada de tareas (como hábitos, RF-1304): un countdown no se completa.
- Fecha sin hora; disparo fijo a las 09:00 local (paridad TickTick).
- El cómputo vive en `packages/domain` y la API lo devuelve calculado.
- Archivado en lugar de "completado" para countdowns pasados que ya no interesan.
- Textos de UI en español; herramientas MCP documentadas en inglés.
- Sin plantillas premium ni repetición custom en esta entrega (campos preparados).
