# Handoff — V1 y V2 en `feat/v1-v2`

Punto seguro para retomar. La fase 1 sigue en `main` (PR #11, tag `phase-1`) y no se reabre. V1 y V2 de la sección 19 están en la rama `feat/v1-v2`, PR contra `main`, sin merge. No se ha desplegado en Hetzner.

`apps/api/tsconfig.json` sigue en NodeNext. No revertirlo a CommonJS. La CI compila `packages/domain` antes del lint y de los tests. No quites ese paso.

## Dónde estamos

- Puntos 1 a 9 de la fase 1, más sesión, OAuth2 PKCE, RF-702 y el bus, en la PR #11 (tag `phase-1`).
- Pantallas de la spec de UI en la PR #10. Lo que la API no publica sigue como estado vacío. No se inventaron endpoints para rellenarlas.
- La PR #9 se cerró sin merge y la rama ya no existe. No se resucita.
- Siguiente trabajo real: desplegar cuando existan `BACKUP_REMOTE` y acceso al servidor. No reabrir la fase 1 ni la sección 21. No publicar la spec como v1.2.

En local la PWA sigue con `AUTH_MODE=dev` y `X-Dev-User-Email` (`demo@reflexionia.test`). Producción deja `AUTH_MODE` vacío: el compose lo fuerza. La primera cuenta se crea en `/register` mientras no haya usuarios.

## Cómo probar

```bash
pnpm --filter @reflexionia/domain build
pnpm --filter api dev
pnpm --filter web dev
```

Web en `http://127.0.0.1:5173`. Hoy, bandeja, detalle (`?task=`), `/repeat`, `/login` y `/tokens` hablan con la API. Integración, con Postgres migrado:

```bash
bash scripts/with-env.sh pnpm test:integration
```

`scripts/with-env.sh` pisa `DATABASE_URL`.

## Qué quedó de la fase 1

- Cola offline con `Idempotency-Key` para crear, editar y completar. Cubre la captura, el checkbox de Hoy, el alta de una lista, el detalle y completar desde bandeja o vista. Al reconectar no se duplica.
- `GET /api/v1/sync`, last-write-wins por campo y tombstones 90 días.
- Export JSON con `schema_version`, `DELETE /api/v1/me`, listado de backups y verificación del archivo. `POST /api/v1/backups/restore` comprueba el gzip y no pisa la base. Aplicar el archivo es `RESTORE_CONFIRM=restore ./scripts/restore.sh <stamp>`.
- Sesión Argon2id, cookie httpOnly y CSRF. OAuth2 Authorization Code + PKCE. El token de acceso es un PAT. Un PAT no hereda el pase de desarrollo.
- Pantalla de recurrencia en español (`/repeat`). La RRULE solo se ve en modo avanzado. Solo el scheduler materializa la siguiente ocurrencia.
- El outbox se publica en BullMQ y marca `published_at`. El dispatcher de webhooks y el motor de automatizaciones consumen ese mismo bus.
- Correo entrante: 25 MB y límite de ritmo. El cron de backup (04:00) y de prueba de restauración (domingo 05:00) está en `deploy/reflexionia.cron`.

## Qué quedó de la spec de UI

Hecho contra la API que ya existía: barra con contadores, Hoy con lista y etiquetas, bandeja, detalle, lista/kanban/timeline, hábitos, smart lists, filtros, búsqueda, paleta, atajos y tokens.

Jardín, reportes, revisión, foco, calendario, datos, cuenta, integraciones, automatizaciones, webhooks, plugins y compartir leen la API de esta rama. El foco ya no es un temporizador solo del navegador.

- Datos: `GET /api/v1/export/json`, `GET /api/v1/backups` y `POST /api/v1/backups/restore`. Restaurar verifica el gzip y no pisa la base.
- Cuenta: `/login` y `/register` son la sesión real. Borrar la cuenta es `DELETE /api/v1/me` con el correo como confirmación. El 2FA TOTP es opcional y no se fuerza al usuario de desarrollo. Recuperar contraseña sigue sin existir.

La cola offline no cubre el completado por lote, deshacer, mover, borrar ni el resto de acciones que no son crear, editar o completar una tarea.

## Decisiones que no hay que reabrir

- Sección 21 de la spec, sin cambios. La v1.1 solo ganó nombres de evento en 11.1 y las rutas públicas que faltaban en 10.3.
- `profile:write` se usa en el código y no se añade a la lista de la sección 10.1.
- El hash del PAT es SHA-256. Argon2id es solo para contraseñas.
- Módulos de dominio no se importan entre sí. El scheduler es el único que materializa recurrencias y dispara recordatorios.
- Vitest no emite `design:paramtypes`. Todo constructor de Nest con dependencias lleva `@Inject`.
- `apps/api/openapi.json` está en `.prettierignore`. Si cambia un endpoint: `pnpm --filter api build && pnpm --filter api openapi:generate` y `pnpm --filter @reflexionia/sdk generate`, con `SCHEDULER_AUTOSTART=false` y `BUS_AUTOSTART=false`.
- La web llama a la API solo a través de `@reflexionia/sdk`.

## Qué no está hecho

- Despliegue en `todo.reflexionia.com`. Falta `BACKUP_REMOTE` y el acceso al servidor. No se inventaron secretos.
- RF-1701 (importador TickTick) sigue aplazado.
- Apps nativas y widgets de iOS/Android. La sección 21 no se reabre.
- Recuperar contraseña.
- La PR #9 se cerró sin merge. No se resucita.

## Tags

| Tag                 | Qué marca                                                |
| ------------------- | -------------------------------------------------------- |
| `phase-1.7`         | Punto 7 en `main`. PAT, MCP y límite por token           |
| `phase-1.8-offline` | Cola offline, delta sync y last-write-wins               |
| `phase-1.9-export`  | Export JSON, borrado de cuenta y backups                 |
| `phase-1.10-auth`   | Sesión Argon2id, CSRF y OAuth2 PKCE                      |
| `phase-1.11-deploy` | Compose de producción, cron y límite del correo entrante |
| `phase-1`           | Cierre de la fase 1                                      |

## Norma de trabajo

Commits pequeños en inglés (Conventional Commits), un tag por hito cerrado. Español en docs y UI; inglés en código. Una feature, una PR, desde `main`.

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

Quedó hecho en la PR #11, ya sincronizada con la spec de UI de la PR #10: cola offline con `Idempotency-Key`, `GET /api/v1/sync`, last-write-wins, tombstones 90 días, export JSON, `DELETE /api/v1/me`, backups, sesión Argon2id con CSRF, OAuth2 PKCE, la pantalla de recurrencia en español, el outbox en BullMQ, el límite del correo entrante y el compose de producción sin `AUTH_MODE=dev`.

Quedó fuera por ser V1 o V2 lo que la API no publica: Telegram, Google Drive, Google Calendar, dashboard con datos, reporte, revisiones, webhooks, automatizaciones, sync en tiempo real, `/open/v1`, import CSV, export iCal/CSV, 2FA, geovallado, colaboración, Pomodoro, plugins, widgets, logros y Calendar two-way. Kanban y timeline existen como vista de cliente. RF-1701 sigue aplazado.

No se desplegó en Hetzner: falta `BACKUP_REMOTE` y el acceso al servidor. No se inventaron secretos. La spec v1.1 solo ganó los nombres de evento en 11.1 y las rutas públicas que faltaban en 10.3. La PR #9 se cerró sin merge.

## Cierre de V1 y V2 (18 oct 2026)

Quedó hecho en `feat/v1-v2`: kanban con columnas y WIP, timeline día/semana/mes, matriz con las reglas por defecto y reglas editables, calendario con suscripción iCal y feed propio, notas y sticky notes, dashboard con KPIs de backend, reporte semanal, revisión asistida que propone y no decide, webhooks firmados, automatizaciones sobre el mismo bus, SSE, `/open/v1`, import CSV, export CSV e iCal, 2FA opcional, miniatura de imagen, recordatorio de lugar cuando el navegador da la posición, colaboración, Pomodoro en servidor, plugins fuera del proceso de la API, logros desactivables y la escritura de Google Calendar.

Quedó a falta de un secreto, con el mecanismo y `.env.example` vacíos: `TELEGRAM_BOT_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_FOLDER_ID` y `BACKUP_REMOTE`. Sin esos valores no se llama a Telegram ni a Google, y el backup no sale de la máquina.

Quedó fuera: RF-1701, el despliegue en Hetzner, apps nativas y widgets de iOS/Android, el pulido visual y la PR #9. La spec no se publica como v1.2. La sección 21 no se toca.
