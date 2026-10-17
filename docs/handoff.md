# Handoff — hábitos (fase 1, punto 5)

Punto seguro para retomar. Lint, typecheck y tests unitarios pasan en local; la integración de la API también. La CI los corre después de compilar `packages/domain`. Este corte es el tag `phase-1.5` en `feat/habits`, con PR abierta contra `main`. No está mergeado. La rama `feat/core-tasks` no se usa.

## Dónde estamos

Cerrado el punto 5 de la fase 1 (`docs/roadmap.md`): hábitos (RF-1301–1305). Los puntos 1 a 4 siguen en `main` (PR #1, tag `phase-1.4`).

La API pública sigue en `/api/v1`. OpenAPI está en `/api/docs` y el JSON commiteado es `apps/api/openapi.json`. El cliente web llama a la API solo a través de `@reflexionia/sdk`.

Siguiente producto: punto 6, smart lists, filtros y búsqueda (RF-901–904, RF-1001, RF-1501–1502), en una rama nueva desde `main` cuando este PR se mergee. No adelantar PAT, MCP, cola offline ni export. Una feature o un punto del roadmap es una PR, y se mergea al terminarla.

La web sigue siendo un wireframe. Este corte añade `/habits` y un enlace desde `/today`. La interfaz de la sección 7, parecida a TickTick, sigue anotada abajo y no se hace aquí.

## Tags

| Tag                | Qué marca                                                                 |
| ------------------ | ------------------------------------------------------------------------- |
| `phase-1.5-domain` | Objetivos, check-in, rachas, cumplimiento y mapa de calor                 |
| `phase-1.5-api`    | CRUD, check-in, estadísticas, eventos y recordatorio diario del scheduler |
| `phase-1.5-web`    | Pantalla `/habits` enlazada desde `/today`                                |
| `phase-1.5`        | Este handoff. Punto seguro para seguir                                    |

Los tags `phase-1.4*` están en `main`. Los `phase-1.3*` y `phase-1.2*` siguen en `feat/core-tasks`. Los `phase-1.1*` siguen en `main`.

## Cómo probar los hábitos

La auth de desarrollo no cambia: `AUTH_MODE=dev` y cabecera `X-Dev-User-Email`. El seed crea `demo@reflexionia.test` y el hábito «Beber agua». La web manda esa cabecera desde `DEV_USER_EMAIL`.

```bash
pnpm --filter api dev
pnpm --filter web dev
```

Abrir `http://127.0.0.1:5173/today` y seguir «Hábitos». Una sugerencia rellena el formulario; crearlo llama a `POST /api/v1/habits`. «Registrar» hace check-in del día con el contador. La nota se guarda al salir del campo. La racha, los porcentajes y el mapa de calor salen de `GET /api/v1/habits/{id}/stats`.

Integración, con Postgres migrado:

```bash
bash scripts/with-env.sh pnpm --filter api exec vitest run --config vitest.config.integration.ts
```

`scripts/with-env.sh` pisa `DATABASE_URL`. Para una base scratch hay que llamar a Prisma sin ese wrapper.

## Qué quedó dentro del corte

- `packages/domain`: objetivo diario o semanal, días activos, hora `HH:mm`, check-in con tope, racha actual y mejor, porcentaje de la semana y del mes sobre días activos ya transcurridos, mapa de calor anual y agregado. Un día a medias no rompe la racha hasta que ese día ha pasado. Cobertura del paquete por encima del 80 %.
- API: `GET/POST /api/v1/habits`, `GET/PATCH/DELETE /api/v1/habits/{id}`, `POST /api/v1/habits/{id}/checkins` (`date`, `count`, `note`), `GET /api/v1/habits/{id}/stats?year=`. Idempotencia en el alta y en el check-in. El hábito no crea una tarea (RF-1304). Papelera con `deleted_at`. Scopes `habits:read` y `habits:write`; el guard de desarrollo los concede todos.
- Eventos, en el outbox con `published_at` null: `habit.created@v1`, `habit.updated@v1`, `habit.deleted@v1`, `habit.checkin@v1`, `habit.goal_met@v1`, `habit.streak_broken@v1`. El catálogo 11.1 nombra esos seis. `habit.goal_met` solo al cruzar el objetivo. `habit.streak_broken` al bajar un día que sostenía la racha, y también una vez por hábito cuando el scheduler ve el primer día activo ya cerrado que la rompe.
- Recordatorio diario opcional (`reminder_time`). Lo encola el scheduler, igual que el resto de avisos. La fila de entrega reutiliza el tipo `daily_digest` porque el enum no tiene un valor `habit`; el evento `reminder.fired` lleva `kind: habit` y `habit_id`. No hay migración.
- Web: `/habits` en el mismo boceto que Hoy. Sugerencias, alta, check-in con contador y nota, archivo, racha y mapas. Español en la UI.

Completar una recurrente sigue sin crear la siguiente fila. Solo el scheduler la materializa. BullMQ sigue sin cablear.

## Decisiones que no hay que reabrir

- Sección 21 de la spec, sin cambios.
- El mapa de calor agregado viaja en `GET /habits/{id}/stats`, que es la ruta de estadísticas de la spec. No hay una ruta nueva.
- Un objetivo diario exige el mismo número en `times_per_period` y `target_count` (el seed de «Beber agua» ya es así). Uno semanal pide `times_per_period` días con `target_count` cada uno, y no puede pedir más días de los que están activos.
- Prisma sigue en 6.19. Este corte no toca índices parciales ni `search_vector`.
- `typescript-eslint` sigue en 8.18.2 y `eslint` en 9.17.0 por Node 23. `.nvmrc` pide 22.
- Vitest no emite `design:paramtypes`. Todo constructor de Nest lleva `@Inject`.
- Los módulos de dominio no se importan entre sí. El scheduler lee hábitos por Prisma y publica en el bus.
- Los scopes se declaran con `@Scopes` pero el guard de desarrollo los concede todos. La aplicación real llega con los PAT del punto 7.
- BullMQ no está cableado. `published_at` del outbox se queda a null. Redis sí está en el compose.
- `apps/api/openapi.json` está en `.prettierignore`. Si cambia un endpoint, `pnpm --filter api build && pnpm --filter api openapi:generate` y `pnpm --filter @reflexionia/sdk generate`.
- El paquete de dominio publica CJS. El build de la web aliasa `@reflexionia/domain` al fuente porque Rollup no trata el enlace del workspace como `node_modules`.

## Qué no está hecho

- Filtros y smart lists, búsqueda, MCP, PAT, cola offline, Telegram, geovallado, miniaturas, drenado del outbox y la pantalla del constructor de reglas (RF-702).
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

Decisión de Pablo: cerrar el PR #1 ahora y no seguir apilando puntos. A partir de aquí, cada feature o un punto del roadmap va en su propia PR y se mergea al terminarla.

En este cierre sí se compila `packages/domain` antes del lint y de los tests unitarios. El resto de la segunda pasada sigue sin hacer: no se despliega, no se configura `BACKUP_REMOTE`, no se publica la spec como v1.2, no se adelantan PAT ni MCP, no se limita todavía el correo entrante y no se rediseña la UI. El punto 5 abre otra rama desde `main`.

### Corte de hábitos (17 oct 2026, noche)

El punto 5 está en `feat/habits` (tag `phase-1.5`), con PR contra `main` y sin merge. Los avisos de arriba se conservan y no se ejecutan: no se despliega, no se configura `BACKUP_REMOTE` ni el cron, no se publica la spec como v1.2, no se adelantan PAT ni MCP, no se limita todavía el correo entrante y no se rediseña el resto de la UI. La única edición de la spec v1.1 en este corte es la línea del catálogo 11.1, para nombrar los eventos que el código publica. El punto 6 no se apila en esta rama.
