# AGENTS.md — guía para agentes de codificación (Cursor y otros)

Este repositorio es un gestor de tareas personal extensible (clon de TickTick) desplegado en
`todo.reflexionia.com`. La fuente de verdad del producto es la especificación
`docs/spec/ticktick-clone-spec-v1.1.md` (RF-xx = requisito testeable). Este archivo resume las
normas; el detalle vive en `.cursor/rules/*.mdc`, que Cursor aplica automáticamente.

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
- `docker-compose.yml` + `Caddyfile` — despliegue en Hetzner. `docker-compose.dev.yml` — infra local.
- `scripts/` — seed, backups (RF-1704), utilidades de desarrollo.
- `docs/` — arquitectura, convenciones, plan por fases y prompts reutilizables.

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
pnpm install            # instalar
pnpm dev                # infra (docker) + api + web con hot reload
pnpm test               # unitarios (Vitest en todo el monorepo)
pnpm test:integration   # API contra Postgres/Redis reales
pnpm test:e2e           # Playwright, flujos críticos
pnpm db:migrate         # crear/aplicar migración Prisma en desarrollo
pnpm db:seed            # datos de desarrollo
pnpm lint && pnpm typecheck
```

## Antes de dar una tarea por terminada

1. `pnpm lint`, `pnpm typecheck`, `pnpm test` en verde; integración si tocaste la API.
2. OpenAPI regenerado y sin diff (`pnpm --filter api openapi:generate`).
3. Si tocaste eventos: catálogo de eventos actualizado (sección 11.1 de la spec).
4. Si tocaste el modelo: migración incluida en el PR con su rollback verificado.
5. La PR de ese punto se mergea al quedar el corte cerrado. No empieces el punto siguiente en la misma rama.
