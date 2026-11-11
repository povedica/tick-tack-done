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
- **Una feature, una PR**: cada punto del roadmap va en su propia rama. Al terminarlo, se mergea la PR. El siguiente punto no se añade a esa rama.
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

- El estado vivo del trabajo está en el Project «ttd · backlog». `docs/backlog/BACKLOG.md` es un
  espejo generado (no editar su bloque a mano) y `docs/backlog/DECISIONES.md` es el registro de
  decisiones. Reglas: `docs/backlog/PROTOCOLO-BACKLOG.md`; pasos y comandos: skill
  `.cursor/skills/backlog-github-projects/SKILL.md`. Cursor la descubre como skill; Codex debe leer
  ese mismo fichero al inicio y al cierre de tareas relacionadas con el backlog.
- No empieces trabajo sin issue `BKL-NNN`. Máximo 3 elementos en «En Codex/PR».
- Toda PR enlaza su issue: «Closes #N» si la termina, «Refs #N» si avanza. PR sin issue solo para
  dependencias o CI, con la etiqueta `sin-backlog`.
- Si la PR aplica o cambia una decisión, actualiza `DECISIONES.md` en la misma PR.
- Hecho = «Desplegado»: commit visible en `/api/v1/health` y prueba en producción hecha. Antes de
  eso, como mucho «Fusionado».
- Las decisiones de producto son de Pablo: propón opciones y recomendación, no decidas.

## Antes de dar una tarea por terminada

1. `pnpm lint`, `pnpm typecheck`, `pnpm test` en verde; integración si tocaste la API.
2. OpenAPI regenerado y sin diff (`pnpm --filter api openapi:generate`).
3. Si tocaste eventos: catálogo de eventos actualizado (sección 11.1 de la spec).
4. Si tocaste el modelo: migración incluida en el PR con su rollback verificado.
5. La PR de ese punto se mergea al quedar el corte cerrado. No empieces el punto siguiente en la misma rama.
6. Backlog al día: issue en el estado correcto del Project, PR con «Closes/Refs #N» y, si cambió una
   decisión, `docs/backlog/DECISIONES.md` actualizado.
