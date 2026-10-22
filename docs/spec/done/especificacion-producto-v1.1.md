# Especificación de producto: gestor de tareas personal extensible

- **Versión del documento:** 1.1
- **Fecha:** 17 de octubre de 2026
- **Estado:** Decisiones de plataforma resueltas (sección 21); listo para desarrollo del MVP
- **Audiencia:** agente de desarrollo / equipo de ingeniería
- **Autor:** Pablo Poveda (especificación preparada por su asistente)

**Cambios en v1.1 (17 oct 2026):** decisiones de Pablo aplicadas: PWA web como único cliente inicial, despliegue en su VPS con Docker Compose + Caddy, dominio `todo.reflexionia.com`, hábitos al MVP, Pomodoro a V2, sin importador externo (RF-1701; arranque desde cero), servidor MCP + PATs con scopes como requisito de fase 1, orden de prioridad de integraciones (Telegram, Google Calendar, Google Drive), dos extensiones propias en V1: dashboard de KPIs («jardín digital», sección 9.21) y reporte semanal honesto (sección 9.22), y seis refuerzos aceptados por Pablo: captura rápida como prioridad máxima, backups automáticos con restauración probada fuera de la máquina, tokens por agente con auditoría, MCP desde el día uno, revisión diaria/semanal asistida (sección 9.23) y offline móvil desde el MVP.

---

## 0. Cómo leer este documento

Este documento especifica de forma exhaustiva un gestor de tareas y productividad personal que cubre tareas, listas, etiquetas, filtros inteligentes, prioridades, subtareas, recurrencias, recordatorios, calendario, vistas Kanban/Timeline, Pomodoro y hábitos, y además está diseñado desde cero para ser extendido y conectado con cualquier sistema externo (API pública completa, webhooks, automatizaciones y plugins).

Convenciones:

- **MVP**, **V1**, **V2**: fase de entrega sugerida (ver sección 19).
- **RF-xx**: requisito funcional identificable y testeable.
- Las decisiones de plataforma y alcance están resueltas (secciones 2 y 21).
- Donde se describe comportamiento, se hace a nivel funcional (qué hace el usuario), no de implementación.

---

## 1. Visión y objetivos

### 1.1 Problema

El modelo mental objetivo es el de un gestor de tareas con listas, etiquetas, filtros, Pomodoro, hábitos y calendario, con estas carencias habituales:

- Ofrece una Open API muy limitada: solo tareas y proyectos, con dos scopes (`tasks:read`, `tasks:write`). No hay webhooks, ni hábitos, ni Pomodoro, ni filtros, ni notas accesibles por API.
- No tiene sistema de plugins ni automatizaciones definibles por el usuario.
- No permite autoalojar ni exportar de forma completa y estructurada todo el estado.

### 1.2 Objetivo

Construir una aplicación propia que:

1. Cubra tareas, listas, etiquetas, filtros inteligentes, prioridades, subtareas, recurrencias, recordatorios, calendario, vistas Kanban/Timeline, matriz de Eisenhower, Pomodoro, hábitos, notas y estadísticas.
2. Exponga **toda** la funcionalidad mediante una API pública de primera clase (no un subconjunto).
3. Sea extensible: webhooks salientes, automatizaciones internas (trigger → condición → acción) y un sistema de plugins.
4. Permita empezar desde cero sin importar datos de otro gestor (sin importación en fase 1; el importador queda aplazado, ver RF-1701).

### 1.3 No objetivos (al menos en las primeras fases)

- No es un gestor de proyectos de equipo completo (no Gantt real, no dependencias entre tareas, no estimaciones de carga). La vista Timeline es deliberadamente ligera.
- No compite con Notion como base de conocimiento: las notas existen, pero son un complemento.
- Colaboración multiusuario avanzada es fase V2 (ver sección 9.18).

---

## 2. Decisiones de plataforma y stack (resueltas el 17 oct 2026)

Pablo resolvió todas las decisiones que estaban abiertas (detalle en la sección 21). Resumen:

| #   | Decisión             | Resolución                                                                                                                                                                                                                                        |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Plataformas cliente  | **Web PWA como único cliente en fase 1**, cuidada tanto en móvil como en escritorio (responsive, instalable, push, offline). Las apps nativas (móvil/escritorio) llegan más adelante sobre la misma API.                                          |
| D2  | Stack backend        | **TypeScript extremo a extremo: NestJS + PostgreSQL + Prisma.** Confirmado.                                                                                                                                                                       |
| D3  | Stack frontend       | **React + TypeScript.** Confirmado.                                                                                                                                                                                                               |
| D4  | Alojamiento          | **Un VPS con Docker**, con Docker Compose (API, PostgreSQL, Redis si las colas lo requieren) y **Caddy como reverse proxy con HTTPS automático**. Instancia única de uso personal, empaquetada para ser portable.                                 |
| D5  | Multiusuario         | **Multiusuario desde el modelo de datos**, aunque en el lanzamiento solo hay un usuario activo. La colaboración (compartir listas con permisos read/comment/write, p. ej. una lista compartida con su pareja) sigue en el roadmap (sección 9.18). |
| D6  | Prioridad de módulos | Ver sección 19. Cambios clave: **hábitos (con recordatorios) y servidor MCP + PATs con scopes entran en el MVP; Pomodoro pasa a V2; el importador externo (RF-1701) queda fuera del MVP** (arranque desde cero).                                  |
| D7  | Nombre y dominio     | **`todo.reflexionia.com`** para app, API, feeds iCal, email-to-task y emails transaccionales.                                                                                                                                                     |

---

## 3. Principios de diseño

1. **API-first**: toda funcionalidad de la UI pasa por la misma API pública que se documenta y versiona (sección 10). Nada de endpoints privados "solo para la app".
2. **Todo emite eventos**: cada cambio de estado relevante genera un evento de dominio (sección 11) que alimenta webhooks, automatizaciones y la sincronización.
3. **Offline-first en el cliente**: la app funciona sin red y sincroniza al volver (sección 13). Es parte de la experiencia.
4. **Formatos estándar antes que inventados**: recurrencias en RRULE (RFC 5545), recordatorios como triggers estilo iCalendar, exportación iCal/CSV/JSON, Markdown para texto enriquecido.
5. **Extensibilidad como contrato**: los puntos de extensión (sección 12) son parte del producto, con versionado y deprecación anunciada.
6. **Un solo usuario primero, cero atajos de modelo**: no se sacrifica integridad del modelo de datos por ir rápido (ver D5).

---

## 4. Arquitectura general propuesta

```
┌─────────────────────────────────────────────────────────────┐
│ Clientes: Web PWA (React, móvil + escritorio) · bot Telegram │
│ · agentes MCP · futuro cliente nativo (móvil/escritorio)     │
└──────────────▲──────────────────────────────────────────────┘
               │ HTTPS (Caddy, TLS automático) / WebSocket (sync en vivo)
┌──────────────┴──────────────────────────────────────────────┐
│ API REST v1 (NestJS) + servidor MCP                          │
│  - Auth (OAuth2 + Personal Access Tokens + sesiones)         │
│  - Validación, rate limiting, versionado                     │
├──────────────────────────────────────────────────────────────┤
│ Servicios de dominio (módulos)                               │
│  tasks · lists · tags · filters · habits · focus · notes ·   │
│  calendar · reminders · search · import/export · collab      │
├──────────────────────────────────────────────────────────────┤
│ Event Bus (cola interna: BullMQ/Redis o NATS)                │
│  - webhooks dispatcher · automation engine · sync feed       │
├──────────────────────────────────────────────────────────────┤
│ Scheduler (recordatorios, recurrencias, daily reminder)      │
├──────────────────────────────────────────────────────────────┤
│ PostgreSQL (datos) · Redis (colas, caché) · S3/local (files) │
│ Meilisearch o Postgres FTS (búsqueda)                        │
└──────────────────────────────────────────────────────────────┘
```

Reglas arquitectónicas:

- Los módulos de dominio no se llaman entre sí directamente: publican/consumen eventos.
- El scheduler es el único componente autorizado a materializar ocurrencias de tareas recurrentes y a disparar recordatorios.
- El dispatcher de webhooks y el motor de automatizaciones consumen del mismo bus: un evento existe una vez y se reparte.
- Los plugins de servidor (V2) se ejecutan en proceso aislado (worker con permisos declarados), nunca en el proceso principal.

Despliegue (D4): instancia única en el VPS con Docker con Docker Compose: servicios `caddy` (reverse proxy con HTTPS automático para `todo.reflexionia.com`), `api` (NestJS; incluye el servidor MCP), `postgres` y `redis` (colas y caché; se añade solo si el bus de eventos y el scheduler lo requieren). Adjuntos en volumen local (S3 externo opcional). Backups diarios fuera de la máquina (RF-1704).

---

## 5. Modelo de datos

Todos los IDs son `uuid` (o ULID si se prefiere ordenación). Todas las entidades tienen `created_at`, `updated_at` y `deleted_at` (soft delete) salvo que se indique. Las fechas-hora se almacenan en UTC más la zona horaria original del usuario (ver 9.6).

### 5.1 Task (tarea)

| Campo            | Tipo                                                    | Notas                                                                                    |
| ---------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| id               | uuid                                                    |                                                                                          |
| project_id       | fk → Project                                            | lista contenedora; la "bandeja de entrada" es un Project de sistema                      |
| parent_id        | fk → Task, nullable                                     | subtarea de primer nivel como tarea completa (además del checklist, ver 9.2)             |
| title            | text                                                    | máx. 500 chars, se guarda tal cual (espacios de los extremos incluidos; vacío permitido) |
| content          | text                                                    | descripción larga en Markdown                                                            |
| kind             | enum: `task`, `note`                                    | se permiten notas dentro de listas (`kind: NOTE`)                                        |
| status           | enum: `active`, `completed`, `archived`                 | equivalente a `status` 0/2 de la Open API pública (RF-503)                               |
| priority         | enum: `none`, `low`, `medium`, `high`                   | mapeo numérico 0/1/3/5 (RF-503)                                                          |
| is_all_day       | bool                                                    |                                                                                          |
| start_date       | timestamptz, nullable                                   |                                                                                          |
| due_date         | timestamptz, nullable                                   |                                                                                          |
| time_zone        | text (IANA)                                             | zona en la que el usuario introdujo las fechas                                           |
| duration_minutes | int, nullable                                           | para Timeline y time-blocking; si hay start+due se deriva                                |
| repeat_rule      | text (RRULE), nullable                                  | p. ej. `RRULE:FREQ=DAILY;INTERVAL=1`                                                     |
| repeat_from      | enum: `due_date`, `completion_date`                     | repetir desde la fecha de completado                                                     |
| sort_order       | bigint                                                  | orden manual dentro de la lista                                                          |
| tags             | m2m → Tag                                               |                                                                                          |
| assignee_id      | fk → User, nullable                                     | (V2 colaboración)                                                                        |
| created_by       | fk → User                                               |                                                                                          |
| completed_at     | timestamptz, nullable                                   |                                                                                          |
| source           | enum: `manual`, `import`, `api`, `automation`, `plugin` | trazabilidad                                                                             |
| metadata         | jsonb                                                   | espacio libre para plugins/integraciones                                                 |

