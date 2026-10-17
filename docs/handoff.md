# Handoff — captura (fase 1, punto 4)

Punto seguro para retomar. Lint, typecheck y tests unitarios pasan en local; la CI los corre después de compilar `packages/domain`. La integración de la API pasó al cerrar el correo de entrada. Este corte es el tag `phase-1.4` y entra en `main` con el PR #1. La rama `feat/core-tasks` no sigue.

## Dónde estamos

Cerrado el punto 4 de la fase 1 (`docs/roadmap.md`): captura rápida (RF-101–107).

La API pública sigue en `/api/v1`. OpenAPI está en `/api/docs` y el JSON commiteado es `apps/api/openapi.json`. El cliente web llama a la API solo a través de `@reflexionia/sdk`.

Siguiente producto: punto 5, hábitos (RF-1301–1305), en una rama nueva desde `main`. No adelantar filtros, búsqueda, MCP, PAT ni la cola offline. Una feature o un punto del roadmap es una PR, y se mergea al terminarla.

La web de ahora es un wireframe (`/today` y `/quick-add`). Aún queda la interfaz de la sección 7, parecida a TickTick. Está anotado abajo y no se hace en este corte.

## Tags

| Tag                | Qué marca                                                                 |
| ------------------ | ------------------------------------------------------------------------- |
| `phase-1.4-domain` | Parser de quick add en español e inglés, con patrones extra por argumento |
| `phase-1.4-api`    | `POST /api/v1/tasks` acepta `raw_text` por el mismo CRUD                  |
| `phase-1.4-email`  | Dirección regenerable y entrega `POST /api/v1/inbound/email`              |
| `phase-1.4-web`    | Atajo `N`, botón flotante, resaltado, voz y share target                  |
| `phase-1.4`        | Este handoff. Punto seguro para seguir                                    |

Los tags `phase-1.3*` y `phase-1.2*` siguen en `feat/core-tasks`. Los `phase-1.1*` siguen en `main`.

## Cómo probar la captura

La auth de desarrollo no cambia: `AUTH_MODE=dev` y cabecera `X-Dev-User-Email`. El seed crea `demo@reflexionia.test`. La web manda esa cabecera desde `DEV_USER_EMAIL`.

```bash
pnpm --filter api dev
pnpm --filter web dev
```

Abrir `http://127.0.0.1:5173/today`. `N` o el botón «Nueva tarea» abren `/quick-add`. Un texto como `comprar leche mañana 18:00 !alta #casa` resalta los tokens y muestra el título que se va a guardar. Quitar un chip borra ese tramo. Enter crea la tarea. Si el título parseado queda vacío, el botón no envía nada.

Compartir a la PWA hace `POST /quick-add`. El service worker responde 303 a `GET /quick-add?title&text&url`. En el navegador, esa URL ya rellena el borrador.

El dictado usa Web Speech API y vuelca el texto al mismo parser. Si el navegador no lo tiene, el botón queda desactivado y se explica.

Correo de entrada: `POST /api/v1/me/inbound-email` muestra el token una sola vez. `GET` solo dice si hay dirección. `DELETE` la revoca al momento. `POST /api/v1/inbound/email` es multipart (`recipient`, `subject`, `text`, `message_id`, `file`) y no pide la cabecera de desarrollo: autentica el token del destinatario.

Integración, con Postgres migrado:

```bash
bash scripts/with-env.sh pnpm --filter api exec vitest run --config vitest.config.integration.ts
```

`scripts/with-env.sh` pisa `DATABASE_URL`. Para una base scratch hay que llamar a Prisma sin ese wrapper.

## Qué quedó dentro del corte

