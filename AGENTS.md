# AGENTS.md — guía para agentes de codificación (Cursor y otros)

Este repositorio es un gestor de tareas personal extensible desplegado en
`todo.reflexionia.com`. La referencia histórica del producto es un solo fichero
de la revisión `340f34be17477ecab681ddc3dbfd790c9346a0ba`. El resto de ese commit
no es fuente. Léelo antes de tocar código y cita los RF-xx que implementes:

```bash
git show 340f34be17477ecab681ddc3dbfd790c9346a0ba:docs/spec/done/especificacion-producto-v1.1.md
```

Un clon superficial no tiene ese objeto: hace falta `git fetch --unshallow`.
Este archivo resume las normas; el detalle vive en `.cursor/rules/*.mdc`, que
Cursor aplica automáticamente.

## Contexto mínimo antes de tocar código

1. Lee la sección de la espec que cubre tu tarea y cita los RF-xx que implementas.
2. Respeta la arquitectura de la sección 4: módulos de dominio que no se llaman entre sí
   (solo eventos), scheduler como único que materializa recurrencias y recordatorios.
3. La lógica de negocio pura vive en `packages/domain` sin dependencias de framework.

## Mapa del monorepo (pnpm workspaces)

- `apps/api` — NestJS + Prisma + PostgreSQL + BullMQ/Redis. Incluye el servidor MCP.
- `apps/web` — React + TypeScript, PWA (Vite). Cliente oficial de la API.
- `packages/domain` — reglas de negocio puras: recurrencias RRULE, filtros (5.7), NLP del quick add.
- `packages/sdk` — cliente TS de la API generado del OpenAPI.
- `docker-compose.yml` + `Caddyfile` — despliegue en un VPS con Docker. `docker-compose.dev.yml` — infra local.
- `scripts/` — seed, backups (RF-1704), utilidades de desarrollo.

## Reglas de oro

- **API-first**: ninguna funcionalidad de UI sin su endpoint público documentado (OpenAPI generado
  del código; CI falla si hay endpoints sin documentar).
- **Todo emite eventos**: cualquier cambio de estado relevante publica un evento de dominio
  versionado (`task.created@v1`, …) en el bus.
- **Multiusuario desde el modelo** aunque hoy haya un usuario: toda entidad cuelga de un owner.
- **Español en docs y UI, inglés en código** (identificadores, commits, nombres de API).
- **Conventional Commits** (`feat:`, `fix:`, `test:`…). Sin commits directos a `main`.
- **Una issue, una PR, en paralelo:** cada issue la termina un agente en su worktree
  y en una sola PR. Se prefiere una PR un poco más grande a una cadena de issues
  que se bloqueen entre sí. Lo que no se puede paralelizar se junta en una PR.
  No se apila el siguiente trabajo en una PR ya abierta: esa PR se mergea y la
  siguiente nace de `main`.
- Cobertura >80% en `packages/domain` (recurrencias, filtros, NLP: es donde viven los bugs).
- Migraciones Prisma siempre reversibles y generadas con `pnpm db:migrate`, nunca a mano sin revisar.

## Comandos del día a día

```bash
pnpm dev                # Postgres, Redis, Mailpit y la app en node:26-alpine
pnpm test               # unitarios en esa imagen (en CI, en el runner Node 26)
pnpm test:integration   # API contra Postgres/Redis reales
pnpm test:e2e           # Playwright en el host (necesita navegador)
pnpm db:migrate         # crear/aplicar migración Prisma en desarrollo
pnpm db:seed            # datos de desarrollo
pnpm lint && pnpm typecheck
```

## Backlog (GitHub Projects)

- El estado vivo está en el Project «ttd · backlog». Reglas:
  `docs/backlog/PROTOCOLO-BACKLOG.md`. Comandos: skill
  `.cursor/skills/backlog-github-projects/SKILL.md` (Codex debe leerla al
  inicio y al cierre de cualquier tarea de backlog).
- Columnas: Ideas → Listo para hacer → En curso → Pausada → En revisión → Hecho.
- Tu nombre de agente es `<ejecutor>-<rol>-N` (p. ej. `codex-frontend-1`,
  `cursor-api-2`). Es el valor del campo Agente.
- No hay tope de trabajo en curso. El límite es la Zona.
- Antes de escribir código, en este orden y sin saltarse pasos:
  1. Si hay algo en **Pausada**, pregunta a Pablo si se retoma. No cojas
     nada nuevo sin esa respuesta.
  2. Elige en la vista «Siguiente» algo en «Listo para hacer» (cumple
     `docs/backlog/DOR.md`) cuya Zona no esté ocupada por otra tarjeta en
     En curso, Pausada o En revisión. En `prisma-migrations`, una sola
     migración en vuelo.
  3. Mueve la tarjeta a «En curso».
  4. Rellena Agente (`<ejecutor>-<rol>-N`) y Rama (el nombre de la rama).
  5. Crea el worktree en `../worktrees-ttd/<rama>` (al lado del checkout
     principal): `git worktree add "../worktrees-ttd/<rama>" -b <rama> origin/main`.
  6. Abre enseguida una PR en borrador. La descripción empieza por
     `Closes #N`. Sin esa línea GitHub no muestra la PR en Development.
- Una PR que ya existía se adopta igual: se añade `Closes #N` como primera
  línea y se rellenan Agente y Rama. No se deja la tarjeta a medias.
- Tras cada avance relevante, publica un comentario de decisión en la issue con
  `docs/backlog/plantillas/comentario-decision.md` (marcador `<!-- ttd-decision -->`).
  Registra también las decisiones de Pablo en el chat, con fecha y decisión.
- Al retomar una tarea pausada, en revisión o abandonada, publica un comentario
  con Fase «Retomada»: quién retoma, commit/estado de partida, qué falta y plan.
  Devuelve la tarjeta a «En curso» en Project 2 y actualiza Agente si cambia.
- Pausar: pasa la tarjeta a «Pausada» **y** escribe en la issue un
  comentario con la plantilla de decisión, el motivo detallado, el estado de la rama y la condición
  para retomarla. Sin comentario no hay pausa.
- No empieces trabajo sin issue `BKL-NNN`. La descripción de la PR empieza
  por `Closes #N`. PR sin issue solo para dependencias o CI (`sin-backlog`).
- Hecho = cumple `docs/backlog/DOD.md`. Si la entrega deja una mejora
  obvia para la DoR o la DoD, propónla a Pablo en ese momento (opcional,
  nunca bloquea).
- Las decisiones de producto son de Pablo: propón opciones, no decidas.

## Antes de dar una tarea por terminada

1. `pnpm lint`, `pnpm typecheck`, `pnpm test` en verde; integración si tocaste la API.
2. OpenAPI regenerado y sin diff (`pnpm --filter api openapi:generate`).
3. Si tocaste eventos: catálogo de eventos actualizado (sección 11.1 de la spec).
4. Si tocaste el modelo: migración incluida en el PR con su rollback verificado.
5. La PR de esa issue se mergea al quedar el corte cerrado. No empieces otra
   issue en la misma rama.
6. Backlog al día: se cumple `docs/backlog/DOD.md` (columna correcta,
   comentarios de decisión en la issue, Agente y Rama, la descripción empieza por `Closes #N` y DECISIONES.md si aplica).