Índices: `(project_id, status, sort_order)`, `(due_date) where status='active'`, GIN sobre `tags`, FTS sobre `title + content`.

### 5.2 ChecklistItem (ítem de checklist dentro de una tarea)

| Campo                 | Tipo                        | Notas                     |
| --------------------- | --------------------------- | ------------------------- |
| id                    | uuid                        |                           |
| task_id               | fk → Task                   |                           |
| title                 | text                        |                           |
| status                | enum: `active`, `completed` | Open API pública: 0/1     |
| sort_order            | bigint                      |                           |
| start_date / due_date | timestamptz, nullable       | se permite fecha por ítem |
| is_all_day            | bool                        |                           |
| time_zone             | text                        |                           |
| completed_at          | timestamptz                 |                           |

### 5.3 Project (lista)

| Campo      | Tipo                               | Notas                                            |
| ---------- | ---------------------------------- | ------------------------------------------------ |
| id         | uuid                               |                                                  |
| name       | text                               |                                                  |
| color      | text (hex)                         | p. ej. `#F18181`                                 |
| folder_id  | fk → Folder, nullable              | agrupación de listas (carpetas / `groupId`)      |
| view_mode  | enum: `list`, `kanban`, `timeline` | lista, kanban o timeline                         |
| kind       | enum: `TASK`, `NOTE`               | listas de tareas o de notas                      |
| closed     | bool                               | lista archivada                                  |
| is_inbox   | bool                               | bandeja de entrada del sistema (una por usuario) |
| sort_order | bigint                             |                                                  |
| permission | derivado                           | `read`, `write`, `comment` en compartidas (V2)   |

### 5.4 Folder (carpeta de listas)

`id`, `name`, `sort_order`, `owner_id`.

### 5.5 Column (columna Kanban / sección)

`id`, `project_id`, `name`, `sort_order`, `collapsed` (sección plegada). Las tareas llevan además `column_id` nullable. En vista lista, las Column se muestran como secciones; en Kanban, como columnas. En Kanban se muestra la agrupación elegida y el progreso por columna.

### 5.6 Tag (etiqueta)

`id`, `name` (única por usuario, case-insensitive), `color`, `parent_id` nullable (etiquetas anidadas), `sort_order`.

### 5.7 SmartList y Filter

Listas inteligentes de sistema (una por usuario, no borrables, activables/desactivables en la barra lateral): **Today, Tomorrow, Next 7 Days, All, Inbox, Assigned to me, Completed, Trash**. Incluir también "No date" y "Recently added".

Filter (filtro personalizado del usuario):

| Campo      | Tipo                       | Notas               |
| ---------- | -------------------------- | ------------------- |
| id         | uuid                       |                     |
| name       | text                       |                     |
| icon/color | text                       |                     |
| mode       | enum: `normal`, `advanced` | ambos modos         |
| rules      | jsonb                      | ver gramática abajo |
| sort_order | bigint                     |                     |

Gramática de `rules` (persistida, portable por API):

```json
{
  "combinator": "AND" | "OR",
  "groups": [
    {
      "combinator": "AND",
      "conditions": [
        {"field": "list", "op": "in", "value": ["<projectId>"]},
        {"field": "tag", "op": "any_of", "value": ["casa"]},
        {"field": "date", "op": "today" | "tomorrow" | "next_7_days" | "overdue" | "no_date" | "between", "value": ["2026-10-17","2026-10-24"]},
        {"field": "priority", "op": "gte", "value": "medium"},
        {"field": "keyword", "op": "contains", "value": "leer"}
      ]
    }
  ]
}
```

Campos filtrables mínimos: lista, etiqueta, fecha (hoy/mañana/próximos 7 días/vencidas/sin fecha/rango), prioridad, palabra clave en título/contenido, estado (activa/completada), asignado (V2). El filtro avanzado permite múltiples cláusulas con AND/OR y vista previa, con un endpoint `POST /filters/preview` (ver 10).

### 5.8 Reminder (recordatorio)

| Campo         | Tipo                                                     | Notas                                                                                                  |
| ------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| id            | uuid                                                     |                                                                                                        |
| task_id       | fk → Task                                                |                                                                                                        |
| trigger       | text                                                     | formato iCalendar: `TRIGGER:PT0S`, `TRIGGER:P0DT9H0M0S` (offset relativo a due/start), o absoluto `at` |
| absolute_at   | timestamptz, nullable                                    | recordatorio en hora fija                                                                              |
| type          | enum: `relative`, `absolute`, `location`, `daily_digest` |                                                                                                        |
| location      | jsonb, nullable                                          | `{lat, lon, radius_m, label}` (recordatorio por ubicación)                                             |
| channel       | enum: `push`, `email`, `both`                            | incluye recordatorio por email                                                                         |
| constant      | bool                                                     | "recordatorio constante": renotifica hasta completar                                                   |
| snoozed_until | timestamptz                                              |                                                                                                        |

### 5.9 Habit y HabitLog

Habit: `id`, `name`, `icon`, `color`, `goal` (jsonb: `{times_per_period, period: day|week, target_count}` p. ej. beber agua 8 vasos/día), `frequency` (qué días), `reminder_time`, `motivation_note`, `archived`, `sort_order`.

HabitLog: `id`, `habit_id`, `date`, `count` (check-ins del día), `note`. Único por `(habit_id, date)`.

Estadísticas derivadas: racha actual, mejor racha, % de cumplimiento por semana/mes, mapa de calor anual. Se muestran estadísticas detalladas por hábito.

### 5.10 FocusSession (Pomodoro / Focus)

| Campo                 | Tipo                                       | Notas                                   |
| --------------------- | ------------------------------------------ | --------------------------------------- |
| id                    | uuid                                       |                                         |
| task_id               | fk → Task, nullable                        | asociar sesión a una tarea (se permite) |
| type                  | enum: `focus`, `short_break`, `long_break` |                                         |
| planned_minutes       | int                                        |                                         |
| actual_seconds        | int                                        |                                         |
| started_at / ended_at | timestamptz                                |                                         |
| completed             | bool                                       | terminó vs. abandonado                  |
| ambient_sound         | text, nullable                             | white noise usado                       |
| interrupted_count     | int                                        |                                         |

Configuración por usuario (`FocusSettings`): duración pomodoro (default 25), descanso corto (5), descanso largo (15-30), pomodoros antes de descanso largo (4), auto-inicio de descansos/pomodoros, sonidos ambientales disponibles, "modo estricto" (no pausar).

### 5.11 Note / StickyNote

Note reusa `Task` con `kind='note'` (listas de tipo NOTE). StickyNote (nota adhesiva de escritorio/widget): `id`, `text`, `color`, `pinned_task_id` nullable, `position` jsonb. MVP-lite: puede aplazarse a V1 sin daño.

### 5.12 CalendarSubscription y ExternalEvent

CalendarSubscription: `id`, `url` (iCal) o `provider` (`google`), `calendar_id`, `summary`, `visible`, `sync_direction` (`read` | `two_way`), `color`, `sync_token`, `last_synced_at`, `last_error`, `sync_failures`, `retry_after`. ExternalEvent: eventos importados de solo lectura (`status`, `time_zone`, `raw`) que se muestran junto a las tareas. Los disparadores `calendar.synced` y `calendar.sync_failed` pueden usarse en automatizaciones sin trabajo extra.

### 5.13 Attachment

`id`, `task_id`, `file_name`, `mime_type`, `byte_size`, `storage_key`, `uploaded_by`. Límite por archivo configurable (default 25 MB).

### 5.14 Comment y ActivityLog (V2 colaboración; ActivityLog desde MVP)

ActivityLog: `id`, `actor_id`, `entity_type`, `entity_id`, `action` (created/updated/completed/deleted/assigned/commented), `changes` jsonb, `created_at`. Alimenta el historial de actividad de listas compartidas y es la base del feed de eventos (sección 11).

### 5.15 Countdown

Cuenta atrás para fechas importantes, entidad independiente de las tareas. Incluye tipo, emoji,
fecha civil, repetición, modo de cálculo, color/estilo, notas, orden/fijación, archivado y
recordatorios. El cálculo respeta la zona horaria del usuario y se entrega por API ya resuelto.
La especificación funcional y sus RF-2401–RF-2460 están en
[`countdown-spec-v1.0-6cb37c7c.md`](./countdown-spec-v1.0-6cb37c7c.md).

### 5.16 Template (plantilla de lista/tarea)

`id`, `name`, `payload` jsonb (lista con sus tareas/columnas), `owner_id`. Es una extensión propia.

### 5.17 User y Settings

User: `id`, `email`, `password_hash` o SSO, `display_name`, `avatar`, `time_zone`, `locale` (`es` default), `week_start` (`monday` default), `date_format`, `theme` (light/dark/auto), `nlp_language`, `daily_reminder_time`, `task_complete_children` (`ask` por defecto, `complete` o `leave`; RF-206), settings de Focus (5.10), settings del reporte semanal (9.22: día/hora, canales, tono), `achievement_score` (gamificación, V2).

### 5.18 DashboardLayout

`id`, `user_id`, `name`, `widgets` jsonb (lista de `{widget_key, position, size, config}`), `is_default`. Permite varias vistas del dashboard por usuario (p. ej. "hoy", "semana").

### 5.19 WeeklyReport

`id`, `user_id`, `week_start`, `payload` jsonb (KPIs y texto generado), `tone`, `delivered_channels`, `sent_at`. Histórico consultable en la app y por API.

---

## 6. Reglas transversales del modelo

1. **Completar tarea recurrente**: al completar, se crea la siguiente ocurrencia según `repeat_rule` y `repeat_from` (`due_date`: siguiente fecha teórica; `completion_date`: siguiente fecha contando desde hoy). Las subtareas/checklist vuelven a estado activo en la nueva ocurrencia. La completada queda registrada para estadísticas.
2. **Borrado**: papelera (soft delete) durante 30 días, purga automática después. Las listas borradas llevan sus tareas a la papelera con ellas.
3. **Completadas**: ocultas por defecto en vistas, accesibles vía lista inteligente "Completed" y por API. Se conserva el conteo para estadísticas.
4. **Ordenación manual**: `sort_order` con espaciado (incrementos de 65536) para reordenar en O(1) escrituras.
5. **Zonas horarias**: almacenar UTC + `time_zone` de captura; una tarea "a las 9:00 en Madrid" sigue siendo a las 9:00 locales aunque el usuario viaje (la hora local de captura se conserva).

