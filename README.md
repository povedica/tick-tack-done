# Reflexionia Tasks

Gestor de tareas personal extensible en todo.reflexionia.com: listas, etiquetas, filtros inteligentes, prioridades, subtareas, recurrencias, recordatorios, calendario, vistas Kanban/Timeline, hábitos, Pomodoro, offline-first, servidor MCP y API REST con tokens por scopes.
TypeScript extremo a extremo: NestJS + PostgreSQL + Prisma + Redis/BullMQ, PWA en React,
servidor MCP y API REST con PATs de scopes granulares desde la fase 1.

Proyecto personal, sin afiliación con TickTick ni Appest. La capa /open/v1 solo ofrece compatibilidad con su Open API pública.

La fuente de verdad del producto es la especificación histórica. Cómo leerla está en `AGENTS.md`.
Las normas para agentes de codificación están en `AGENTS.md` y `.cursor/rules/`.

## Requisitos

- Docker + Docker Compose
- El Node que ejecuta la app es el de la imagen `node:26-alpine` (la misma que las imágenes de producción y que CI). No hace falta instalar Node 26 en el Mac: el Node local solo lanza Compose.

## Arranque en desarrollo

```bash
cp .env.example .env        # rellena los valores
pnpm dev                    # Postgres, Redis, Mailpit y la app (API + web) en Docker
pnpm db:migrate             # crea el esquema, dentro del mismo contenedor
pnpm db:seed                # datos de ejemplo
```

- Web: http://localhost:5173 · API: http://localhost:3000 · OpenAPI: http://localhost:3000/api/docs
- Correo de desarrollo capturado en Mailpit: http://localhost:8025

## Estructura

```
apps/api          NestJS + Prisma + BullMQ (incluye el servidor MCP; recurrencias vía
                  create_task/update_task con `recurrence`/`repeat_rule`, RF-2007..RF-2015)
apps/web          React + Vite PWA (offline-first)
packages/domain   reglas de negocio puras (recurrencias, filtros, NLP) — sin frameworks
packages/sdk      cliente TS generado del OpenAPI
scripts/          backups (RF-1704), utilidades
```

## Comandos

| Comando                                        | Qué hace                                         |
| ---------------------------------------------- | ------------------------------------------------ |
| `pnpm dev`                                     | infra + api + web en `node:26-alpine`            |
| `pnpm test` / `test:integration` / `test:e2e`  | Vitest / Supertest / Playwright                  |
| `pnpm lint` · `pnpm typecheck` · `pnpm format` | calidad                                          |
| `pnpm db:migrate` / `db:deploy` / `db:seed`    | Prisma                                           |
| `pnpm backup` · `pnpm backup:verify`           | backup diario y prueba de restauración (RF-1704) |

## Despliegue

Docker Compose + Caddy (HTTPS automático) en un VPS con Docker,
migraciones al arrancar, backup diario externo y prueba de restauración semanal por cron.
La política de avisos está en `SECURITY.md`. Licencia MIT.
