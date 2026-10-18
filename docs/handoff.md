# Handoff — spec de UI (feat/ui-spec)

La web cubre el mapa de `docs/spec/tick-tack-done-ui-spec-v1.0.md` en una sola rama. Lo que la API ya publica se lee y se escribe por `@reflexionia/sdk`. Lo que la spec pide y la API no publica existe como pantalla con el estado vacío de la spec. No hay endpoints inventados.

`apps/api/tsconfig.json` sigue en NodeNext. No revertirlo.

## Cómo probar este worktree

`~/CodeProjects/todo-ui-spec`, offset 300. Sin `pnpm dev`.

```bash
pnpm --filter @reflexionia/domain build
pnpm dev:api
pnpm --filter web exec vite --port 5473 --strictPort --host 127.0.0.1
```

Web en `http://127.0.0.1:5473`. API en `http://127.0.0.1:3300` (`VITE_API_PROXY`). Auth de desarrollo: `AUTH_MODE=dev` y `demo@reflexionia.test`.

## Bloqueado por falta de API

Estas pantallas están hechas y se quedan en el vacío que describe la spec hasta que exista el endpoint:

- Plan de hoy (UI-403): espera `GET /api/v1/review/daily`.
- Revisión semanal: espera `GET /api/v1/review/weekly`. Los cuatro pasos se ven vacíos.
- Jardín digital (`/dashboard` y `/sticky`): espera `GET /api/v1/me/dashboard`. Los widgets no se rellenan con listas de tareas.
- Reportes semanales: la API no publica el histórico.
- Tokens y MCP: no hay PAT, hash, último uso, actividad por token ni URL del servidor MCP.
- Calendario: no hay eventos de calendarios externos ni feeds iCal que copiar o regenerar.
- Ajustes de calendario, integraciones, automatizaciones, webhooks, datos (export y backup), plugins (V2) y compartir (V2): la API no publica esos recursos.
- Cuenta: `GET/PATCH /api/v1/me` guarda nombre y zona horaria. Contraseña, sesiones, 2FA y borrar la cuenta no tienen endpoint. `/login`, `/register` y `/forgot-password` lo dicen.
- Notificaciones: solo se guarda `daily_reminder_time`. No hay horas silenciosas ni centro de notificaciones.
- Foco (V2): el temporizador de 25:00 vive solo en el navegador. No hay sesiones de foco en la API.
- Actividad de una tarea: el log existe, pero el actor es un id. No hay nombre de token.
- Ordenar la bandeja por creación: `GET /tasks` solo acepta `sort=manual|priority|due` y `limit` hasta 100. La UI pide `sort=manual` y ordena `created_at` en el cliente.
- Fijar una tarea, límite WIP de columna y la regla de la matriz no están en el modelo. El WIP es un campo local. La matriz clasifica en cliente (vence en 24 h o ya venció; prioridad alta o media) y al soltar hace `PATCH` de prioridad y fecha.

## Hecho con la API que ya existe

- Barra con contadores, listas con color, etiquetas hacia `/search?q=#nombre`, papelera con confirmación. En menos de 1024 px la barra es un cajón (`inert` si está cerrado). En menos de 640 px, barra inferior.
- Hoy conserva vencidas, agrupación y deshacer. Muestra lista, etiquetas y la tira de hábitos.
- Bandeja en modo procesar, detalle (`?task=`), checklist, subtareas, recordatorios, RRULE, adjuntos y actividad.
- Lista, kanban y timeline. Una tarea sin columna cae en «Sin sección».
- Smart lists, filtros, búsqueda y paleta. `/habits` y `/habits/:id` (racha y mapa del año).
- Captura en `/quick-add`. El correo entrante se rota y se revoca en Ajustes.
- Notas: `/list/:id/note/:taskId` abre el detalle de esa tarea. Convertir nota/tarea usa el `kind` que ya guarda la API.
- Atajos: `?` abre la ayuda. `G` y luego t/i/c/m/s/a/b/n/r/w navega. `.` invalida las queries.

## Aún corto respecto a la spec, sin endpoint nuevo

- UI-1902: el banner de offline avisa. Completar sin red no encola con `Idempotency-Key`.
- UI-606: las listas no virtualizan 5000 filas. UI-405 (presupuesto de 2 s) no está medido.
- El aviso de primera captura sobre `.` y `?` no está cableado.
- Kanban y timeline no reordenan dentro de la columna. El calendario de mes no crea ni arrastra ocurrencias.
- La actividad no muestra el nombre del agente.

## Historial anterior

Lo que sigue es el handoff de shell y Hoy (PR #5) y de los puntos 1 a 6. Ya está en `main` y esta rama lo conserva.

## Historial del punto 6

Lo que sigue describe el corte de filtros ya mergeado (PR #7, tag `phase-1.6`). No es el trabajo abierto.

## Tags

| Tag                | Qué marca                                                             |
| ------------------ | --------------------------------------------------------------------- |
| `phase-1.6-domain` | Evaluación de smart lists, filtros, agrupación y consulta de búsqueda |
| `phase-1.6-api`    | Endpoints públicos, eventos y OpenAPI                                 |
| `phase-1.6-web`    | Pantallas de boceto y paleta enlazadas desde `/today`                 |
| `phase-1.6`        | Handoff del punto 6, ya en `main`                                     |

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
- `apps/api/tsconfig.json` quedó en NodeNext en `main` (`chore(api): align the API tsconfig with NodeNext`). No revertirlo a CommonJS.

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