---

## 7. Navegación y estructura de la app

Layout de tres paneles (en escritorio; en móvil, navegación con barra inferior y gestos):

1. **Barra lateral**: Inbox y smart lists activas arriba; filtros fijados; carpetas con sus listas; etiquetas; papelera. Todo reordenable por arrastre, con contadores opcionales.
2. **Panel central**: la vista activa (lista / kanban / timeline / calendario / Eisenhower / hábitos / focus) con su cabecera de ordenación, agrupación y búsqueda contextual.
3. **Panel de detalle**: tarea o nota seleccionada (título, fechas, prioridad, etiquetas, checklist, subtareas, contenido Markdown, adjuntos, recordatorios, historial de actividad, comentarios en V2).

Rutas limpias y compartibles: `/list/{id}`, `/filter/{id}`, `/today`, `/calendar/{view}`, `/habits`, `/focus`, `/dashboard`, `/reports/weekly/{semana}`, `/task/{id}` (abre la lista contenedora con el detalle). La URL refleja siempre el estado de navegación: un enlace pegado en otro dispositivo abre exactamente lo mismo.

---

## 8. Alcance funcional y extensiones propias

| Función                                                                         | Gestores de referencia                  | Este producto                                                           |
| ------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| Tareas, listas, carpetas, secciones, etiquetas anidadas, prioridades, checklist | Sí                                      | Paridad total                                                           |
| Filtros (normal y avanzado con AND/OR) y smart lists                            | Sí                                      | Paridad + evaluación por API                                            |
| Recurrencias RRULE, "repetir desde completado"                                  | Sí                                      | Paridad + ocurrencias teóricas por API                                  |
| Recordatorios (múltiples, constante, email, ubicación, daily)                   | Sí (ubicación solo iOS)                 | Paridad multiplataforma donde el cliente lo permita                     |
| Vistas lista/kanban/timeline, calendario, Eisenhower                            | Sí                                      | Paridad                                                                 |
| Pomodoro con estadísticas y white noise                                         | Sí                                      | Paridad + sesiones y stats por API                                      |
| Hábitos con estadísticas                                                        | Sí                                      | Paridad + check-ins por API                                             |
| Notas y sticky notes                                                            | Sí                                      | Paridad                                                                 |
| Suscripción iCal / Google Calendar                                              | Sí (parcial de pago)                    | Gratis + feeds iCal propios por lista/filtro                            |
| Colaboración                                                                    | Sí                                      | V2, con mismos permisos read/comment/write                              |
| Open API                                                                        | Muy limitada (tasks/projects, 2 scopes) | **API completa del dominio + servidor MCP + compatibilidad `/open/v1`** |
| Webhooks                                                                        | No                                      | **Sí, catálogo completo con firma y reintentos**                        |
| Automatizaciones internas                                                       | No                                      | **Sí, motor trigger-condición-acción**                                  |
| Plugins                                                                         | No                                      | **Sí (V2): comandos, NLP, vistas, acciones**                            |
| Exportación completa                                                            | Parcial                                 | **JSON completo versionado + CSV + iCal + backup diario**               |
| Plantillas de lista/tarea, WIP limits, `estimated_pomodoros`                    | No                                      | Sí (extensiones propias)                                                |
| Dashboard de KPIs configurable y reporte semanal honesto                        | No                                      | Sí (extensiones propias, secciones 9.21 y 9.22)                         |

---

## 9. Funcionalidad detallada por módulo

Cada módulo indica fase sugerida y requisitos RF numerados. La UI debe cumplir la paridad descrita; la API debe exponer lo mismo (sección 10).

### 9.1 Captura rápida (Quick Add) y entrada de tareas — MVP

Prioridad máxima de Pablo (17 oct 2026): capturar tiene que costar un segundo desde cualquier sitio (app, voz, Telegram, atajo o share target del móvil). Si capturar cuesta, la app no se usa.

La captura sin fricción es prioritaria: atajo global, widget, voz, email, NLP:

- RF-101: Crear tarea con título en una sola pulsación desde cualquier vista (atajo `N` y botón flotante).
- RF-102: **Parseo de lenguaje natural (NLP)** en el título, en español e inglés: detecta y extrae fecha/hora ("mañana 18:00", "cada lunes", "el 23/10"), prioridad (`!alta`, `!media`, `!baja` o p1-p3), etiquetas (`#casa`), lista (`^trabajo` o `~trabajo`) y recordatorio ("avísame 30 min antes"). Lo detectado se muestra resaltado antes de confirmar y es editable.
- RF-103: Gramática NLP extensible por plugins (sección 12): un plugin puede registrar patrones adicionales.
- RF-104: Entrada por voz (Web Speech API en PWA; nativo en apps futuras) que vuelca texto al mismo pipeline NLP.
- RF-105: **Email-to-task**: dirección única por usuario (`<token>@in.todo.reflexionia.com`); el asunto pasa a título y el cuerpo a contenido; adjuntos se guardan como Attachment. (Es el primer canal de integración externa.)
- RF-106: Atajo global de escritorio cuando exista cliente de escritorio (V2); en PWA, `share target` para "compartir a la app" desde móvil.
- RF-107: Si el parser deja el título vacío no se crea nada (`empty_title`) y tampoco se crea lista ni etiqueta. Un `title` explícito, aunque sea `""`, sí crea la tarea y se guarda tal cual. Si `^lista` o `~lista` no existe, se crea el proyecto y la tarea entra ahí (`list_created`). Si `#etiqueta` no existe, se crea y se asocia (`tag_created`). Un `project_id` o `tag_ids` explícito no crea lo que solo venía en el texto.

### 9.2 Tareas — MVP

- RF-201: CRUD completo de tareas con todos los campos de 5.1.
- RF-202: Descripción en **Markdown** con previsualización, checklist inline `- [ ]` que se convierte en ChecklistItem (las líneas de checklist del contenido pueden convertirse en subtareas).
- RF-203: Adjuntos múltiples por tarea exclusivamente en el Google Drive del propietario; ttd conserva metadatos. Web directa resumable de hasta 100 MiB, API/correo/Telegram en streaming de hasta 25 MiB; máximo 50 por tarea. Vistas previas mediante redirección sin caché a Drive. Sin Drive, no se puede adjuntar.
- RF-204: Duplicar, mover entre listas, mover entre columnas/secciones, convertir tarea en nota y viceversa.
- RF-205: Dos tipos de "hijos": (a) **checklist items** (ligeros, 5.2) y (b) **subtareas completas** (Task con `parent_id`, con sus propias fechas/etiquetas/recordatorios). Se permiten ambos. UI: pestañas o secciones dentro del detalle. Una subtarea puede vivir en otra lista: se respeta el `project_id` pedido y el `parent_id`. En la lista de la hija aparece (también con `flat=true`); en el detalle del padre sigue saliendo como subtarea. Sigue siendo inválido un padre inexistente, de otro usuario, o que forme un ciclo. Una hija en la misma lista no aparece suelta salvo vista plana.
- RF-206: Al completar un padre con hijos activos, preguntar: completar hijos también / dejarlos. Configurable.
- RF-207: Indicador de progreso del checklist (x/y) en la tarjeta de la tarea.
- RF-208: Operaciones masivas: selección múltiple → completar, mover, etiquetar, priorizar, fijar fecha, borrar.
- RF-209: Historial de cambios por tarea (ActivityLog) visible en el detalle.
- RF-210: Deshacer (undo) de completar/borrar durante 10 s vía toast; borrado real pasa por papelera (regla 2, sección 6).

### 9.3 Listas, carpetas y secciones — MVP

- RF-301: CRUD de listas con nombre, color, emoji/icono, vista por defecto (lista/kanban/timeline), orden manual, archivar (`closed`).
- RF-302: Carpetas que agrupan listas, plegables, con orden manual. Una lista puede no tener carpeta.
- RF-303: Inbox como lista de sistema por usuario: destino por defecto de captura rápida y email-to-task.
- RF-304: Secciones (Column) dentro de una lista: renombrar, reordenar, colapsar; mover tareas entre secciones. En vista lista se ven como cabeceras; en Kanban como columnas.
- RF-305: Contador de tareas activas por lista en la barra lateral (opcional en settings).
- RF-306: Vaciar papelera / archivar todas las completadas de una lista en una acción.

### 9.4 Etiquetas — MVP

- RF-401: CRUD de etiquetas con color y anidación (padre/hija). Filtrar por padre incluye hijas (configurable por filtro).
- RF-402: Asignación múltiple por tarea; autocompletado al teclear `#`.
- RF-403: Panel de etiquetas en barra lateral con contador y renombrado en cascada seguro (renombrar no rompe filtros: los filtros referencian por ID, no por nombre).

### 9.5 Prioridades — MVP

- RF-501: Cuatro niveles: High / Medium / Low / None (equivalentes a 5/3/1/0 de la Open API pública, RF-503).
- RF-502: Indicador visual (bandera/color) en tarjeta; ordenación por prioridad en cualquier vista.
- RF-503: Mapeo exacto en importación/exportación TickTick (0↔none, 1↔low, 3↔medium, 5↔high).

### 9.6 Fechas, duración y zonas horarias — MVP

- RF-601: Tarea con fecha de vencimiento (`due_date`), fecha de inicio (`start_date`) o rango (ambas). Tarea de día completo (`is_all_day`) o con hora.
- RF-602: Duración editable; la vista Timeline la usa para el largo del bloque.
- RF-603: Vencidas: destacadas en rojo, agrupadas arriba en Today, incluidas en filtro "overdue".
- RF-604: Regla de zona horaria de la sección 6.5; al cambiar la zona del usuario en ajustes, no se reescriben tareas.
- RF-605: "Aplazar a mañana / la semana que viene / fecha concreta" en un clic (snooze de fecha, no de recordatorio).

### 9.7 Recurrencias — MVP

- RF-701: Reglas RRULE completas: diaria, semanal (días concretos), mensual (día del mes o "primer lunes"), anual, intervalos personalizados (`INTERVAL=n`), fin por fecha (`UNTIL`) o por número de ocurrencias (`COUNT`).
- RF-702: UI de construcción de regla en español, sin exponer RRULE crudo salvo modo avanzado.
- RF-703: `repeat_from`: "desde la fecha de vencimiento" (default) o "desde la fecha de completado" (hábitos del tipo "regar cada 3 días desde que lo hice").
- RF-704: Solo se materializa la ocurrencia actual; al completarla se genera la siguiente (evita explosión de filas y respeta ediciones futuras). La API expone `GET /tasks/{id}/occurrences?from&to` que calcula ocurrencias teóricas sin persistirlas.
- RF-705: Editar una ocurrencia concreta sin romper la serie: la ocurrencia editada se desvincula (`exdate` en la regla).
- RF-706: Casos límite: 29-31 de febrero en mensual/anual (usar último día del mes), cambio de horario de verano (recalcular en la zona de captura), completar con retraso (la siguiente ocurrencia no se salta: se calcula desde la regla, no desde "hoy", salvo `completion_date`).

