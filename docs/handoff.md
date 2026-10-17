# Handoff — tiempo (fase 1, punto 3)

Punto seguro para retomar. Lint, typecheck, tests unitarios e integración pasan. Este estado está en la rama `feat/core-tasks` con el tag `phase-1.3`. No está en `main`: la norma del repo impide commits directos a esa rama.

## Dónde estamos

Cerrado el punto 3 de la fase 1 (`docs/roadmap.md`): fechas y zonas (RF-601–605), recurrencias (RF-701–706) y recordatorios push+email con scheduler (RF-801–808).

La API pública sigue en `/api/v1`. OpenAPI está en `/api/docs` y el JSON commiteado es `apps/api/openapi.json`.

Siguiente trabajo: punto 4, captura. Quick add con NLP en español e inglés (RF-101–107), email-to-task (RF-105) y share target (RF-106). `POST /tasks` sigue sin aceptar `raw_text`.

## Tags

| Tag | Qué marca |
|---|---|
| `phase-1.3-domain` | Fechas con zona, RRULE y disparo de recordatorios en `packages/domain` |
| `phase-1.3-schema` | Serie, cola de entregas y suscripciones push, con `down.sql` probado |
| `phase-1.3-api` | Ocurrencias, aplazamiento, vencidas, recordatorios y Web Push |
| `phase-1.3-scheduler` | Materialización de la siguiente ocurrencia y envío push/email |
| `phase-1.3` | Este handoff. Punto seguro para seguir |

Los tags `phase-1.2*` siguen en `feat/core-tasks`. Los `phase-1.1*` siguen en `main`.

## Cómo probar el tiempo

La auth de desarrollo no cambia: `AUTH_MODE=dev` y cabecera `X-Dev-User-Email`. El seed crea `demo@reflexionia.test`.

El scheduler vive en el proceso de la API. Arranca solo salvo `SCHEDULER_AUTOSTART=false` o `NODE_ENV=test`. El primer tick recupera lo vencido (catch-up) y luego repite cada 60 s. No hace falta un worker aparte.

```bash
curl -H 'X-Dev-User-Email: demo@reflexionia.test' \
  'http://localhost:3000/api/v1/tasks?overdue=true'
```

El correo sale por SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). En local, Mailpit escucha en `localhost:1025` y su bandeja en el puerto 8025. El push usa `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`. Si faltan, el envío queda en `skipped` y el evento se publica igual.

Integración, con Postgres migrado:

```bash
bash scripts/with-env.sh pnpm --filter api exec vitest run --config vitest.config.integration.ts
```

`scripts/with-env.sh` pisa `DATABASE_URL`. Para una base scratch hay que llamar a Prisma sin ese wrapper.

## Qué quedó dentro del corte

- `packages/domain`: vencidas y aplazar fecha (RF-603, RF-605), RRULE diaria/semanal/mensual/anual con intervalo, `UNTIL`, `COUNT`, `BYDAY` y `EXDATE` (RF-701), el día 29–31 cae en el último día del mes corto (RF-706) y la hora local se conserva al cambiar el horario de verano. `describeRepeatRule` devuelve la etiqueta en español; la pantalla del constructor (RF-702) no está. Cobertura del paquete: sentencias 88,91 %, ramas 80,36 % (el umbral es 80 %).
- Completar una recurrente no crea la siguiente fila. El scheduler la crea después, copia checklist (vuelto a activo), recordatorios y subtareas de un nivel, y publica `task.created` con `materialized_from`. La regla conserva el `DTSTART` original para que `COUNT` no se reinicie.
- `GET /api/v1/tasks/{id}/occurrences?from&to` calcula ocurrencias y no escribe nada. `POST .../occurrences/detach` saca una ocurrencia futura con `EXDATE` o, si es la actual, le quita la regla y deja un `series_advances` para que el scheduler cree la siguiente.
- Una serie tiene como mucho una tarea activa. El índice único parcial `tasks_one_active_per_series_idx` está solo en el SQL de la migración, no en el schema de Prisma, para que `prisma migrate diff` siga vacío.
- Duplicar una recurrente da a la copia su propia serie.
- Recordatorios relativos (`TRIGGER:-PT5M`, `TRIGGER:PT0S`, `RELATED=START`) y absolutos. El tipo `location` se guarda y no se programa (el geovallado es V1+, RF-806).
- Cola durable en `reminder_deliveries`, no en BullMQ. Horizonte de 48 h. En el arranque, lo ya vencido dentro de esas 48 h se marca `late` y se envía; lo más viejo deja una fila `late` y no se envía. Un recordatorio constante vuelve a encolarse (15 min por defecto) hasta completar o aplazar el aviso. Aplazar el aviso (`10m`, `1h`, `tomorrow`, `custom`) no mueve la fecha de la tarea y borra las entregas `scheduled` de ese recordatorio.
- `PATCH /api/v1/me` acepta `daily_reminder_time` (`HH:mm`). El aviso diario dice «Planifica tu día». Cambiar `time_zone` del perfil no reescribe las fechas ya guardadas (RF-604).
- `POST/DELETE /api/v1/me/push-subscriptions`.

Eventos nuevos de este corte (ya estaban en el catálogo 11.1): `task.overdue@v1`, `task.due_soon@v1`, `reminder.fired@v1`. El actor del scheduler es `automation` y su `actorId` es el usuario dueño, porque `ActivityLog.actorId` apunta a `users`.

## Decisiones que no hay que reabrir

- Sección 21 de la spec, sin cambios.
- Prisma sigue en 6.19. La migración `20261017124655_add_recurrence_series_and_reminder_queue` no toca los índices parciales de la inicial ni `search_vector`. `prisma migrate diff` contra el schema quedó vacío. El `down.sql` se probó en una base scratch.
- `typescript-eslint` sigue en 8.18.2 y `eslint` en 9.17.0 por Node 23. `.nvmrc` pide 22.
- Vitest no emite `design:paramtypes`. Todo constructor de Nest lleva `@Inject` explícito.
- Los scopes se declaran con `@Scopes` pero el guard de desarrollo los concede todos. La aplicación real llega con los PAT del punto 7.
- BullMQ no está cableado. `published_at` del outbox se queda a null. Redis sí está en el compose.
- `apps/api/openapi.json` está en `.prettierignore`. Si cambia un endpoint, `pnpm --filter api build && pnpm --filter api openapi:generate`.

## Qué no está hecho

- UI, incluida la pantalla del constructor de reglas (RF-702). Hábitos funcionales, MCP, cola offline del cliente y NLP. `POST /tasks` no acepta `raw_text`.
- Miniaturas de adjuntos (RF-203). No hay `sharp`.
- Geovallado de recordatorios (RF-806). El tipo `location` se acepta y no se dispara.
- Límite de 1000 peticiones / 15 min. Entra con los PAT del punto 7.
- Drenado del outbox por BullMQ.
- `packages/domain` sigue lanzando `filters are not implemented` y `nlp is not implemented`.
- `pnpm format:check` sigue fallando en ficheros del arnés que ya estaban sin formatear: la spec, el README, los compose, el workflow de CI y `pnpm-lock.yaml`. No se reformatearon.

## Norma de trabajo

Commits pequeños en inglés (Conventional Commits), un tag por hito cerrado, y un tag de punto seguro al dejar la sesión retomable. Español en docs y UI; inglés en código. Módulos de dominio solo se hablan por eventos. Lógica pura en `packages/domain`. El scheduler es el único que materializa ocurrencias y dispara recordatorios.