- `packages/domain`: `parseQuickAdd` por reglas, español e inglés. Fechas con `date-fns-tz` (`wallClock`, `instantFromWall`, `addCalendarDays`). Prioridad pública `none | low | medium | high`. `p1` es baja, `p2` media, `p3` alta. Los spans conservan los offsets del texto original. `RF-103`: el tercer argumento acepta `patterns`. El host de plugins no existe. Cobertura del paquete: sentencias 90,69 %, ramas 83,50 % (el umbral es 80 %). `filters` sigue sin implementar.
- `POST /api/v1/tasks` acepta `raw_text` y crea la tarea por el CRUD actual (idempotencia, outbox con `published_at` null, `task.created`). Los campos explícitos pisan lo parseado. Título vacío: `400 empty_title` y no se escribe nada. Si `^lista` o `~lista` no existe, la tarea va a la bandeja con `warnings: [{code: list_not_found}]` y no se crea la lista. Una etiqueta desconocida avisa `tag_not_found` y no se crea. No hay endpoint de preview: el cliente usa el mismo parser para resaltar. La sección 10.3 de la spec lo documenta.
- Email-to-task (RF-105). Columna `users.inbound_email_token_hash`, única y nullable. El token es 32 bytes en base64url; en base solo está el SHA-256. Dirección `<token>@in.todo.reflexionia.com`. El asunto pasa por el mismo parser, el cuerpo es el contenido y los adjuntos son Attachment con tope de 25 MB y como mucho 10. No se ejecuta nada. Un `message_id` repetido no duplica la tarea. `source` queda `api` y `metadata.capture` es `email`. Migración `20261017170000_add_inbound_email_token`: `prisma migrate diff` contra el schema quedó vacío y el `down.sql` se probó en una base scratch.
- Web: `/today` y `/quick-add`. Atajo `N` (no el atajo global de escritorio, que es V2), botón flotante, resaltado editable, chips para quitar un span, voz y share target. No hay listas, calendario, hábitos ni constructor de reglas.

Completar una recurrente sigue sin crear la siguiente fila. Solo el scheduler la materializa.

## Decisiones que no hay que reabrir

- Sección 21 de la spec, sin cambios.
- No hay evento nuevo de rotación de la dirección de correo. El catálogo 11.1 no se amplió.
- El mapa TickTick 0/1/3/5 no se reabre. `p1` es baja.
- Los patrones extra no entran por HTTP (riesgo de ReDoS).
- Prisma sigue en 6.19. La migración nueva no toca los índices parciales ni `search_vector`.
- `typescript-eslint` sigue en 8.18.2 y `eslint` en 9.17.0 por Node 23. `.nvmrc` pide 22.
- Vitest no emite `design:paramtypes`. Todo constructor de Nest lleva `@Inject` explícito.
- Los scopes se declaran con `@Scopes` pero el guard de desarrollo los concede todos. La aplicación real llega con los PAT del punto 7.
- BullMQ no está cableado. `published_at` del outbox se queda a null. Redis sí está en el compose.
- `apps/api/openapi.json` está en `.prettierignore`. Si cambia un endpoint, `pnpm --filter api build && pnpm --filter api openapi:generate` y `pnpm --filter @reflexionia/sdk generate`.
- El paquete de dominio publica CJS. El build de la web aliasa `@reflexionia/domain` al fuente porque Rollup no trata el enlace del workspace como `node_modules`.

## Qué no está hecho

- Hábitos, filtros y smart lists, búsqueda, MCP, PAT, cola offline, Telegram, geovallado, miniaturas, drenado del outbox y la pantalla del constructor de reglas (RF-702).
- Miniaturas de adjuntos (RF-203). No hay `sharp`.
- El tipo `location` de recordatorio se guarda y no se dispara.
- Límite de 1000 peticiones / 15 min. Entra con los PAT del punto 7.
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

Decisión de Pablo: cerrar el PR #1 ahora y no seguir apilando puntos. A partir de aquí, cada feature o punto del roadmap va en su propia PR y se mergea al terminarla.

En este cierre sí se compila `packages/domain` antes del lint y de los tests unitarios. El resto de la segunda pasada sigue sin hacer: no se despliega, no se configura `BACKUP_REMOTE`, no se publica la spec como v1.2, no se adelantan PAT ni MCP, no se limita todavía el correo entrante y no se rediseña la UI. El punto 5 abre otra rama desde `main`.