### 9.8 Recordatorios — MVP

- RF-801: Múltiples recordatorios por tarea, relativos (5 min antes, 1 día antes...) o absolutos (fecha/hora concreta). Persistencia en formato trigger iCalendar (`TRIGGER:P0DT9H0M0S`).
- RF-802: Canales: push (Web Push en PWA) y email. Configurable por tarea y por defecto en ajustes.
- RF-803: Recordatorio constante (opcional por tarea): renotifica cada X min hasta completar o posponer.
- RF-804: Snooze de notificación: 10 min, 1 h, mañana, personalizado.
- RF-805: Daily reminder: resumen diario a hora configurable ("planifica tu día").
- RF-806: Recordatorio por ubicación (geofence) en clientes con GPS (móvil, V1+). Modelo ya previsto en 5.8.
- RF-807: Recordatorios de tareas recurrentes se heredan a cada ocurrencia.
- RF-808: Fiabilidad: el scheduler materializa recordatorios con al menos 48 h de antelación en una cola persistente; si el servicio cae, al arrancar reprograma lo perdido (catch-up) y marca como "late" lo ya vencido.

### 9.9 Listas inteligentes y filtros — MVP

- RF-901: Smart lists de sistema (5.7) activables/ordenables en la barra lateral.
- RF-902: Filtros personalizados en modo normal (campos simples) y avanzado (grupos AND/OR anidados un nivel) con **vista previa** antes de guardar.
- RF-903: Un filtro es una vista de primera clase: aparece en la barra lateral, tiene contador, soporta vistas lista/kanban/timeline y se puede fijar.
- RF-904: Evaluación de filtros en backend (los filtros funcionan igual por API y por todos los clientes). Nada de lógica duplicada en cliente.

### 9.10 Vistas de tareas — MVP/V1

- RF-1001 (MVP): **Vista lista**: agrupación por sección/fecha/etiqueta/prioridad; ordenación manual y automática (fecha, prioridad, título, creación); detalle en tercer panel en escritorio.
- RF-1002 (V1): **Vista Kanban**: columnas = Column de la lista; agrupación alternativa por etiqueta/prioridad/asignado; drag & drop entre columnas actualiza `column_id`; contador y progreso por columna; WIP limit opcional por columna (extensión propia, barata).
- RF-1003 (V1): **Vista Timeline** (más ligera que un Gantt): tareas con fecha como bloques horizontales día/semana/mes; arrastrar para mover en el tiempo; arrastrar bordes para cambiar duración; tareas sin fecha en panel lateral "por planificar"; clic en hueco crea tarea con esa fecha; zoom día/semana/mes. Sin dependencias entre tareas.
- RF-1004 (V1): **Matriz de Eisenhower**: cuadrantes urgente/importante con reglas por defecto (urgente = vence en 24 h o vencida; importante = prioridad high/medium) y reglas editables por el usuario (misma gramática de filtros, 5.7); drag & drop entre cuadrantes actualiza prioridad/fecha según la regla del cuadrante destino.

### 9.11 Calendario — V1

- RF-1101: Vistas: día, semana, multi-día, multi-semana, mes, año y agenda. El conjunto es día, semana, multi-día, multi-semana, mes, año y agenda.
- RF-1102: Las tareas con fecha aparecen en el calendario (all-day arriba, con hora en su franja); drag & drop re-planifica; clic crea tarea con fecha.
- RF-1103: Suscripción a calendarios externos por URL iCal (solo lectura) y cuenta de Google Calendar. El usuario elige qué calendarios de Google sincronizar (solo lectura, color y visibilidad por calendario). La sincronización es inicial e incremental (`syncToken`), manual y cada 15 minutos. Detalle en `docs/spec/cursor-prompt-google-calendar-sync-v1.0-cd26f95f.md` (RF-2501–RF-2552). La escritura two-way de tareas sigue siendo RF-2004 y no edita los eventos externos.
- RF-1104: Feed iCal propio por lista/filtro: URL secreta regenerable para ver tareas en Google Calendar/Apple Calendar (El feed es parte del producto, sin un plan de pago aparte.)
- RF-1105: Los recordatorios de tareas siguen siendo los del módulo 9.8 aunque la tarea se mueva en calendario.

### 9.12 Pomodoro / Focus — V2

- RF-1201: Temporizador Pomodoro con fases focus → descanso corto → ciclo → descanso largo (config por 5.10).
- RF-1202: Asociar la sesión a una tarea: acumula tiempo de focus y cuenta de pomodoros en la tarea; estimación opcional de pomodoros por tarea (campo `estimated_pomodoros`, extensión propia).
- RF-1203: Sonidos ambientales / white noise durante el focus (catálogo local ampliable por plugin).
- RF-1204: Estadísticas: focus por día/semana/mes, distribución por lista/etiqueta, rachas de días con focus, mejor franja horaria. Se muestran estadísticas de pomodoro, con exportación CSV.
- RF-1205: La sesión corre en servidor (o al menos se persiste start/end): si se cierra la app, el temporizador sigue y la notificación de fin llega por push. Decisión de diseño importante para PWA.
- RF-1206: Mini-ventana flotante siempre visible (picture-in-picture en PWA si es viable; si no, badge en el título de la pestaña con la cuenta atrás).

### 9.13 Hábitos — MVP

Decisión de Pablo (sección 21): los hábitos entran en fase 1 con sus recordatorios, y deben ser fáciles de adoptar y configurar: alta de un hábito en menos de un minuto, sugerencias de hábitos comunes como punto de partida y recordatorio diario opcional.

- RF-1301: CRUD de hábitos con objetivo (veces por día/semana), días activos, icono/color, recordatorio diario a hora fija.
- RF-1302: Check-in con contador (p. ej. 8 vasos de agua) y nota opcional por día.
- RF-1303: Estadísticas: racha actual/mejor, % cumplimiento, mapa de calor anual por hábito y agregado.
- RF-1304: Los hábitos **no** son tareas: entidad separada (entidad separada), aunque un hábito puede generar recordatorio. Razón: semántica distinta (no se "completan para siempre").
- RF-1305: Los check-ins se exponen por API y emiten eventos (permite automatizaciones tipo "si fallo 3 días, créame una tarea de revisión").

### 9.14 Notas y sticky notes — V1

- RF-1401: Listas de tipo NOTE con notas en Markdown, adjuntos, etiquetas compartidas con tareas.
- RF-1402: Conversión nota ↔ tarea.
- RF-1403: Sticky notes: notas rápidas fijables (widget/escritorio) o vinculadas a una tarea. V1 tardía.

### 9.15 Búsqueda global — MVP

- RF-1501: Búsqueda instantánea sobre título, contenido, checklist, notas y nombres de lista/etiqueta, con filtros inline (`in:lista`, `#tag`, `priority:high`, `done:true`).
- RF-1502: Resultados agrupados por tipo; atajo `/` o `Ctrl/Cmd+K` con paleta de comandos (buscar + acciones: "crear tarea", "ir a lista", "cambiar tema"...).

### 9.16 Estadísticas y logros — V2

- RF-1601: Panel de productividad: completadas por periodo, focus acumulado, hábitos, tareas creadas vs completadas.
- RF-1602: Puntuación de logros (niveles por consistencia). Opcional y desactivable. La razón principal de pérdida de Control se expone como `topDeductionReason: {code, params}` (o `null`), con códigos `overdue`, `on_time`, `habits`, `focus` y `usage` y parámetros numéricos. La UI traduce el código en su idioma; `topDeduction` se mantiene como texto legado deprecado para compatibilidad.

### 9.17 Exportación y backup — MVP; importación aplazada

- RF-1701 (APLAZADO, fuera del MVP: Pablo arranca desde cero, sin migración; la especificación se conserva por si se retoma más adelante): **Importador TickTick** vía su Open API: proyectos (con color, carpeta, viewMode), tareas (prioridad, fechas, RRULE, recordatorios, checklist, contenido, completadas recientes) y tags. Mapeos: `project → Project`, `column → Column`, `priority 0/1/3/5 → none/low/medium/high`, `repeatFlag → repeat_rule`, `items → ChecklistItem`, `kind NOTE → lista de notas`. Limitación documentada: la Open API de TickTick no expone hábitos, pomodoros ni filtros; el importador lo advierte y sugiere recrearlos (o export manual).
- RF-1702: Importador CSV genérico con mapeo de columnas.
- RF-1703: Exportación completa JSON (todo el estado del usuario, versionada por esquema) + CSV por lista + iCal por lista/filtro.
- RF-1704: Backup automático diario de PostgreSQL (`pg_dump`) más los metadatos de adjuntos (nunca sus binarios), **copiado fuera de la máquina** (por defecto a Google Drive cuando exista RF-2005; antes, a cualquier almacenamiento externo configurado), con retención de 30 días configurable, restauración desde archivo y **prueba de restauración automática semanal** (restaura el último backup en un contenedor temporal y verifica su integridad; alerta si falla). Es el sistema de tareas de Pablo: perderlo no es una opción.
- RF-1705: El export JSON es el formato de referencia para migraciones futuras: versionado `schema_version` y script de migración por versión.

### 9.18 Colaboración — V2

- RF-1801: Compartir lista con permisos `read`, `comment`, `write` (tres niveles).
- RF-1802: Asignar tareas a miembros; vista "Assigned to me".
- RF-1803: Comentarios por tarea con menciones; ActivityLog visible por lista compartida.
- RF-1804: Presencia ligera (quién está viendo la lista) opcional.
- RF-1805: Todo lo anterior funciona por API y emite eventos (un agente externo puede ser "miembro" de una lista).

### 9.19 Widgets, atajos y personalización — V1/V2

- RF-1901: Widgets de lista/hoy/hábitos/pomodoro en móvil cuando exista app nativa; en PWA, accesos directos de icono de app y share target.
- RF-1902: Atajos de teclado completos y hoja de ayuda (`?`): navegación, crear, completar (`space`), mover fecha, cambiar prioridad. Menú de comandos (9.15).
- RF-1903: Temas claro/oscuro/auto y densidad de lista; color de acento.

### 9.20 Integraciones y agentes externos — MVP (MCP + PAT), V1 (resto)

