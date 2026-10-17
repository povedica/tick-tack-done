# Reflexionia Tasks

Gestor de tareas personal extensible (clon de TickTick) en `todo.reflexionia.com`.
TypeScript extremo a extremo: NestJS + PostgreSQL + Prisma + Redis/BullMQ, PWA en React,
servidor MCP y API REST con PATs de scopes granulares desde la fase 1.

La fuente de verdad del producto es `docs/spec/ticktick-clone-spec-v1.1.md`.
Las normas para agentes de codificación están en `AGENTS.md` y `.cursor/rules/`.

## Requisitos

- Node 22, pnpm 9 (`corepack enable`)
- Docker + Docker Compose

## Arranque en desarrollo

```bash
corepack enable
pnpm install
cp .env.example .env        # rellena los valores
pnpm dev                    # Postgres+Redis+Mailpit (docker) + API + web con hot reload
pnpm db:migrate             # crea el esquema
pnpm db:seed                # datos de ejemplo
```

- Web: http://localhost:5173 · API: http://localhost:3000 · OpenAPI: http://localhost:3000/api/docs
- Correo de desarrollo capturado en Mailpit: http://localhost:8025

## Estructura

```
apps/api          NestJS + Prisma + BullMQ (incluye el servidor MCP)
apps/web          React + Vite PWA (offline-first)
packages/domain   reglas de negocio puras (recurrencias, filtros, NLP) — sin frameworks
packages/sdk      cliente TS generado del OpenAPI
scripts/          backups (RF-1704), utilidades
docs/             arquitectura, migraciones, testing, seguridad, roadmap, prompts para Cursor
```

## Comandos

| Comando                                        | Qué hace                                         |
| ---------------------------------------------- | ------------------------------------------------ |
| `pnpm dev`                                     | infra + api + web en desarrollo                  |
| `pnpm test` / `test:integration` / `test:e2e`  | Vitest / Supertest / Playwright                  |
| `pnpm lint` · `pnpm typecheck` · `pnpm format` | calidad                                          |
| `pnpm db:migrate` / `db:deploy` / `db:seed`    | Prisma                                           |
| `pnpm backup` · `pnpm backup:verify`           | backup diario y prueba de restauración (RF-1704) |

## Despliegue

`docs/deployment.md`: Docker Compose + Caddy (HTTPS automático) en el Hetzner,
migraciones al arrancar, backup diario externo y prueba de restauración semanal por cron.
