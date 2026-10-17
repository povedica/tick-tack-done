# Handoff — smart lists, filtros y búsqueda (fase 1, punto 6)

Punto seguro para retomar. Lint, typecheck, tests unitarios y la integración de filtros pasan en local. La CI los corre después de compilar `packages/domain`. Este corte es el tag `phase-1.6` en `feat/filters`, con la PR #7 abierta contra `main`. No está mergeado. No se usa `feat/habits`: el punto 5 ya está en `main` (PR #4, tag `phase-1.5`).

## Dónde estamos

Cerrado el punto 6 de la fase 1 (`docs/roadmap.md`): smart lists, filtros, vista lista y búsqueda (RF-901–904, RF-1001, RF-1501–1502). Los puntos 1 a 5 están en `main`.

La API pública sigue en `/api/v1`. OpenAPI está en `/api/docs` y el JSON commiteado es `apps/api/openapi.json`. El cliente web llama a la API solo a través de `@reflexionia/sdk`.

Siguiente producto: punto 7, PAT con scopes y servidor MCP (RF-2001–2002), en una rama nueva desde `main` cuando esta PR se mergee. No adelantar PAT, MCP, cola offline ni export en `feat/filters`. Una feature o un punto del roadmap es una PR, y se mergea al terminarla.

La web sigue siendo un wireframe. Este corte añade listas inteligentes, filtros, la vista lista y la paleta, enlazados desde `/today`. La interfaz de la sección 7, parecida a TickTick, sigue anotada abajo y no se hace aquí. Kanban y timeline (RF-1002–1004) y el módulo de notas no entran.

## Tags

| Tag                | Qué marca                                                             |
| ------------------ | --------------------------------------------------------------------- |
| `phase-1.6-domain` | Evaluación de smart lists, filtros, agrupación y consulta de búsqueda |
| `phase-1.6-api`    | Endpoints públicos, eventos y OpenAPI                                 |
| `phase-1.6-web`    | Pantallas de boceto y paleta enlazadas desde `/today`                 |
| `phase-1.6`        | Este handoff. Punto seguro para seguir                                |

Los tags `phase-1.5*` y `phase-1.4*` están en `main`. Los `phase-1.3*` y `phase-1.2*` siguen en `feat/core-tasks`. Los `phase-1.1*` siguen en `main`.

## Cómo probar este corte

La auth de desarrollo no cambia: `AUTH_MODE=dev` y cabecera `X-Dev-User-Email`. El seed crea `demo@reflexionia.test`. La web manda esa cabecera desde `DEV_USER_EMAIL`.

```bash
pnpm --filter api dev
pnpm --filter web dev
```

Abrir `http://127.0.0.1:5173/today`. «Listas inteligentes» lista las diez del sistema, con contador; se activan y se reordenan con `PATCH /api/v1/smart-lists`. Abrir una muestra la vista lista: agrupar por sección, fecha, etiqueta o prioridad, y ordenar a mano o por fecha, prioridad, título o creación. El detalle se abre en la misma página.

«Filtros» construye un filtro normal o avanzado (AND/OR, un solo nivel de grupos). «Vista previa» llama a `POST /api/v1/filters/preview` y no guarda. Guardar crea la vista con contador. La búsqueda es `GET /api/v1/search`. La paleta se abre con `/` o con Ctrl/Cmd+K: buscar, crear una tarea o ir a una lista.

Integración, con Postgres migrado:

```bash
bash scripts/with-env.sh pnpm --filter api exec vitest run --config vitest.config.integration.ts
```

`scripts/with-env.sh` pisa `DATABASE_URL`. Para una base scratch hay que llamar a Prisma sin ese wrapper.

## Qué quedó dentro del corte