Decisión de Pablo (sección 21): los agentes personales (ChatGPT, Cursor, Instinct y otros) deben poder conectarse fácilmente para leer y escribir. Esto convierte el acceso para agentes en requisito de fase 1, no una mejora posterior. Prioridad de integraciones: **1) MCP + API REST/PAT (MVP) · 2) Telegram · 3) Google Calendar · 4) Google Drive**.

- RF-2001 (MVP): **Servidor MCP (Model Context Protocol)** que expone las operaciones del dominio (tareas, listas, etiquetas, filtros, hábitos, búsqueda, notas) como tools/resources sobre la misma API v1, de modo que cualquier agente compatible con MCP pueda consultar y modificar el estado. Autenticación con PAT u OAuth2 (10.1) y los mismos scopes granulares: el servidor MCP nunca tiene más privilegios que el token usado. Transporte Streamable HTTP sin estado: `POST` JSON-RPC responde `application/json` y una notificación (sin `id`, o método `notifications/…`) responde 202 sin cuerpo; `GET` y `DELETE` del mismo path responden 405 sin cuerpo y con `Allow: POST` hasta que exista un stream SSE de servidor a cliente; no se envía `Mcp-Session-Id` mientras no haya sesión. Las tools salen del catálogo `MCP_TOOLS` y solo se ven si el token tiene todos sus scopes. Los listados que devuelven `next_cursor` aceptan el `cursor` de la API v1.
- RF-2002 (MVP): **API REST v1 + Personal Access Tokens con scopes granulares** (10.1) como vía universal de lectura/escritura para scripts y agentes, con la documentación OpenAPI publicada para que un agente pueda descubrir la API por sí mismo.
- RF-2003 (V1, primera integración prioritaria): **bot de Telegram**: crear tareas enviando texto (mismo pipeline NLP del quick add), voz (transcripción → NLP) o foto (adjunto); consultar ("¿qué tengo hoy?", "¿qué hay en la lista compra?"); completar tareas con botones; opción de recibir recordatorios por Telegram como canal adicional de notificación.
- RF-2004 (V1): **Google Calendar** (RF-1103): lectura en V1; escritura two-way en V2.
- RF-2005 (V1): **Google Drive**: adjuntar archivos en el Drive del propietario a tareas (enlaces verificados o subidas directas/en streaming; sin almacenamiento binario propio) y opción de volcar el backup diario (RF-1704) a Drive.
- RF-2006: Todas las integraciones externas se implementan como consumidores de la API y los eventos existentes (secciones 10 y 11), nunca como código especial con acceso directo a la base de datos.

### 9.21 Dashboard («jardín digital») — V1

Requisito de Pablo (17 oct 2026): una vista que permita ver todo su jardín digital de un vistazo, con KPIs y cuadro de mando.

- RF-2101: Vista `/dashboard` como cuadro de mando personal: una parrilla de widgets con KPIs calculados en backend, pensada para consulta rápida diaria en móvil y escritorio.
- RF-2102: Catálogo inicial de widgets: tareas completadas hoy/semana y tendencia; vencidas y próximas 7 días; creadas vs completadas (flujo neto); racha y cumplimiento de hábitos con mapa de calor; carga por lista/etiqueta; próximos eventos de calendario (incluye suscripciones externas); contadores de las integraciones conectadas (actividad vía MCP/Telegram, adjuntos de Drive); tiempo de foco cuando exista el Pomodoro (V2). Las completadas/creadas de la semana usan lunes local hasta el instante de cálculo y excluyen canceladas, igual que Estadísticas; la tendencia compara con la semana anterior completa.
- RF-2103: Layout configurable sin código: añadir, quitar, reordenar y redimensionar widgets (grid con drag & drop), guardado por usuario (5.18) con varias vistas opcionales.
- RF-2104: Todo widget consume la API pública: `GET /api/v1/dashboard/widgets` (catálogo), `GET /api/v1/dashboard/data?widget=...&period=...` (datos), `GET/PATCH /api/v1/me/dashboard` (layout). Los agentes externos leen los mismos KPIs por MCP/REST.
- RF-2105: KPIs extensibles: nuevas integraciones y plugins (V2) pueden registrar widgets propios con su esquema de datos.
- Puntos abiertos (default propuesto, Pablo puede cambiarlo): el alcance inicial cubre los datos de la propia app (tareas, hábitos, calendario) más contadores de las integraciones ya conectadas; las fuentes externas del «jardín digital» (otras apps) se añaden como widgets de integración cuando exista cada conector.

### 9.22 Reporte semanal honesto — V1

Requisito de Pablo (17 oct 2026): recibir cada semana un resumen sincero de cómo lo ha hecho, en base a su actividad real.

- RF-2201: Informe semanal automático con tono **honesto, no adulador**: si la semana fue floja, lo dice con datos y sin suavizarlo; si fue buena, lo reconoce. Contenido mínimo: tareas completadas vs creadas, vencidas arrastradas, cumplimiento de hábitos (% y rachas rotas), comparativa con la semana anterior y 1-3 observaciones accionables. Añade tiempo de foco cuando exista el Pomodoro (V2).
- RF-2202: Configurable en ajustes: día y hora de envío (default: domingo 20:00, zona horaria del usuario), canales (Telegram cuando exista RF-2003, email, push), tono (`honesto` por defecto, `neutro`, `motivador`) y secciones incluidas.
- RF-2203: Implementado sobre el motor de automatizaciones (trigger cron semanal, 11.3) con una plantilla: el backend calcula los KPIs y redacta el informe con reglas deterministas sobre esos datos.
- RF-2204: Histórico de informes (5.19) consultable en la app (`/reports/weekly/{semana}`) y por API (`GET /api/v1/reports/weekly`), disponible también por MCP.

### 9.23 Revisión diaria y semanal asistida — V1

Recomendación aceptada por Pablo (17 oct 2026): que el sistema proponga, no solo liste.

- RF-2301: **Revisión diaria**: a la hora del daily reminder (o al abrir Today por primera vez en el día), el sistema propone una lista corta de «hoy» (3-7 tareas) priorizada por vencimiento, prioridad, hábitos del día y huecos en el calendario; el usuario la acepta, reordena o recorta con un gesto. La selección queda marcada en la vista Today.
- RF-2302: **Revisión semanal guiada**: recorrido opcional por tareas vencidas, sin fecha, listas estancadas (sin movimiento en X días) y hábitos en riesgo, con acciones rápidas (replanificar, mover a «algún día», borrar). Complementa el reporte semanal (9.22): el reporte mira atrás, la revisión prepara la semana.
- RF-2303: Las propuestas se calculan en backend con reglas transparentes (misma gramática de filtros, 5.7) y se exponen por API y MCP (`GET /api/v1/review/daily`, `GET /api/v1/review/weekly`), de modo que un agente personal pueda conducir la revisión también por Telegram.

---

## 10. API pública (diseño completo) — MVP para recursos núcleo

Principio rector: **la API cubre el 100% del dominio**, no un subconjunto reducido. La propia UI consume esta API.

### 10.1 Autenticación y autorización

- **Personal Access Tokens (PAT)** con scopes granulares, creados desde ajustes: vía rápida para scripts y agentes personales. **Un token por agente o script** (ChatGPT, Cursor, Instinct, etc.), con nombre propio, los scopes mínimos necesarios, revocación inmediata, último uso visible y registro en el ActivityLog de cada acción realizada con ese token (qué agente, qué hizo y cuándo).
- **OAuth2 Authorization Code + PKCE** para aplicaciones de terceros (pantalla de consentimiento con scopes explícitos).
- Sesiones de la propia UI con cookies httpOnly + CSRF.
- Scopes: `tasks:read`, `tasks:write`, `lists:read`, `lists:write`, `tags:read`, `tags:write`, `filters:read`, `filters:write`, `habits:read`, `habits:write`, `focus:read`, `focus:write`, `notes:read`, `notes:write`, `calendar:read`, `calendar:write`, `reminders:write`, `webhooks:manage`, `automations:manage`, `profile:read`, `backup:read`.
- Rate limiting por token: 1000 req/15 min default, cabeceras `X-RateLimit-*`, `429` con `Retry-After`.

### 10.2 Convenciones

- Base: `https://todo.reflexionia.com/api/v1`. Versionado en path. JSON en todo. Fechas ISO 8601 con offset (`2019-11-13T03:00:00+0000` aceptado por compatibilidad con el formato de fecha de la Open API pública; `Z`/offset normal preferido).
- Paginación por cursor: `?limit=50&cursor=...`, respuesta con `next_cursor`. Filtros por query params (`?project_id=`, `?status=active`, `?due_before=`, `?tag=`).
- Idempotencia en POST con cabecera `Idempotency-Key` (evita tareas duplicadas por reintentos de red en offline).
- Errores: `{error: {code, message, details}}` con códigos estables (`task_not_found`, `validation_failed`, `scope_missing`...).
- ETag/If-None-Match en GETs de colección para clientes que cachean.
- `X-Request-Id` en todas las respuestas.
- Documentación OpenAPI 3.1 generada del código, publicada en `/api/docs`, con colección Postman exportada.

### 10.3 Endpoints (resumen por recurso)

Tareas:

```
GET    /api/v1/tasks                      listado con filtros (proyecto, fecha, tag, prioridad, estado, búsqueda, overdue)
POST   /api/v1/tasks                      crear (soporta `raw_text` con parseo NLP server-side)
GET    /api/v1/tasks/{id}
PATCH  /api/v1/tasks/{id}
DELETE /api/v1/tasks/{id}                 papelera
POST   /api/v1/tasks/{id}/complete
POST   /api/v1/tasks/{id}/uncomplete
POST   /api/v1/tasks/{id}/move            {project_id, column_id, before_task_id?}
POST   /api/v1/tasks/{id}/duplicate
GET    /api/v1/tasks/{id}/occurrences          ocurrencias teóricas (?from&to, RF-704)
POST   /api/v1/tasks/{id}/occurrences/detach   desvincula una ocurrencia (EXDATE, RF-705)
POST   /api/v1/tasks/{id}/snooze               aplaza la fecha (tomorrow | next_week | date, RF-605)
POST   /api/v1/tasks/batch                operaciones masivas (complete/move/tag/priority/due/delete)
GET    /api/v1/tasks/completed            historial de completadas (?from&to)
GET    /api/v1/tasks/trash                papelera
DELETE /api/v1/tasks/trash                vaciar papelera (RF-306)
POST   /api/v1/tasks/trash/{id}/restore
```

