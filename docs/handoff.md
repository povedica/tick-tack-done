# Handoff — cierre de la fase 1

Punto seguro para retomar. Lint, typecheck, tests unitarios y la integración de la API pasan en local. La CI los corre después de compilar `packages/domain`. La rama es `feat/fase-1` y no se mergea hasta que se pida. Los puntos 1 a 7 están en `main` (el punto 7 es la PR #8, tag `phase-1.7`). Esta rama cierra el resto del MVP: offline, export JSON, backup, sesión real, OAuth2 PKCE, RF-702, el bus y el corte desplegable.

## Dónde estamos

Cerrada la fase 1 en `feat/fase-1`. Los puntos 8 y 9, la sesión de la sección 10.1, RF-702, el drenado del outbox y el despliegue de la sección 19 entran en esta PR. No se abre V1 ni V2. La spec no se publica como v1.2.

La API pública sigue en `/api/v1`. OpenAPI está en `/api/docs` y el JSON commiteado es `apps/api/openapi.json`. El cliente web llama a la API solo a través de `@reflexionia/sdk`. `apps/api/tsconfig.json` es NodeNext. No revertirlo a CommonJS.

En local la PWA sigue con `AUTH_MODE=dev` y `X-Dev-User-Email`. Producción deja `AUTH_MODE` vacío: el compose lo fuerza. La primera cuenta se crea en `/register` mientras no haya usuarios.

## Tags

| Tag                 | Qué marca                                                      |
| ------------------- | -------------------------------------------------------------- |
| `phase-1.7-api`     | PAT, scopes, actividad, límite por token y OpenAPI             |
| `phase-1.7-mcp`     | Servidor MCP sobre la API v1, sin más privilegios que el token |
| `phase-1.7-sdk`     | Cliente de administración de tokens                            |
| `phase-1.7-web`     | Pantalla de tokens enlazada desde `/today`                     |
| `phase-1.7`         | Punto 7 en `main`. Acceso de agentes                           |
| `phase-1.8-offline` | Cola offline, delta sync y last-write-wins                     |
| `phase-1.9-export`  | Export JSON, borrado de cuenta y backups                       |
| `phase-1.10-auth`   | Sesión Argon2id, CSRF y OAuth2 PKCE                            |
| `phase-1.11-deploy` | Compose de producción, cron y límite del correo entrante       |
| `phase-1`           | Este handoff. Fase 1 cerrada en la rama                        |

## Shell ya en main (PR #5), sin pulir aquí

La PR #5 dejó el shell, el tema y Hoy con tareas reales. Este corte no lo pule. El prompt de esa sesión sigue en `docs/prompts/pulir-ui-hoy.md`.

- La barra es una lista plana de enlaces. No muestra contadores, ni listas con punto de color, ni filtros fijados.
- Hoy tiene título, grupos y filas de checkbox más título. No hay nombre de lista, etiquetas ni fila «Añadir tarea».
- Agrupar por etiqueta muestra el id. El panel de `?task=` sigue en aviso. `/inbox` sigue en aviso.
- Kanban, timeline, calendario, matriz, notas, dashboard, reportes y Focus siguen fuera.

Los tags `phase-1.6*` están en `main`. Los `phase-1.5*` y `phase-1.4*` también. Los `phase-1.3*` y `phase-1.2*` siguen en `feat/core-tasks`. Los `phase-1.1*` siguen en `main`.

## Cómo probar este corte

La PWA de desarrollo sigue identificándose con `AUTH_MODE=dev` y la cabecera `X-Dev-User-Email`. El seed crea `demo@reflexionia.test`. La web manda esa cabecera desde `DEV_USER_EMAIL`. Un PAT no hereda ese pase: solo puede lo que dicen sus scopes. Si la petición trae `Authorization` y `X-Dev-User-Email`, manda el token.

```bash
pnpm --filter api dev
pnpm --filter web dev
```

Abrir `http://127.0.0.1:5173/today` y entrar en «Tokens». Crear un agente con los scopes justos muestra el secreto una sola vez (`rfx_pat_…`). La lista guarda el prefijo, el último uso y permite revocar. Revocar es inmediato: la siguiente petición con ese secreto responde 401. La actividad del token está en `GET /api/v1/me/tokens/{id}/activity`; la de la cuenta, en `GET /api/v1/me/activity`.

Con un PAT de `tasks:read` y `tasks:write`, `POST /api/v1/mcp` lista, crea y completa tareas. Una tool fuera de esos scopes responde `scope_missing` y no cambia datos. Cada petición de token lleva `X-RateLimit-Limit`, `X-RateLimit-Remaining` y `X-RateLimit-Reset`. Al pasar de 1000 en 15 minutos responde 429 con `Retry-After`.

Integración, con Postgres migrado:

```bash
bash scripts/with-env.sh pnpm test:integration
```

`scripts/with-env.sh` pisa `DATABASE_URL`. Para una base scratch hay que llamar a Prisma sin ese wrapper. El rollback de las dos migraciones de tokens está en sus `down.sql` y se verificó en una base scratch.

## Qué quedó dentro del corte

- PAT (RF-2002): se guarda solo el hash SHA-256, el secreto se muestra una vez, el último uso es visible y la revocación es inmediata. Un nombre activo por agente. Toda petición autenticada con token queda en ActivityLog (`accessed`) y las mutaciones de dominio también, con `tokenId`. Consulta en `GET /api/v1/me/tokens/{id}/activity` y `GET /api/v1/me/activity`. Rutas ya previstas: `GET/POST /api/v1/me/tokens` y `DELETE /api/v1/me/tokens/{id}`.
- El guard de desarrollo sigue concediendo los scopes de la ruta cuando no hay `Authorization`. Una petición con PAT recibe 403 `scope_missing` si le falta el scope que declara `@Scopes`.
- Límite por token: 1000 peticiones / 15 min, cabeceras `X-RateLimit-*` y 429 `rate_limited` con `Retry-After`. No se aplica a la sesión de desarrollo ni al correo entrante.
- MCP (RF-2001): `POST /api/v1/mcp`, JSON-RPC, sobre los servicios que ya existen (tareas, listas, etiquetas, filtros, hábitos y búsqueda). `tools/list` oculta lo que el token no puede. `tools/call` fuera de scope devuelve error de tool y no escribe. El criterio 4 se cubre con un PAT de tareas: lista, crea y completa, y no sale de sus scopes.
- Eventos, en el outbox con `published_at` null: `token.created@v1` y `token.revoked@v1`. El catálogo 11.1 nombra esos dos. El actor del outbox es el token (`actorKind` `api`) cuando actúa un PAT.
- Migraciones `20261018084436_add_personal_access_tokens` y `20261018084502_personal_access_token_active_name`, con `down.sql`. Prisma sigue en 6.19.
- Web: `/tokens` dentro del shell, enlazada desde Hoy. Español en la UI. El secreto no se vuelve a pintar al recargar.

Completar una recurrente sigue sin crear la siguiente fila. Solo el scheduler la materializa. BullMQ sigue sin cablear. La cobertura de `packages/domain` sigue por encima del 80 %.

## Decisiones que no hay que reabrir

- Sección 21 de la spec, sin cambios. Las únicas ediciones de la v1.1 en este corte son los nombres `token.created` y `token.revoked` en el catálogo 11.1 y la línea `POST /api/v1/mcp` en las rutas de la sección 10.3.
- `profile:write` ya lo usaban `PATCH /me` y las mutaciones de tokens. Está en el código y en la pantalla. No se añade a la lista de la sección 10.1: esa lista no se reabre.
- El hash del PAT es SHA-256, igual que el del correo entrante. Argon2id sigue reservado a contraseñas. El índice único de nombre es parcial (activos y no borrados); Prisma no lo expresa, va en SQL.
- El servidor MCP llama a los servicios Nest ya existentes con el mismo `AuthUser`. No abre otro acceso a la base. Los módulos de dominio exportan su servicio para que MCP los importe; siguen sin importarse entre sí.
- Vitest no emite `design:paramtypes`. Todo constructor de Nest con dependencias lleva `@Inject`. El limitador no tiene argumentos de constructor: Nest intentaría inyectar el número del límite.
- `apps/api/tsconfig.json` está en NodeNext en `main`. No volver a CommonJS.
- BullMQ drena el outbox y marca `published_at`. No hay dispatcher de webhooks ni motor de automatizaciones: la sección 11 es V1. Redis sigue en el compose.
- `apps/api/openapi.json` está en `.prettierignore`. Si cambia un endpoint, `pnpm --filter api build && pnpm --filter api openapi:generate` y `pnpm --filter @reflexionia/sdk generate`. Generar OpenAPI con `SCHEDULER_AUTOSTART=false`: el `.env` local lo deja en true y `loadRootEnv` no pisa una variable ya definida.
- El paquete de dominio publica CJS. El build de la web aliasa `@reflexionia/domain` al fuente porque Rollup no trata el enlace del workspace como `node_modules`.

## Qué no está hecho

- Kanban, timeline, calendario, notas, dashboard, reporte semanal, revisiones, webhooks, automatizaciones y sync en tiempo real. Son V1.
- Telegram, Google Drive, Google Calendar, import CSV, export iCal/CSV, 2FA y geovallado. Son V1.
- Colaboración, Pomodoro, plugins, widgets nativos, logros y Calendar two-way. Son V2.
- Miniaturas de adjuntos (RF-203). No hay `sharp`.
- El tipo `location` de recordatorio se guarda y no se dispara.
- `BACKUP_REMOTE` no está relleno: sin ese destino el backup no sale de la máquina. No hay acceso al Hetzner en este corte, así que el compose queda listo y no se despliega.
- `pnpm format:check` pasa. La spec v1.1 y `pnpm-lock.yaml` están en `.prettierignore` para que CI no las reescriba. El cliente generado del SDK tampoco se formatea.

## Norma de trabajo

Commits pequeños en inglés (Conventional Commits), un tag por hito cerrado, y un tag de punto seguro al dejar la sesión retomable. Español en docs y UI; inglés en código. Módulos de dominio solo se hablan por eventos. Lógica pura en `packages/domain`. El scheduler es el único que materializa ocurrencias y dispara recordatorios.

## Avisos para más adelante

Anotados el 17 oct 2026 a partir de una revisión externa. No cambian la sección 21 ni el orden del roadmap, y no forman parte del corte en curso. El siguiente trabajo sigue siendo el punto 4 (captura) en `feat/core-tasks`, sin merge a `main`.

- No desplegar en Hetzner con `AUTH_MODE=dev` ni con datos reales hasta que existan los PAT (punto 7). El guard de desarrollo concede todos los scopes que declara la ruta.
- En el servidor, `BACKUP_REMOTE` y el cron de `docs/deployment.md` (`scripts/backup.sh` a las 04:00, `scripts/restore-verify.sh` los domingos a las 05:00). Sin el destino remoto, el backup se queda en la máquina.
- Cuando la spec cambie de verdad, publicar `docs/spec/` como v1.2. No seguir editando v1.1 in situ: se pierde el rastro.
- Abrir PRs revisables. Uno de más de 10.000 líneas es demasiado grande.
- Orden que sugirió el revisor, y que no aplicamos ahora: arreglar CI y mergear, después PAT y MCP, y después la PWA o la captura rápida. El roadmap del repo mantiene la captura en el punto 4 y los PAT/MCP en el punto 7.

### Segunda pasada (17 oct 2026, tarde)

El revisor volvió a mirar commits y docs, sin correr tests. Los puntos 1 a 4 siguen cerrados en `feat/core-tasks` (tag `phase-1.4`). Esto se anota y no se ejecuta: no se arregla la CI, no hay merge a `main`, no se despliega, no se configura `BACKUP_REMOTE`, no se publica la spec como v1.2, no se adelantan PAT ni MCP, no se limita todavía el correo entrante y no se rediseña la UI. El párrafo de arriba conserva el aviso original; el punto 4 ya está cerrado y no se reabre.

- La CI del PR sigue en rojo. El workflow no ha cambiado: falta compilar `packages/domain` antes del lint.
- La auth sigue siendo el guard de desarrollo. No desplegar con datos reales hasta los PAT.
- `BACKUP_REMOTE` sigue sin configurar. Sin destino remoto, el backup se queda en la máquina.
- La spec v1.1 sigue editada in situ, sin v1.2.
- Nuevo: `POST /api/v1/inbound/email` es público. Antes de exponerlo hace falta límite de tamaño y de ritmo.
- `feat/core-tasks` ya ronda las 20.000 líneas. No meter el punto 5 aquí. Cuando se pueda, cerrar esta feat y seguir en ramas más pequeñas. Los hábitos (RF-1301–1305) abren la siguiente. Los PAT conviene hacerlos pronto porque son lo que permite desplegar; siguen en el punto 7 y no se adelantan en esta nota.
- La UI actual es un wireframe: solo Hoy y captura rápida, con estilos de boceto. Aún queda trabajo. Hay que acercarla a una interfaz similar a TickTick (sección 7: tres paneles en escritorio, barra inferior en móvil, vistas de lista, calendario, hábitos). No forma parte de este corte.

### Cierre de `feat/core-tasks` (17 oct 2026, noche)

Decisión de Pablo: cerrar el PR #1 ahora y no seguir apilando puntos. A partir de aquí, cada feature o un punto del roadmap va en su propia PR y se mergea al terminarla.

En este cierre sí se compila `packages/domain` antes del lint y de los tests unitarios. El resto de la segunda pasada sigue sin hacer: no se despliega, no se configura `BACKUP_REMOTE`, no se publica la spec como v1.2, no se adelantan PAT ni MCP, no se limita todavía el correo entrante y no se rediseña la UI. El punto 5 abre otra rama desde `main`.

### Corte de hábitos (17 oct 2026, noche)

El punto 5 está en `feat/habits` (tag `phase-1.5`), con PR contra `main` y sin merge. Los avisos de arriba se conservan y no se ejecutan: no se despliega, no se configura `BACKUP_REMOTE` ni el cron, no se publica la spec como v1.2, no se adelantan PAT ni MCP, no se limita todavía el correo entrante y no se rediseña el resto de la UI. La única edición de la spec v1.1 en este corte es la línea del catálogo 11.1, para nombrar los eventos que el código publica. El punto 6 no se apila en esta rama.

### Corte de filtros (17 oct 2026, noche)

El punto 5 ya está mergeado (PR #4, tag `phase-1.5`). El punto 6 quedó en `feat/filters` (tag `phase-1.6`) y después se mergeó en la PR #7. Los avisos de arriba se conservan y no se ejecutan: no se despliega, no se configura `BACKUP_REMOTE` ni el cron, no se publica la spec como v1.2, no se adelantan PAT ni MCP, no se limita todavía el correo entrante y no se rediseña la UI. La spec v1.1 solo gana los nombres de evento en 11.1 y el `PATCH` público de smart lists en 10.3. El punto 7 no se apila en esa rama.

### Corte de acceso de agentes (18 oct 2026)

El punto 6 ya está mergeado (PR #7, tag `phase-1.6`). La PR #5 (shell) también. El punto 7 se cierra con el merge de la PR #8 (tag `phase-1.7`). Este corte sí hace los PAT, el servidor MCP y el límite de 1000 peticiones / 15 min por token. En este corte no se despliega, no se configura `BACKUP_REMOTE` ni el cron, no se publica la spec como v1.2, no se limita todavía el correo entrante y no se pule el shell. Offline, export y OAuth2 quedan para la PR que cierra la fase 1.

## Cierre de la fase 1 (18 oct 2026)

Quedó hecho, en `feat/fase-1`: cola offline con `Idempotency-Key` (crear, editar y completar, y al reconectar no se duplica), `GET /api/v1/sync`, last-write-wins por campo, tombstones 90 días, export JSON con `schema_version`, `DELETE /api/v1/me`, listado y verificación de backups, scripts de backup y de prueba de restauración, sesión con Argon2id, cookie httpOnly y CSRF, OAuth2 Authorization Code + PKCE con pantalla de consentimiento, la pantalla de recurrencia en español (RF-702), el outbox publicado en BullMQ, el límite de 25 MB y de ritmo del correo entrante, y el compose de producción sin `AUTH_MODE=dev`.

Quedó fuera por ser V1 o V2: Kanban, timeline, Eisenhower, calendario, Telegram, Google Drive, Google Calendar, notas, dashboard, reporte semanal, revisiones asistidas, webhooks, automatizaciones, sync en tiempo real, `/open/v1`, import CSV, export iCal/CSV, 2FA, geovallado, colaboración, Pomodoro, plugins, widgets, logros, WIP limits y Calendar two-way. RF-1701 sigue aplazado. El look TickTick no se tocó.

No se desplegó en Hetzner: falta `BACKUP_REMOTE` y el acceso al servidor. No se inventaron secretos. La spec v1.1 solo ganó los nombres de evento en 11.1 y las rutas públicas que faltaban en 10.3.
