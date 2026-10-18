# Handoff — spec cerrada y desplegada (PR #14)

Punto seguro para retomar. La fase 1 está en `main` (PR #11, tag `phase-1`) y no se reabre. El look medido de TickTick está en `main` (PR #13). V1 y V2 de la sección 19 están en `main` (PR #12). Lo que la spec dejaba pendiente entra con la PR #14: Telegram de producción, Calendar en lectura y escritura, Drive, el backup a esa carpeta y el despliegue en `https://todo.reflexionia.com`. No se ha publicado la spec como v1.2. La rama `feat/terminar-spec` no se sigue: al mergear, se borra en local.

`apps/api/tsconfig.json` sigue en NodeNext. No revertirlo a CommonJS. La CI compila `packages/domain` antes del lint y de los tests. No quites ese paso.

## Dónde estamos

- Puntos 1 a 9 de la fase 1, más sesión, OAuth2 PKCE, RF-702 y el bus, en la PR #11 (tag `phase-1`).
- Pantallas de la spec de UI en la PR #10. Lo que la API no publica sigue como estado vacío. No se inventaron endpoints para rellenarlas.
- Look de TickTick en la PR #13, ya en `main`. La spec de UI pasa a v1.1 en el mismo archivo (`docs/spec/tick-tack-done-ui-spec-v1.0.md`): UI-D2 es la paleta medida, UI-D3 es sans del sistema en toda la UI y UI-D5 es el oscuro `#242424`. No vuelvas a la crema ni a la serif de los títulos.
- La PR #9 se cerró sin merge y la rama ya no existe. No se resucita.
- La PR #14 cierra Telegram, Calendar, Drive, el backup a Drive y el despliegue. No reabrir la fase 1, la PR #12 ni la sección 21. No publicar la spec de producto como v1.2. RF-1701 sigue aplazado. Apps nativas y widgets siguen fuera.

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

El look de la PR #13 no cambia rutas, stores, agrupación, deshacer ni densidad. Cambia tokens, tipografía y marcado visual: rail de 50px, sidebar de 240px, filas de 40px, quick-add bajo la cabecera, checkbox de prioridad y menú de vista. El `rem` sigue valiendo 16px porque el tamaño de 14px vive en `body`, no en `:root`. `--ink-3` está en 0.65 para contraste AA sobre `#f2f5fe`.

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

- RF-1701 (importador TickTick) sigue aplazado.
- Apps nativas y widgets de iOS/Android. La sección 21 no se reabre.
- Recuperar contraseña. `ForgotPage` sigue siendo un texto fijo.
- La voz de Telegram necesita `TELEGRAM_VOICE_PROVIDER` (una URL que devuelva `{ "text": "..." }`). En local y en producción está vacía: el bot lo dice y no inventa una transcripción.
- El usuario de producción no tiene refresh token de Google. Calendar, Drive y la subida del backup salen cuando repita el consentimiento en `https://todo.reflexionia.com` (`GET /api/v1/integrations/google/start`). El token de la base local no se copia.
- `SMTP_HOST` en producción es `localhost`. El recordatorio por correo no sale de la máquina. No se inventó un SMTP.
- `BACKUP_REMOTE` sigue vacío. El destino externo es la carpeta de Drive, y solo cuando haya token.
- `APP_WEB_URL` en local sigue siendo el origen de la PWA en el portátil. En el servidor es `https://todo.reflexionia.com`.
- La PR #9 se cerró sin merge. No se resucita.
- Bugs vistos al probar listas, etiquetas, el calendario y una transacción de Prisma de 5 s: `docs/spec/bugs-prueba-canales-2026-10-18.md`. No entran en esta PR.
- El pulido de interfaz de `docs/spec/prompt-cursor-tick-tack-done-fixes-85f337e2.md` sigue pendiente y no está en git.

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

No se desplegó en Hetzner: falta `BACKUP_REMOTE` y el acceso al servidor. No se inventaron secretos. La spec de producto v1.1 solo ganó los nombres de evento en 11.1 y las rutas públicas que faltaban en 10.3. La PR #9 se cerró sin merge.

## Look TickTick (18 oct 2026)

Quedó hecho en la PR #13, mergeada a `main`. La UI deja la crema y la serif. Los valores medidos están en `docs/spec/cursor-prompt-ui-look-ticktick-v1.2.md` y en `apps/web/src/styles/tokens.css`. La spec de UI, en el mismo archivo de siempre, sube a v1.1.

No se tocó la API, Prisma, el dominio ni el bus. No se desplegó. No se publicó la spec de producto como v1.2. El acento por defecto es `#4772fa`.

## Cierre de V1 y V2 (18 oct 2026)

Quedó hecho en la PR #12: kanban con columnas y WIP, timeline día/semana/mes, matriz con las reglas por defecto y reglas editables, calendario con suscripción iCal y feed propio, notas y sticky notes, dashboard con KPIs de backend, reporte semanal, revisión asistida que propone y no decide, webhooks firmados, automatizaciones sobre el mismo bus, SSE, `/open/v1`, import CSV, export CSV e iCal, 2FA opcional, miniatura de imagen, recordatorio de lugar cuando el navegador da la posición, colaboración, Pomodoro en servidor, plugins fuera del proceso de la API, logros desactivables y la escritura de Google Calendar. El look de la PR #13 se conserva. Tags `phase-v1` (`b9419a4`) y `phase-v2` (`586043e`); el cierre de integraciones va encima, en `f8c6c84`.

Google ya no pide pegar `GOOGLE_REFRESH_TOKEN`. `GET /api/v1/integrations/google/start` abre el consentimiento y el callback guarda `google_refresh_token` y el correo en el usuario. El calendario usa ese token; la variable de entorno solo es respaldo. En local la cuenta `yoyyosemite@gmail.com` quedó conectada. El cliente OAuth y el secreto viven en `.env`, no en git.

Telegram, en local: `bash scripts/with-env.sh node scripts/telegram-poll.mjs` lee `@reflexionia_todo_bot` y llama a la API pública con `X-Dev-User-Email`. Comandos: `/capturar` y `/add` (mismo quick add), `/hoy`, `/manana`, `/semana`, `/lista`, `/lista #etiqueta`, `/lista !alta`. La respuesta es texto con ☐ y un enlace `APP_WEB_URL`; no es clicable. `/complete` se quitó. El webhook `POST /api/v1/integrations/telegram/webhook` sigue parseando y respondiendo `called_telegram: false`: no crea tareas ni contesta al chat. Sin el sondeo, el teléfono no llega a `127.0.0.1`.

`GOOGLE_DRIVE_FOLDER_ID` está en el `.env` local (carpeta «tick-tack-done backups»). `scripts/backup.sh` no sube a esa carpeta: sigue siendo rclone y `BACKUP_REMOTE` está vacío.

Quedó fuera de esta PR, y es el trabajo de la siguiente: voz, foto y recordatorios de Telegram, completar desde el chat, el webhook de producción, lectura y escritura reales de Calendar con el token guardado, adjuntos de Drive, el backup diario en Drive, el despliegue y `APP_WEB_URL` público. RF-1701, apps nativas, widgets y la PR #9 siguen fuera. La spec no se publica como v1.2. La sección 21 no se toca. No se inventan secretos.

## Cierre de lo pendiente y del despliegue (18 oct 2026)

Quedó hecho en la PR #14, sin reabrir la fase 1, la PR #12 ni la sección 21:

- Telegram (RF-2003). `POST /api/v1/integrations/telegram/webhook` crea la tarea con el quick add y contesta en el chat. Siguen `/capturar`, `/add`, `/hoy`, `/manana`, `/semana`, `/lista`, `/lista #etiqueta` y `/lista !alta`. Se completan con `/hecho` y el título, o con el botón, sin pedir un UUID. La voz pasa por `TELEGRAM_VOICE_PROVIDER` y luego por el mismo NLP. La foto se guarda como adjunto. El scheduler manda el recordatorio al chat vinculado. El sondeo `scripts/telegram-poll.mjs` es solo local: borra el webhook. En el servidor el webhook ya está puesto en `https://todo.reflexionia.com/api/v1/integrations/telegram/webhook` y el bot es `@reflexionia_todo_bot`.
- Google Calendar (RF-2004). La lectura y la escritura usan el refresh token guardado en el usuario. La variable de entorno solo es respaldo. La segunda escritura actualiza el evento, no lo duplica.
- Google Drive (RF-2005). Un adjunto puede ser un enlace o una copia del archivo. `scripts/backup.sh` vuelca el directorio del día a `GOOGLE_DRIVE_FOLDER_ID` con ese mismo token. En local se comprobó la subida y se borró el archivo de prueba. `BACKUP_REMOTE` sigue vacío.
- Despliegue. El mismo Hetzner que ia.turugby (`46.224.6.154`), pila distinta: proyecto Compose `todo`, checkout `/opt/todo/app`, secretos en `/etc/todo/production.env`. No publica 80 ni 443. El Caddy de turugby importa `/etc/caddy/sites/todo.caddy`. `AUTH_MODE` va vacío. La web de producción se construye con `VITE_AUTH_MODE=session` y no entra a Hoy sin cookie. La primera cuenta ya existe; el registro está cerrado. Salud: `GET /api/v1/health`.
- Cron del usuario `deploy`: `deploy/reflexionia.cron`. Backup a las 04:00 en `/opt/todo/backups`, prueba de restauración los domingos a las 05:00. El host no tiene Node; la subida a Drive usa `node:22-alpine` y no imprime el token.
- El servidor ya importa `/etc/caddy/sites`. En git de ia.turugby el mismo cambio es la PR #59 (`hotfix/todo-caddy-site` contra `production`): https://github.com/povedica/ia.turugby/pull/59. No se mergea en este corte: ese merge republica ia.turugby y sustituiría el Caddy que ahora mismo tiene el sitio de la consola. Hay que mergearla antes de la próxima release de ia.turugby, o esa release quita `todo.reflexionia.com`.

Los avisos de «no desplegar» de más arriba son el diario del 17 y 18 de octubre. El despliegue ya está hecho, sin `AUTH_MODE=dev` y sin seed.

Sigue fuera: RF-1701, apps nativas, widgets, recuperar contraseña, la voz, el consentimiento de Google en producción, un SMTP real y la PR #9. La spec no se publica como v1.2. La sección 21 no se toca. El siguiente corte de producto es `docs/spec/bugs-prueba-canales-2026-10-18.md`, en otra rama desde `main`.

### Cómo volver a desplegar

```bash
ssh -i ~/.ssh/turugby_hetzner_deploy -o IdentitiesOnly=yes deploy@46.224.6.154
cd /opt/todo/app && git pull && sh deploy/production/deploy.sh
```

No uses el `docker-compose.yml` de la raíz en ese host. No imprimas `/etc/todo/production.env`.