`POST /tasks` con `raw_text` parsea en el servidor (RF-102) y crea la tarea por el mismo camino que el resto del CRUD (idempotencia, outbox, eventos). Los campos explícitos del cuerpo pisan lo parseado. Si el parser deja el título vacío no se crea nada (`empty_title`). Un `title` explícito se guarda tal cual, espacios de los extremos incluidos, y `""` es válido. Si `^lista` o `~lista` no existe, se crea el proyecto en la misma transacción y la respuesta incluye `warnings` con `list_created`. Si `#etiqueta` no existe, se crea y se asocia (`tag_created`). `project_id` explícito no crea la lista parseada; `tag_ids` explícito no crea las etiquetas parseadas. `repeat_rule` válido se guarda carácter a carácter (sin anteponer `DTSTART` ni quitar `INTERVAL=1`). El resaltado anterior a confirmar lo hace el cliente con el mismo parser de `packages/domain`; no hay endpoint de preview.

Checklist items: `POST/PATCH/DELETE /api/v1/tasks/{id}/items[/{itemId}]`, `POST .../items/{itemId}/complete`.

Adjuntos (RF-203): `POST/GET /api/v1/tasks/{id}/attachments` (multipart en streaming, 25 MiB), `POST …/drive-session` + PUT directo a Drive + `POST …/drive-complete` (100 MiB) y `POST …/drive-link` (Picker). GET del adjunto redirige a Drive; `GET /api/v1/attachments/{id}/preview` redirige sin caché a su miniatura. DELETE conserva el fichero salvo trash_in_drive=true; ttd no sirve ni guarda binarios.

Listas y estructura:

```
GET/POST         /api/v1/projects
GET/PATCH/DELETE /api/v1/projects/{id}
GET              /api/v1/projects/{id}/data        lista + tareas + columnas (equiv. `/open/v1/project/{id}/data`)
POST             /api/v1/projects/{id}/archive | /unarchive | /archive-completed
GET/POST         /api/v1/folders
GET/PATCH/DELETE /api/v1/folders/{id}
GET/POST/PATCH/DELETE /api/v1/projects/{id}/columns[/{columnId}]
```

Etiquetas: `GET/POST /api/v1/tags`, `GET/PATCH/DELETE /api/v1/tags/{id}`, `POST /api/v1/tags/merge`.

Filtros y smart lists:

```
GET/POST         /api/v1/filters
GET/PATCH/DELETE /api/v1/filters/{id}
POST             /api/v1/filters/preview     evalúa rules sin guardar, devuelve tareas que casan
GET              /api/v1/filters/{id}/tasks  evaluación persisted
GET              /api/v1/smart-lists
PATCH            /api/v1/smart-lists         activar y ordenar
GET              /api/v1/smart-lists/{key}/tasks
```

Recordatorios: `GET/POST/DELETE /api/v1/tasks/{id}/reminders[/{rid}]`, `POST /api/v1/tasks/{id}/reminders/{rid}/snooze` (RF-804). Web Push: `POST/DELETE /api/v1/me/push-subscriptions`. `PATCH /api/v1/me` acepta `daily_reminder_time` (`HH:mm`, RF-805). Completar una recurrente no crea la siguiente fila: lo hace el scheduler (RF-704, RF-808).

Hábitos: `GET/POST /api/v1/habits`, `GET/PATCH/DELETE /api/v1/habits/{id}`, `POST /api/v1/habits/{id}/checkins` ({date, count, note}), `GET /api/v1/habits/{id}/stats`.

Focus: `POST /api/v1/focus/sessions` (start; `type=stopwatch` o duración por sesión `planned_minutes`), `POST /api/v1/focus/sessions/{id}/pause | /resume` (persisten pausas), `POST /api/v1/focus/sessions/{id}/finish | /abort`, `GET /api/v1/focus/sessions?from&to&cursor&limit` (título de tarea, pausas y cursor), `GET /api/v1/focus/stats?tz=` (zona IANA, por defecto cuenta; totales y resumen de hoy), `GET/PATCH /api/v1/focus/settings`.

Notas: mismas rutas de tasks con `kind=note` + `GET /api/v1/notes` atajo filtrado.

Calendario: `GET /api/v1/calendar/events?from&to` (tareas con fecha + eventos externos unificados), `GET/POST/DELETE /api/v1/calendar/subscriptions[/{id}]`, `POST /api/v1/calendar/feeds` (crear feed iCal por lista/filtro), `DELETE /api/v1/calendar/feeds/{id}` (revocar).

Búsqueda: `GET /api/v1/search?q=&types=task,note&filters...`.

Dashboard: `GET /api/v1/dashboard/widgets`, `GET /api/v1/dashboard/data?widget=&period=`, `GET/PATCH /api/v1/me/dashboard`. Reportes: `GET /api/v1/reports/weekly[/{semana}]`, `GET/PATCH /api/v1/me/report-settings`.

Revisiones asistidas: `GET /api/v1/review/daily`, `GET /api/v1/review/weekly`.

Import/export: `POST /api/v1/import/ticktick` (con credenciales OAuth del usuario o token), `POST /api/v1/import/csv`, `GET /api/v1/export/json | /csv?project_id= | /ical?filter_id=`, `GET /api/v1/backups`, `POST /api/v1/backups/restore`.

Administración: `GET/PATCH /api/v1/me`, `DELETE /api/v1/me` (confirmación con el correo), `GET/POST/DELETE /api/v1/me/tokens`, `GET /api/v1/me/activity`, `GET /api/v1/me/tokens/{id}/activity`.