- `packages/domain`: la gramática de la sección 5.7, `matchesFilter` / `matchesClause`, smart lists, agrupación y orden de la vista lista, y el parseo de la búsqueda (`in:lista`, `#tag`, `priority:`, `done:`). La evaluación vive solo ahí. Cobertura del paquete por encima del 80 %.
- API: `GET` y `PATCH /api/v1/smart-lists`, `GET /api/v1/smart-lists/{key}/tasks`. `GET/POST /api/v1/filters`, `POST /api/v1/filters/preview`, `GET/PATCH/DELETE /api/v1/filters/{id}`, `GET /api/v1/filters/{id}/tasks`. `GET /api/v1/search`. El `WHERE` de Prisma se genera desde el árbol de cláusulas y `matchesClause` vuelve a decidir. No hay migración: `SmartList`, `Filter` y `search_vector` ya estaban. Los índices parciales no cambian.
- Eventos, en el outbox con `published_at` null: `filter.created@v1`, `filter.updated@v1`, `filter.deleted@v1`, `smart_list.updated@v1`. El catálogo 11.1 nombra esos cuatro. Aprovisionar las listas del sistema al leer no emite evento. `smart_list.updated` solo si cambia `enabled` o el orden.
- «Asignadas a mí» puede ir vacía: la colaboración es V2. La papelera incluye archivadas. El resto de smart lists de tareas activas no. Un filtro guardado excluye borradas y archivadas.
- Web: `/smart-lists`, `/smart-lists/:key`, `/filters`, `/filters/:id` y `/lists/:id` en el mismo boceto. Español en la UI. La paleta no monta el tercer panel.

Completar una recurrente sigue sin crear la siguiente fila. Solo el scheduler la materializa. BullMQ sigue sin cablear.

## Decisiones que no hay que reabrir

- Sección 21 de la spec, sin cambios. Las únicas ediciones de la v1.1 en este corte son el nombre de los cuatro eventos en el catálogo 11.1 y las rutas públicas de smart lists en la sección 10.3. Un GET no escribe: activar y ordenar es `PATCH /api/v1/smart-lists`.
- La evaluación de filtros no se duplica en el cliente. Si hace falta SQL, sale de la misma gramática.
- Fijar un filtro es llevar su `sort_order` al frente. No hay columna nueva.
- Kanban, timeline y notas quedan fuera. `kind=note` en la búsqueda solo aparece si la tarea ya es una nota.
- Prisma sigue en 6.19. `search_vector` sigue siendo columna generada; no se toca su índice.
- `typescript-eslint` sigue en 8.18.2 y `eslint` en 9.17.0 por Node 23. `.nvmrc` pide 22.
- Vitest no emite `design:paramtypes`. Todo constructor de Nest lleva `@Inject`.
- Los módulos de dominio no se importan entre sí. Filtros y búsqueda leen por Prisma y publican en el bus.
- Los scopes se declaran con `@Scopes` pero el guard de desarrollo los concede todos. La aplicación real llega con los PAT del punto 7.
- BullMQ no está cableado. `published_at` del outbox se queda a null. Redis sí está en el compose.
- `apps/api/openapi.json` está en `.prettierignore`. Si cambia un endpoint, `pnpm --filter api build && pnpm --filter api openapi:generate` y `pnpm --filter @reflexionia/sdk generate`.
- El paquete de dominio publica CJS. El build de la web aliasa `@reflexionia/domain` al fuente porque Rollup no trata el enlace del workspace como `node_modules`.
- El cambio local de `apps/api/tsconfig.json` (`moduleResolution` NodeNext) no se commitea. CI y `nest build` usan el tsconfig CommonJS del repositorio.

## Qué no está hecho

- MCP, PAT, cola offline, export, Telegram, geovallado, miniaturas, drenado del outbox y la pantalla del constructor de reglas (RF-702).
- Kanban, timeline y el módulo de notas.
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

### Corte de filtros (17 oct 2026, noche)

El punto 5 ya está mergeado (PR #4, tag `phase-1.5`). El punto 6 está en `feat/filters` (tag `phase-1.6`), con la PR #7 contra `main` y sin merge. Los avisos de arriba se conservan y no se ejecutan: no se despliega, no se configura `BACKUP_REMOTE` ni el cron, no se publica la spec como v1.2, no se adelantan PAT ni MCP, no se limita todavía el correo entrante y no se rediseña la UI. La spec v1.1 solo gana los nombres de evento en 11.1 y el `PATCH` público de smart lists en 10.3. El punto 7 no se apila en esta rama.