Sesión: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/session`, `GET /api/v1/auth/sessions`, `DELETE /api/v1/auth/sessions/{id}`.

OAuth2 Authorization Code + PKCE: `POST /api/v1/oauth/clients`, `GET /api/v1/oauth/authorize`, `POST /api/v1/oauth/authorize`, `POST /api/v1/oauth/token`.

Sync: `GET /api/v1/sync?since=<event_id>&limit=`.

Preferencias de vista (TTD-AUD-59): `GET/PUT /api/v1/me/view-preferences/{key}`, por propietario, con scopes `profile:read/write`; cada cambio publica `account.view_preference_updated@v1`.

MCP (RF-2001): `POST /api/v1/mcp` (JSON-RPC, `application/json`; notificación → 202). `GET` y `DELETE /api/v1/mcp` → 405 hasta que exista SSE de servidor a cliente. Sin `Mcp-Session-Id` mientras no haya sesión. Tools en `MCP_TOOLS`, nunca con más privilegios que el PAT. `api_catalog` descubre el contrato generado de OpenAPI; `api_request` permite las operaciones restantes a través de los mismos guards HTTP, incluido multipart con un archivo base64 de hasta 25 MB. Las operaciones que requieren sesión de navegador conservan esa restricción. Paginación con el `cursor` de la API v1.

Rutas que esta entrega añade al resumen: `GET/PUT /api/v1/matrix/rules`; `POST /api/v1/calendar/subscriptions/{id}/refresh`; `POST /api/v1/calendar/subscriptions/{id}/push`; `GET /feeds/{token}.ics` (fuera de `/api/v1`); `GET/POST/PATCH/DELETE /api/v1/sticky-notes`; `POST /api/v1/tasks/{id}/convert`; `GET /api/v1/tasks/{id}/attachments/{attachmentId}/thumbnail`; `GET /api/v1/events/stream`; `GET/POST/DELETE /api/v1/webhooks` y `POST /api/v1/webhooks/{id}/ping`; `GET/POST /api/v1/automations` y `POST /api/v1/automations/{id}/run`; `GET/POST/DELETE /api/v1/projects/{id}/members`, `POST /api/v1/projects/{id}/presence`, `GET /api/v1/projects/{id}/activity`, `GET/POST /api/v1/tasks/{id}/comments`, `POST /api/v1/tasks/{id}/assignee`; `GET/POST/DELETE /api/v1/plugins`; `POST /api/v1/me/totp`, `POST /api/v1/me/totp/confirm`, `POST /api/v1/me/totp/disable`; `POST /api/v1/me/location`; `GET/PATCH /api/v1/me/achievements`; `GET /api/v1/integrations/telegram`, `POST /api/v1/integrations/telegram/link`, `POST /api/v1/integrations/telegram/webhook`; `GET /api/v1/integrations/drive`, `POST /api/v1/integrations/drive/attachments`. `/open/v1` queda descrito en 10.4 y no lleva el prefijo `/api/v1`.

Email-to-task (RF-105): `GET /api/v1/me/inbound-email` dice si hay dirección (sin el token), `POST /api/v1/me/inbound-email` la crea o regenera y muestra el token una sola vez, `DELETE /api/v1/me/inbound-email` la revoca al momento. `POST /api/v1/inbound/email` recibe `multipart/form-data` (`recipient`, `subject`, `text`, `message_id`, `file`). El token del destinatario autentica la entrega. El asunto pasa por el mismo parser que `raw_text`, el cuerpo se guarda como contenido y los adjuntos como Attachment (25 MB). Es entrada no confiable: se valida, se limita el tamaño y no se ejecuta nada. El token no se guarda en claro.

### 10.4 Compatibilidad TickTick (opcional pero recomendada)

Capa de compatibilidad `GET /open/v1/...` compatible con la forma de la Open API pública de TickTick (mismos nombres de campo: `projectId`, `repeatFlag`, `sortOrder`, `items`...). Permite reutilizar integraciones existentes de terceros (MCP servers, CLIs, atajos) contra nuestro backend cambiando solo la URL base y el token. Implementación: adaptador fino sobre los servicios de dominio. Prioridad V1.

---

## 11. Eventos, webhooks y automatizaciones — V1 (la razón de ser del proyecto)

### 11.1 Catálogo de eventos de dominio

Todos versionados (`task.created@v1`). Mínimo:

```
series.closed task.created task.updated task.completed task.uncompleted task.reopened task.cancelled task.deleted task.restored task.moved task.due_soon task.overdue plan.applied plan.shutdown_started plan.shutdown_applied plan.replan_applied plan.replan_discarded task.someday_set task.someday_unset
checklist_item.created checklist_item.updated checklist_item.completed checklist_item.uncompleted checklist_item.deleted
project.created project.updated project.archived project.unarchived project.deleted
folder.created folder.updated folder.deleted
column.created column.updated column.deleted
tag.created tag.updated tag.deleted tag.merged
habit.created habit.updated habit.deleted habit.checkin habit.streak_broken habit.goal_met
filter.created filter.updated filter.deleted smart_list.updated token.created token.revoked session.created session.revoked account.deleted account.password_changed oauth.token_issued oauth.token_refreshed oauth.refresh_reused
focus.session_started focus.session_finished focus.session_aborted focus.session_paused focus.session_resumed focus.settings_updated
account.view_preference_updated
reminder.fired
note.created note.updated
calendar.event_imported calendar.subscribed calendar.feed_rotated
calendar.subscription_created calendar.subscription_updated calendar.subscription_deleted calendar.synced calendar.subscription_resynced calendar.sync_failed
automation.executed
matrix.updated dashboard.updated report.generated
sticky_note.created sticky_note.updated sticky_note.deleted
comment.created project.shared task.assigned presence.updated
plugin.installed plugin.removed
totp.enabled totp.disabled achievement.updated
import.completed drive.attached telegram.linked telegram.unlinked google.disconnected webhook.created
```

En `token.created@v1` y `token.revoked@v1`, la representación `token` incluye
los campos aditivos `oauth_client_id` y `expires_at` (ambos anulables), iguales
al DTO público. Identifican la aplicación y la caducidad; nunca contienen el secreto.

En `google.disconnected@v1`, `google` incluye `connected:false`, `revocation_requested`,
`revoked` e `imported_events_removed`. La revocación remota usa solo la credencial del
propietario; un fallo de red no impide desconectar localmente. Los eventos importados
se conservan salvo `DELETE /integrations/google?remove_imported_events=true` explícito.
Los adjuntos de Drive se conservan siempre como metadatos y enlaces.

En `report.generated@v1`, la semana (`week` en automatizaciones, `report.week`
en generación manual) es la fecha civil del lunes en la zona del propietario.
Ambos productores guardan el mismo payload verificable `metrics_version=2`, con
siete días y `calculated_at`; los históricos no se recalculan al leerlos.

Payload ejemplo:

```json
{
  "id": "evt_01J...",
  "type": "task.completed@v1",
  "occurred_at": "2026-10-17T09:11:04Z",
  "actor": {"kind": "user|api|automation|plugin", "id": "..."},
  "data": {"task": { "...entidad completa tras el cambio..." }},
  "previous": {"status": "active"}
}
```

### 11.2 Webhooks salientes

- RF-11010: CRUD de endpoints webhook por API y UI: URL, secreto, lista de eventos suscritos, filtro opcional (p. ej. solo tareas de una lista o con etiqueta), activo/pausado.
- Firma HMAC-SHA256 en cabecera `X-Signature-256` con secreto por endpoint (verificación estándar).
- Entrega con reintentos exponenciales (10 intentos en 24 h), registro de entregas con último código HTTP, botón "reenviar" y "ping" de prueba.
- Cola aislada: un endpoint lento nunca bloquea los demás.

### 11.3 Motor de automatizaciones internas

Reglas `when → if → then` definidas por el usuario (UI + API, scope `automations:manage`):

```json
{
  "name": "Vencidas importantes a revisión",
  "trigger": { "event": "task.overdue@v1" },
  "conditions": {
    "combinator": "AND",
    "conditions": [{ "field": "priority", "op": "gte", "value": "medium" }]
  },
  "actions": [
    { "type": "add_tag", "tag": "revisar" },
    { "type": "notify", "channel": "push", "text": "Tarea importante vencida: {{task.title}}" },
    { "type": "webhook", "url": "https://..." },
    { "type": "create_task", "project": "Inbox", "title": "Replanificar {{task.title}}" }
  ]
}
```

- Acciones mínimas: `add_tag`, `remove_tag`, `set_priority`, `move_to_list`, `reschedule`, `create_task`, `notify`, `webhook`, `run_plugin_action` (V2).
- Triggers adicionales de tiempo: `cron` (expresión cron, p. ej. "cada lunes 9:00") y `date_arrived` (tarea alcanza start/due).
- Condiciones usan la misma gramática de filtros (5.7): una sola implementación.
- Plantillas con variables `{{task.*}}`, `{{habit.*}}`, `{{now}}`.
- Log de ejecuciones por regla con resultado y errores.

---

## 12. Sistema de plugins — V2

Objetivo: que cualquier funcionalidad nueva (integración con otra app, una vista distinta, un tipo de recordatorio) sea un plugin, no un fork.

### 12.1 Manifiesto

```json
{
  "id": "com.pablo.mi-plugin",
  "version": "1.0.0",
  "name": "Mi plugin",
  "permissions": ["tasks:read", "webhooks:receive", "ui:commands"],
  "entrypoints": {
    "commands": "./commands.js",
    "nlp_patterns": "./nlp.js",
    "automations": "./actions.js",
    "views": "./views/"
  }
}
```

### 12.2 Puntos de extensión (mínimos)

1. **Comandos de la paleta** (Ctrl/Cmd+K): el plugin registra comandos con UI propia en iframe sandboxed o componentes declarativos.
2. **Patrones NLP**: extienden el parser de quick add (RF-103).
3. **Acciones de automatización**: nuevos `type` disponibles en el motor (11.3).
4. **Vistas personalizadas**: renderizado de una lista/filtro con layout propio (iframe + bridge API tipado).
5. **Recepción de eventos**: el plugin declara una URL interna y recibe eventos como un webhook más, con entrega garantizada.
6. **Campos personalizados**: el plugin añade campos con esquema a tareas (persistidos en `metadata` namespaced por `plugin_id`).

### 12.3 Seguridad

- Ejecución en worker aislado con red restringida (allowlist de dominios declarada) y cuota de CPU/memoria.
- Permisos declarados en manifiesto y otorgados al instalar, revocables.
- Los plugins se instalan desde repositorio git o paquete local; firma opcional.

---

## 13. Sincronización y offline — MVP (base), V1 (tiempo real)

- RF-13010: Cliente offline-first: cola local de mutaciones con `Idempotency-Key`, replay al reconectar.
- Prioridad de Pablo: la PWA móvil debe seguir funcionando sin conexión desde el MVP — crear, editar y completar tareas offline y que todo converja sin duplicados al volver la red (criterio de aceptación 5).
- RF-13011: Delta sync: `GET /api/v1/sync?since=<cursor>` devuelve cambios (upserts y tombstones) desde el cursor; el cursor es el `event_id` del bus.
- RF-13012: Resolución de conflictos: last-write-wins por campo con `updated_at`; completar/borrar gana a edición de texto si llega después; los conflictos se registran en ActivityLog. (Suficiente para uso personal; CRDT queda fuera.)
- RF-13013: Tiempo real entre dispositivos abiertos: WebSocket/SSE que empuja eventos del bus al cliente.
- RF-13014: Tamaño de página de sync y tombstones retenidos 90 días.

---

## 14. Notificaciones (infraestructura) — MVP

- Canales: Web Push (PWA), email (SMTP transaccional), Telegram (V1, RF-2003) y canal `automation` interno.
- Centro de preferencias por tipo: recordatorios de tareas, daily reminder, hábitos, fin de pomodoro, automatizaciones.
- Horario de silencio configurable (no molestar 22:00-08:00 default) con excepción para recordatorios marcados como "críticos".
- Todas las notificaciones quedan registradas (qué, cuándo, canal, entregada/leída).

---

## 15. Seguridad y privacidad — MVP

- Contraseñas con Argon2id; 2FA TOTP (V1); sesiones revocables.
- PATs con hash almacenado y último uso visible.
- TLS extremo a extremo; secretos en variables de entorno / gestor de secretos; cifrado at-rest del volumen de datos.
- Tokens de feeds iCal y dirección email-to-task regenerables (revocación inmediata).
- Auditoría: ActivityLog por usuario con IP/agente para acciones de cuenta, y **registro por token de cada operación de los agentes externos**, consultable en `GET /api/v1/me/tokens/{id}/activity`.
- Datos del usuario exportables y borrables por completo (RF-1703 + `DELETE /api/v1/me` con confirmación).
- Sin telemetría a terceros por defecto.

---

## 16. Requisitos no funcionales

| Área           | Requisito                                                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendimiento    | p95 < 200 ms en lecturas de listas típicas (<5k tareas visibles); quick add < 300 ms incluyendo NLP; búsqueda < 300 ms con 100k tareas                                |
| Escalabilidad  | diseño válido hasta 50 usuarios / 1M tareas por instancia sin cambios (sobra para uso personal y pequeño equipo)                                                      |
| Disponibilidad | backup diario + restauración probada (RF-1704); RPO 24 h, RTO 1 h                                                                                                     |
| i18n           | español e inglés desde el MVP; todas las cadenas externalizadas; NLP al menos en ambos                                                                                |
| Accesibilidad  | WCAG 2.1 AA en web: navegación completa por teclado, contraste, aria-labels en vistas complejas                                                                       |
| Navegadores    | últimas 2 versiones de Chrome/Firefox/Safari/Edge; PWA instalable en Android/iOS                                                                                      |
| Observabilidad | logs estructurados JSON, métricas (Prometheus), alertas básicas (cola de recordatorios atrasada, webhooks fallando)                                                   |
| Tests          | pirámide: unitarios de dominio (recurrencias, filtros, NLP) con cobertura >80% en esos módulos, integración de API, e2e de flujos críticos (crear→recordar→completar) |

---

## 17. Criterios de aceptación globales

1. Pablo puede vivir una semana usando solo esta app sin perder: captura rápida, filtros, recurrentes, recordatorios y hábitos (el Pomodoro llega en V2).
2. Todo lo hecho en la UI se puede reproducir con `curl` contra la API documentada.
3. Un cambio de una tarea dispara el webhook suscrito en < 5 s.
4. Un agente externo (ChatGPT, Cursor, etc.) conecta por MCP con un PAT de scopes limitados y puede listar, crear y completar tareas sin tocar nada fuera de sus scopes.
5. Sin red, se pueden crear/editar/completar tareas y al volver la red todo converge sin duplicados.
6. El dashboard muestra los KPIs de la semana con el layout configurado, y el reporte semanal llega por el canal elegido con el tono elegido (por defecto: domingo 20:00, honesto).

---

## 18. Convenciones de desarrollo

- Monorepo (pnpm workspaces): `apps/web`, `apps/api`, `packages/domain` (reglas de negocio puras: recurrencias, filtros, NLP), `packages/sdk` (cliente TS de la API generado del OpenAPI).
- Las reglas de negocio viven en `packages/domain` sin dependencias de framework: así el motor de automatizaciones, la API y los clientes comparten exactamente el mismo código de filtros y recurrencias.
- Migraciones de base de datos con Prisma Migrate, siempre reversibles.
- Commits con conventional commits; CI con lint, typecheck, tests unitarios e integración; despliegue con `docker compose up` (Caddy + API + Postgres + Redis si aplica) en el VPS, documentado en el README.
- El OpenAPI se genera del código (no al revés) y se verifica en CI que no hay endpoints sin documentar.

---

Cuándo, Algún día, Esta noche, la proyección de carga, el cierre del día y replanificar (versión ligera) están en `docs/spec/spec-cierre-carga-cuando-replan-v1.0-65f029aa.md` (RF-2601–RF-2692). La auto-planificación estilo Motion queda fuera, descrita en el §12 de ese documento.

Al salir de Algún día sin elegir cuándo, la tarea vuelve al comportamiento de solo fecha límite: si el límite ya pasó, entra en vencidas y el aviso reaparece. No hay un estado intermedio distinguible de las tareas antiguas que solo tienen `dueDate`.

## 19. Plan por fases

**MVP / fase 1 (4-6 semanas de agente, uso personal ya posible):**
modelo de datos completo de tareas/listas/etiquetas/filtros (multiusuario desde el inicio, D5) · quick add con NLP · CRUD tareas + checklist + subtareas · fechas/recurrencias/recordatorios push+email · **hábitos con recordatorios y estadísticas (RF-1301–1305), fáciles de adoptar y configurar** · smart lists + filtros · vista lista · búsqueda + paleta · API v1 de esos recursos + **PAT con scopes granulares + servidor MCP (RF-2001/2002)** · export JSON · offline básico (cola de mutaciones) · Docker Compose con Caddy en un VPS (`todo.reflexionia.com`).

Puntos 1 a 3 cerrados en `feat/core-tasks` (base, tareas núcleo y tiempo). El scheduler es quien materializa la siguiente ocurrencia y dispara los recordatorios.

**V1:** implementado en la PR #12 (18 oct 2026) y cerrado en lo que faltaba en la PR #14. El webhook de Telegram crea la tarea y contesta en el chat. Calendar lee con el refresh token guardado. Drive adjunta por enlace o copia, y el backup diario puede volcarse a `GOOGLE_DRIVE_FOLDER_ID`. Está desplegado en el dominio público (pila propia, sin `AUTH_MODE=dev`, detrás del Caddy del borde). El importador externo (RF-1701) sigue aplazado. La spec no se publica como v1.2.
Kanban, Timeline, Eisenhower · calendario completo + suscripciones iCal + Google Calendar (lectura) + feeds propios · **bot de Telegram (RF-2003)** · **Google Drive: adjuntos y backups (RF-2005)** · notas · **dashboard de KPIs / jardín digital (RF-2101–2105)** · **reporte semanal honesto (RF-2201–2204)** · **revisión diaria/semanal asistida (RF-2301–2303)** · webhooks + automatizaciones · sync en tiempo real · capa de compatibilidad `/open/v1` · import CSV, export iCal/CSV · 2FA.

**V2:** implementado en el mismo corte. La escritura de Google Calendar usa el refresh token guardado en el usuario; desde la PR #14 actualiza el evento en lugar de duplicarlo. Apps nativas y widgets de iOS/Android no entran: la sección 21 no se reabre. El importador externo (RF-1701) sigue fuera.
colaboración (compartir listas con permisos — p. ej. la lista compartida con su pareja —, asignar, comentarios) · **Pomodoro/Focus con estadísticas (RF-1201–1206)** · plugins · widgets nativos / apps móviles · logros · WIP limits y otras mejoras propias · Google Calendar two-way · (opcional, solo si surge la necesidad) importador externo (RF-1701).

---

## 20. Riesgos y mitigaciones

| Riesgo                                                                               | Mitigación                                                                                                                                   |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Alcance enorme para un solo desarrollador/agente                                     | Fases duras; el MVP ya es usable; cada RF es independiente y testeable                                                                       |
| Recurrencias y zonas horarias: fuente clásica de bugs                                | Usar librería probada (rrule.js / dateutil), suite de tests de casos límite (RF-706)                                                         |
| NLP en español pobre                                                                 | Empezar con reglas, no ML; resaltar lo detectado para corrección manual inmediata                                                            |
| PWA: push y background timer limitados en iOS                                        | Sesiones de focus persistidas en servidor (RF-1205); Web Push en iOS requiere app instalada: documentarlo                                    |
| Exposición a agentes externos (MCP/PAT) desde fase 1                                 | Scopes granulares, tokens revocables con último uso visible, rate limiting por token; el servidor MCP hereda los límites del token (RF-2001) |
| Instancia única en un VPS: punto único de fallo                                      | Backup diario externo y restauración probada (RF-1704); RPO 24 h / RTO 1 h asumidos en sección 16                                            |
| Importador externo (RF-1701, aplazado) limitado por la Open API pública si se retoma | Documentar lo no exportable (hábitos/pomodoros) y ofrecer recreación guiada                                                                  |

---

## 21. Decisiones de Pablo (resuelta el 17 oct 2026)

Las preguntas abiertas originales quedaron resueltas así:

1. **Plataformas**: solo PWA web en fase 1, bien cuidada en móvil y escritorio. Apps nativas más adelante.
2. **Stack**: TypeScript extremo a extremo confirmado: NestJS + PostgreSQL + Prisma en backend, React + TypeScript en frontend.
3. **Nombre y dominio**: `todo.reflexionia.com` (app, API, feeds iCal, email-to-task, emails transaccionales).
4. **Alojamiento**: un VPS con Docker, Docker Compose (API, PostgreSQL, Redis si hace falta) y Caddy con HTTPS automático.
5. **Usuarios**: lanzamiento con un solo usuario, pero modelo de datos multiusuario desde el principio y compartición de listas en el roadmap (caso de uso: lista compartida con su pareja para ver y editar).
6. **Prioridad de módulos**: los hábitos con recordatorios entran en fase 1, con foco en que sean fáciles de adoptar y configurar. El Pomodoro pasa a fase 2 (V2).
7. **Migración**: sin importación desde otro gestor; se empieza desde cero. Importador fuera del MVP (RF-1701 aplazado).
8. **Integraciones**: prioridad 1) agentes personales (ChatGPT, Cursor, Instinct...) vía **servidor MCP + API REST con PATs de scopes granulares, requisito de fase 1**; 2) Telegram (consultar y crear tareas); 3) Google Calendar; 4) Google Drive.

---

## 22. Apéndice A: referencia de la Open API de TickTick (para el importador y la capa de compatibilidad)

Resumen verificado contra la documentación pública (developer.ticktick.com, octubre 2026):

- Auth: OAuth2 (`https://ticktick.com/oauth/authorize`, `.../oauth/token`), Basic Auth con client_id/secret al canjear el code, scopes `tasks:read tasks:write`, Bearer token en `api.ticktick.com`.
- Endpoints: `GET /open/v1/project`, `GET /open/v1/project/{id}`, `GET /open/v1/project/{id}/data`, `POST /open/v1/project`, `POST /open/v1/project/{id}`, `DELETE /open/v1/project/{id}`; `GET /open/v1/project/{projectId}/task/{taskId}`, `POST /open/v1/task`, `POST /open/v1/task/{taskId}`, `POST /open/v1/project/{projectId}/task/{taskId}/complete`, `DELETE /open/v1/project/{projectId}/task/{taskId}`.
- Task: `id, projectId, title, content, desc, isAllDay, startDate, dueDate, timeZone, reminders[TRIGGER:...], repeatFlag (RRULE), priority (0/1/3/5), status (0 normal / 2 completada), completedTime, sortOrder, items[ChecklistItem]`.
- ChecklistItem: `id, title, status (0/1), completedTime, isAllDay, sortOrder, startDate, timeZone`.
- Project: `id, name, color, sortOrder, closed, groupId, viewMode (list|kanban|timeline), permission (read|write|comment), kind (TASK|NOTE)`.
- Column: `id, projectId, name, sortOrder`.
- **No expone**: hábitos, pomodoros, filtros, etiquetas como recurso, notas sueltas, estadísticas, webhooks. Esta carencia es la justificación del proyecto.

## 23. Apéndice B: fuentes consultadas

- Documentación de la Open API de TickTick: https://developer.ticktick.com/ (vía espejo del documento openapi en repositorios públicos de integración).
- Centro de ayuda de TickTick (taxonomía de funciones: tareas, listas, filtros, Pomodoro, hábitos, calendario, Eisenhower, Timeline, colaboración, integraciones, widgets, sticky notes): https://help.ticktick.com/
- Página de funciones: https://ticktick.com/features

> Nota: no se usó ninguna credencial para esta especificación; todo proviene de documentación pública. Si en desarrollo hace falta explorar la app con sesión iniciada para detalles de UI/UX, hacerlo a través del gestor de contraseñas del usuario, nunca con credenciales pegadas en conversaciones.

---

_Fin del documento. Mantener versionado junto al código; cada fase cerrada actualiza la sección 19._


Actualización r80 (RF-2001): GET autenticado con Accept: text/event-stream ofrece notificaciones de cambio del catálogo; POST sigue sin sesión. Otros GET y DELETE devuelven 405. Eventos añadidos: `occurrence.detached@v1` (tarea, actor y origen) y `plan.replan.discarded@v1` (sesión descartada).


Eventos r80, RF-203/RF-2005: `attachment.removed@v1` (task_id y trash_in_drive) e `integration.google.reauth_required@v1` (google_status). `drive.attached@v1` contiene solo metadatos, actor y origen; ningún binario.

TTD-AUD-100 (RF-201/RF-202/RF-2001/RF-2002): TaskLink pertenece a Tasks; GET/POST /tasks/{id}/links y DELETE /tasks/{id}/links/{linkId}. Detección pura al capturar/editar título/contenido, preserva manuales. Eventos `task.link_added@v1` y `task.link_removed@v1` (task_id y metadatos/link_id). El unfurl opcional guarda solo título (200 caracteres), HTML público limitado a 256 KiB/3 segundos totales/3 redirecciones; resolución fijada por salto. Una URL privada puede guardarse sin consultarla.

TTD-AUD-101 (RF-1201/1203/1205): GET/PUT/PATCH /focus/settings expone duraciones, auto_start_breaks, auto_start_focus, alarm_sound, volume, ambient_sound y daily_goal. focus.settings_updated@v1 incluye las preferencias. Los MP3 de la web son síntesis CC0 local; los archivos no son adjuntos de usuario.

TTD-AUD-102 (RF-802/804/805/808): GET/PUT /me/notifications/settings, POST /me/notifications/test (solo propietario), GET /me/notifications/deliveries (50/cursor). notification.settings_updated@v1 contiene preferencias sin secretos. POST /reminders/{deliveryId}/action usa una capacidad de un uso (hash, TTL24h), nunca un token de cuenta; completar y consumir son transaccionales. Resultados por canal en NotificationReceipt vinculados a ReminderDelivery; el scheduler aplica matriz y silencio antes del transporte, dejando email intacto.

TTD-AUD-103 (RF-2003): GET /integrations/telegram incluye bot_username, username, display_name, linked_at, status y enabled. POST /integrations/telegram/pairing devuelve deep_link y expires_at (TTL10min); POST /integrations/telegram/recheck verifica el desbloqueo. Evento telegram.status_changed@v1 con status y propietario, sin credenciales. DELETE conserva soft delete y envía despedida; los envíos posteriores se omiten por not_linked.
