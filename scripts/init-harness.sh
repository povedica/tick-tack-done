#!/usr/bin/env bash
# ============================================================================
#  RESTAURAR PROYECTO: reflexionia-tasks-harness-v1
# ----------------------------------------------------------------------------
#  Este archivo contiene el repositorio completo (65 archivos con su
#  contenido exacto y sus rutas) empaquetado como un script de bash.
#
#  CÓMO USARLO (un solo comando):
#    1. Guarda este archivo con el nombre: restaurar.sh
#    2. Abre una terminal en la carpeta donde quieras el proyecto y ejecuta:
#
#         bash restaurar.sh
#
#    3. Se creará la carpeta "reflexionia-tasks-harness-v1/" con todo dentro,
#       incluidas las carpetas vacías del repo original.
#
#  No hace falta instalar nada: funciona en macOS y Linux con bash estándar.
# ============================================================================
set -euo pipefail

mkdir -p reflexionia-tasks-harness-v1
cd reflexionia-tasks-harness-v1
mkdir -p './.cursor'
mkdir -p './.cursor/rules'
mkdir -p './.github'
mkdir -p './.github/workflows'
mkdir -p './apps'
mkdir -p './apps/api'
mkdir -p './apps/api/prisma'
mkdir -p './apps/api/src'
mkdir -p './apps/api/src/common'
mkdir -p './apps/api/src/events'
mkdir -p './apps/api/src/mcp'
mkdir -p './apps/api/src/modules'
mkdir -p './apps/api/src/scheduler'
mkdir -p './apps/api/test'
mkdir -p './apps/web'
mkdir -p './apps/web/e2e'
mkdir -p './apps/web/public'
mkdir -p './apps/web/src'
mkdir -p './apps/web/src/features'
mkdir -p './apps/web/src/i18n'
mkdir -p './apps/web/src/lib'
mkdir -p './apps/web/src/routes'
mkdir -p './docker'
mkdir -p './docs'
mkdir -p './docs/prompts'
mkdir -p './docs/spec'
mkdir -p './packages'
mkdir -p './packages/domain'
mkdir -p './packages/domain/src'
mkdir -p './packages/domain/src/filters'
mkdir -p './packages/domain/src/nlp'
mkdir -p './packages/domain/src/recurrence'
mkdir -p './packages/sdk'
mkdir -p './scripts'
cat > './.cursor/rules/00-project.mdc' <<'__REFLEXIONIA_EOF__'
---
alwaysApply: true
---

# Proyecto: gestor de tareas personal (todo.reflexionia.com)

Clon extensible de TickTick. La especificación completa está en
`docs/spec/ticktick-clone-spec-v1.1.md`; los RF-xx son requisitos identificables y testeables.

## Decisiones fijas (sección 21 de la spec, no reabrir)

- Cliente único en fase 1: PWA web (React + TypeScript), cuidada en móvil y escritorio, offline-first.
- Backend: TypeScript extremo a extremo, NestJS + PostgreSQL + Prisma. Redis (BullMQ) para bus de eventos y colas.
- Despliegue: Docker Compose + Caddy en un Hetzner existente, dominio `todo.reflexionia.com`.
- Multiusuario en el modelo de datos desde el inicio; un solo usuario activo al lanzar.
- Servidor MCP + PATs con scopes granulares son requisito de fase 1, no una mejora.
- Hábitos entran en el MVP; Pomodoro en V2; importador TickTick aplazado.

## Principios de diseño (sección 3)

1. API-first: la UI consume la misma API pública documentada. Sin endpoints privados.
2. Todo cambio de estado emite un evento de dominio versionado.
3. Offline-first en el cliente: cola de mutaciones con `Idempotency-Key`, replay al reconectar.
4. Formatos estándar: RRULE (RFC 5545), triggers iCalendar, iCal/CSV/JSON, Markdown.
5. Idiomas: español en docs/UI/mensajes de usuario; inglés en código, tests y commits.
__REFLEXIONIA_EOF__
cat > './.cursor/rules/10-architecture.mdc' <<'__REFLEXIONIA_EOF__'
---
alwaysApply: true
---

# Arquitectura (sección 4 de la spec)

## Reglas arquitectónicas duras

- Los módulos de dominio NO se llaman entre sí directamente: publican y consumen eventos del bus.
- El scheduler es el ÚNICO componente que materializa ocurrencias de tareas recurrentes y dispara recordatorios.
- El dispatcher de webhooks y el motor de automatizaciones consumen del mismo bus: un evento existe una vez y se reparte.
- Integraciones externas (Telegram, Google Calendar, Drive) son consumidores de la API y los eventos; jamás código especial con acceso directo a la base de datos (RF-2006).

## Estructura del monorepo (sección 18)

- `apps/api/src/modules/<modulo>/` — un módulo NestJS por dominio: tasks, lists, tags, filters, habits, focus, notes, calendar, reminders, search, sync, dashboard, reports, review, import-export, auth, mcp, webhooks, automations.
- Cada módulo: `<modulo>.module.ts`, `<modulo>.controller.ts`, `<modulo>.service.ts`, `dto/`, `<modulo>.service.spec.ts`.
- `apps/api/src/events/` — catálogo de eventos de dominio, bus (BullMQ), ActivityLog.
- `apps/api/src/scheduler/` — materialización de recurrencias y recordatorios (RF-808: 48 h de antelación, catch-up al arrancar).
- `packages/domain/src/` — lógica pura compartida: `recurrence/`, `filters/`, `nlp/`. Sin imports de Nest/React/Prisma.
- `packages/sdk` — cliente generado del OpenAPI; no editar a mano.

## Reglas transversales del modelo (sección 6)

- Soft delete con papelera 30 días; purga automática después.
- `sort_order` con espaciado de 65536 para reordenar en O(1).
- Fechas en UTC + `time_zone` de captura (IANA). Una tarea "9:00 en Madrid" sigue a las 9:00 locales aunque el usuario viaje.
- Al completar una recurrente se crea la siguiente ocurrencia según `repeat_rule` y `repeat_from`; el checklist vuelve a activo.
__REFLEXIONIA_EOF__
cat > './.cursor/rules/20-typescript.mdc' <<'__REFLEXIONIA_EOF__'
---
globs: **/*.ts, **/*.tsx
alwaysApply: false
---

# TypeScript estricto en todo el monorepo

- `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` activados en `tsconfig.base.json`. No relajar por archivo.
- Prohibido `any`; usa `unknown` y narrowing. Prohibido `@ts-ignore` sin comentario que lo justifique.
- Tipos de dominio compartidos viven en `packages/domain/src/types.ts` y son la fuente de verdad (Task, Project, Tag, Habit, Filter…). Los DTOs de la API y los modelos de la UI derivan de ellos.
- Enums del modelo con string literals (`'active' | 'completed' | 'archived'`), nunca números sueltos. Los mapeos con TickTick (priority 0/1/3/5) solo en la capa de compatibilidad `/open/v1`.
- Fechas: `Date` solo en los bordes; en dominio, ISO 8601 strings con offset + `timeZone` IANA aparte. Usa la librería de fechas elegida (date-fns-tz); nunca aritmética de ms a mano para zonas horarias.
- Funciones puras y pequeñas en dominio; efectos (BD, red, reloj, aleatorio) inyectados para que sean testeables.
__REFLEXIONIA_EOF__
cat > './.cursor/rules/30-api-nestjs.mdc' <<'__REFLEXIONIA_EOF__'
---
globs: apps/api/**
alwaysApply: false
---

# Convenciones de la API (NestJS)

## Endpoints

- Base `/api/v1`, versionado en path. JSON en todo. La spec (sección 10.3) define las rutas; no inventar rutas fuera de ella sin actualizar la spec.
- Todo endpoint lleva decoradores OpenAPI (`@ApiOperation`, `@ApiResponse`, DTOs con `@ApiProperty`). CI falla si el OpenAPI generado cambia sin commitear.
- Errores con formato `{error: {code, message, details}}` y códigos estables (`task_not_found`, `validation_failed`, `scope_missing`…). Un filtro global mapea excepciones de dominio a estos códigos.
- Paginación por cursor: `?limit=50&cursor=`, respuesta con `next_cursor`. Nada de offsets.
- POST de creación acepta cabecera `Idempotency-Key` (requisito offline, RF-13010); respeta la clave 24 h.
- `X-Request-Id` en todas las respuestas; ETag en GETs de colección.

## Seguridad por endpoint

- Todo endpoint declara sus scopes con un decorador `@Scopes('tasks:write')` y un guard global los verifica (lista de scopes en sección 10.1).
- Rate limiting por token: 1000 req/15 min, cabeceras `X-RateLimit-*`, `429` con `Retry-After`.
- Validación con class-validator en DTOs; `whitelist: true, forbidNonWhitelisted: true, transform: true`.
- La UI usa cookies httpOnly + CSRF; los agentes usan PAT (Bearer). Nunca mezclar.

## Servicios y eventos

- Un service por módulo; transacciones Prisma explícitas cuando una operación toca varias tablas.
- Después de cada mutación de estado relevante, publicar el evento de dominio correspondiente en la MISMA transacción (tabla outbox) y dejar que el bus la drene (patrón outbox, no doble escritura).
- El ActivityLog se alimenta de los eventos, con `actor` = usuario o token (auditoría por agente, sección 15).
- Integraciones externas consumen API/eventos; nunca importan servicios de otros módulos (RF-2006).
__REFLEXIONIA_EOF__
cat > './.cursor/rules/40-web-react.mdc' <<'__REFLEXIONIA_EOF__'
---
globs: apps/web/**
alwaysApply: false
---

# Convenciones del frontend (React PWA)

## Estructura

- `apps/web/src/features/<feature>/` — por dominio (tasks, lists, habits, calendar, dashboard…), cada una con `components/`, `hooks/`, `api.ts`, `types.ts`.
- Estado de servidor con TanStack Query (cache + invalidación por eventos de sync); estado local efímero con Zustand. Nada de Redux.
- Datos solo a través de `packages/sdk` (cliente generado del OpenAPI). Prohibido `fetch` suelto.
- Rutas limpias y compartibles (sección 7): `/list/:id`, `/today`, `/calendar/:view`, `/habits`, `/dashboard`, `/task/:id`. La URL refleja el estado de navegación.

## PWA y offline (RF-13010 y criterio de aceptación 5)

- Cola local de mutaciones en IndexedDB con `Idempotency-Key` por mutación; replay al reconectar; la UI optimista marca el estado pendiente.
- Service worker con `vite-plugin-pwa`: app shell cacheado, datos por IndexedDB, sync en segundo plano cuando el navegador lo permita.
- Web Push para recordatorios; en iOS documentar que requiere la PWA instalada (sección 20).

## UI

- i18n desde el primer componente: todas las cadenas en ficheros de mensajes (`es` default, `en`). Nada de texto hardcodeado.
- Accesibilidad WCAG 2.1 AA: navegación completa por teclado, atajos de la sección 9.19 (`N` crear, `space` completar, `?` ayuda, `/` o `Ctrl/Cmd+K` paleta).
- Componentes pequeños y con tipos explícitos; nada de `any`. Los componentes de tarjeta de tarea muestran el progreso del checklist (x/y, RF-207).
__REFLEXIONIA_EOF__
cat > './.cursor/rules/50-domain.mdc' <<'__REFLEXIONIA_EOF__'
---
globs: packages/domain/**
alwaysApply: false
---

# packages/domain — reglas de negocio puras

Aquí vive la lógica que comparten API, automatizaciones y clientes (sección 18). Es el paquete más testeado del repo: cobertura >80% (sección 16).

- PROHIBIDO importar NestJS, React, Prisma, Express, o cualquier IO. ESLint lo bloquea.
- Funciones puras: reloj y generador de IDs se inyectan.
- `recurrence/` — expansión RRULE con librería probada (rrule.js). Cubrir los casos límite de RF-706: 29-31 de febrero, cambio de horario de verano, completar con retraso, `repeat_from: completion_date`.
- `filters/` — evaluador de la gramática de filtros de la sección 5.7 (combinators AND/OR, un nivel de grupos). Es la ÚNICA implementación: la usan `POST /filters/preview`, las smart lists, las automatizaciones y las revisiones asistidas. Nada de lógica duplicada en cliente (RF-904).
- `nlp/` — parser del quick add (RF-102): fecha/hora, prioridad (`!alta`, p1-p3), etiquetas (`#`), lista (`^`), recordatorio, en español e inglés. Reglas, no ML. Devuelve siempre qué fragmentos del texto reconoció para que la UI los resalte.
- Cada función pública tiene tests de casos felices, límite y error, citando el RF-xx correspondiente en el nombre del test.
__REFLEXIONIA_EOF__
cat > './.cursor/rules/60-testing.mdc' <<'__REFLEXIONIA_EOF__'
---
alwaysApply: true
---

# Estrategia de tests (sección 16)

Pirámide: muchos unitarios de dominio, integración de API contra servicios reales, pocos e2e de flujos críticos.

## Frameworks elegidos (default del harness)

- **Vitest** en todo el monorepo para unitarios (incluida la API: se usa Vitest también en NestJS para tener un solo runner).
- **Supertest + Testcontainers** (o Postgres/Redis del compose de CI) para integración de API.
- **Playwright** para e2e de la PWA.

## Convenciones

- Tests junto al código: `foo.service.spec.ts`. Los e2e en `apps/web/e2e/`.
- Nombra los tests con el RF que cubren: `it('RF-706: mensual en 31 cae en último día de febrero', …)`.
- Casos límite obligatorios en recurrencias (RF-706), zonas horarias (RF-604), filtros (5.7) y NLP (RF-102).
- Integración: migra una BD real con `prisma migrate deploy` antes de correr; no mockees Prisma en integración.
- E2e mínimos (sección 16): crear → recordar → completar; y crear/editar offline → reconectar → converge sin duplicados.
- Cobertura >80% en `packages/domain`; CI la exige.
__REFLEXIONIA_EOF__
cat > './.cursor/rules/70-database-prisma.mdc' <<'__REFLEXIONIA_EOF__'
---
globs: apps/api/prisma/**, **/migrations/**
alwaysApply: false
---

# Base de datos y migraciones (Prisma)

- El esquema vive en `apps/api/prisma/schema.prisma` y sigue la sección 5 de la spec: nombres de campos, enums, índices ((project_id, status, sort_order), parcial sobre due_date activas, GIN de tags, FTS de título+contenido).
- Toda entidad: `id uuid`, `created_at`, `updated_at`, `deleted_at` (soft delete) salvo indicación contraria. Toda entidad cuelga de un owner (multiusuario, D5).
- Migraciones SOLO con `pnpm db:migrate` (Prisma Migrate). Nunca `db push` contra datos reales. Nunca editar una migración ya aplicada; crea una nueva.
- Toda migración debe ser reversible: escribe y verifica el `down` (o documenta por qué no lo es). Ver `docs/migrations.md`.
- Nombres de migración en inglés, descriptivos: `add_habit_goal_jsonb`, no `update2`.
- Datos semilla en `apps/api/prisma/seed.ts` (ejecuta con `pnpm db:seed`): usuario demo, inbox de sistema, listas/etiquetas/hábitos de ejemplo. Idempotente.
- Cambios destructivos (drop/rename) en dos pasos: expand (añade lo nuevo) → migrar datos → contract (quita lo viejo), en PRs separados.
__REFLEXIONIA_EOF__
cat > './.cursor/rules/80-security.mdc' <<'__REFLEXIONIA_EOF__'
---
alwaysApply: true
---

# Seguridad y privacidad (sección 15)

- Contraseñas con Argon2id. Sesiones revocables con cookies httpOnly + CSRF.
- PATs: se almacena solo el hash, se muestra el token una sola vez, último uso visible, revocación inmediata. Un token por agente con scopes mínimos (sección 10.1).
- El servidor MCP nunca tiene más privilegios que el token usado (RF-2001): pasa el contexto de scopes a cada tool.
- Toda acción de un token queda en ActivityLog (qué agente, qué hizo, cuándo) y es consultable en `GET /api/v1/me/tokens/{id}/activity`.
- Tokens de feeds iCal y la dirección email-to-task son regenerables con revocación inmediata.
- Secretos solo por variables de entorno; NUNCA en código, tests, fixtures ni docs. `.env` está en `.gitignore`; actualiza `.env.example` (sin valores reales) cuando añadas una variable.
- Sin telemetría a terceros por defecto.
- Los webhooks salientes se firman con HMAC-SHA256 (`X-Signature-256`) y reintentan con backoff exponencial (10 intentos / 24 h).
- Entrada externa (email-to-task, webhooks entrantes futuros, adjuntos) es datos no confiables: validar, limitar tamaño (adjuntos 25 MB default) y nunca ejecutar.
__REFLEXIONIA_EOF__
cat > './.cursor/rules/90-git-workflow.mdc' <<'__REFLEXIONIA_EOF__'
---
alwaysApply: true
---

# Git y flujo de trabajo

- Conventional Commits en inglés: `feat(api): …`, `fix(domain): …`, `test:`, `docs:`, `chore:`, `refactor:`. Scope = app/package tocado.
- Sin commits directos a `main`: rama por tarea (`feat/quick-add-nlp`), PR, CI en verde (lint, format, typecheck, unit, integration, openapi-check).
- Un PR = un RF o un grupo pequeño de RFs. Cita los RF-xx en la descripción del PR.
- Si el PR toca el modelo: incluye migración y su rollback verificado. Si toca eventos: catálogo de la sección 11.1 actualizado. Si toca la API: OpenAPI regenerado.
- La spec se versiona junto al código: si una fase se cierra o una decisión cambia, actualiza `docs/spec/` (sección 19) en el mismo PR.
__REFLEXIONIA_EOF__
cat > './.cursorignore' <<'__REFLEXIONIA_EOF__'
node_modules
dist
build
coverage
pnpm-lock.yaml
apps/api/openapi.json
packages/sdk/src/generated
backups
data
__REFLEXIONIA_EOF__
cat > './.editorconfig' <<'__REFLEXIONIA_EOF__'
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
__REFLEXIONIA_EOF__
cat > './.env.example' <<'__REFLEXIONIA_EOF__'
# --- Base de datos ---
POSTGRES_USER=reflexionia
POSTGRES_PASSWORD=cambiar-en-produccion
POSTGRES_DB=reflexionia
DATABASE_URL=postgresql://reflexionia:cambiar-en-produccion@localhost:5432/reflexionia

# --- Redis (bus de eventos BullMQ, cola de recordatorios, caché) ---
REDIS_URL=redis://localhost:6379

# --- API ---
NODE_ENV=development
PORT=3000
PUBLIC_URL=https://todo.reflexionia.com
# Secreto para firmar sesiones y PATs: generar con `openssl rand -hex 32`
APP_SECRET=generar-con-openssl-rand-hex-32

# --- Email transaccional (SMTP) ---
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=todo@reflexionia.com

# --- Web Push (VAPID): generar con `pnpm --filter web exec web-push generate-vapid-keys` ---
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:todo@reflexionia.com

# --- Backups (RF-1704) ---
BACKUP_DIR=./backups
BACKUP_RETENTION_DAYS=30
# Destino externo (restic/rclone/s3). Obligatorio en producción: los backups viven fuera de la máquina.
BACKUP_REMOTE=

# --- Web ---
VITE_API_URL=https://todo.reflexionia.com/api/v1
__REFLEXIONIA_EOF__
cat > './.gitattributes' <<'__REFLEXIONIA_EOF__'
* text=auto eol=lf
*.png binary
*.jpg binary
*.ico binary
*.woff2 binary
pnpm-lock.yaml -diff linguist-generated
__REFLEXIONIA_EOF__
cat > './.github/workflows/ci.yml' <<'__REFLEXIONIA_EOF__'
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm typecheck

  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  test-integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: reflexionia
          POSTGRES_PASSWORD: ci
          POSTGRES_DB: reflexionia_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U reflexionia"
          --health-interval 5s --health-timeout 3s --health-retries 10
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    env:
      DATABASE_URL: postgresql://reflexionia:ci@localhost:5432/reflexionia_test
      REDIS_URL: redis://localhost:6379
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:deploy
      - run: pnpm test:integration

  openapi-check:
    # Sección 18: el OpenAPI se genera del código y CI verifica que no hay endpoints sin documentar.
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter api build
      - run: pnpm --filter api openapi:generate
      - name: El OpenAPI generado no debe tener diff sin commitear
        run: git diff --exit-code apps/api/openapi.json
__REFLEXIONIA_EOF__
cat > './.gitignore' <<'__REFLEXIONIA_EOF__'
node_modules/
dist/
build/
coverage/
*.tsbuildinfo
.env
.env.*
!.env.example
.vite/
playwright-report/
test-results/
data/
backups/
.DS_Store
*.log
__REFLEXIONIA_EOF__
cat > './.npmrc' <<'__REFLEXIONIA_EOF__'
engine-strict=true
save-exact=true
auto-install-peers=true
__REFLEXIONIA_EOF__
cat > './.nvmrc' <<'__REFLEXIONIA_EOF__'
22
__REFLEXIONIA_EOF__
cat > './.prettierrc' <<'__REFLEXIONIA_EOF__'
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "endOfLine": "lf"
}
__REFLEXIONIA_EOF__
cat > './AGENTS.md' <<'__REFLEXIONIA_EOF__'
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
__REFLEXIONIA_EOF__
cat > './Caddyfile' <<'__REFLEXIONIA_EOF__'
# Reverse proxy con HTTPS automático para todo.reflexionia.com (sección 4, D4)
todo.reflexionia.com {
	encode zstd gzip

	# App web (PWA)
	handle /* {
		reverse_proxy web:8080
	}

	# API REST v1 + servidor MCP (mismo proceso NestJS)
	handle /api/* {
		reverse_proxy api:3000
	}
	handle /mcp/* {
		reverse_proxy api:3000
	}

	# Cabeceras de seguridad (sección 15)
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy strict-origin-when-cross-origin
		-Server
	}
}
__REFLEXIONIA_EOF__
cat > './README.md' <<'__REFLEXIONIA_EOF__'
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

| Comando | Qué hace |
|---|---|
| `pnpm dev` | infra + api + web en desarrollo |
| `pnpm test` / `test:integration` / `test:e2e` | Vitest / Supertest / Playwright |
| `pnpm lint` · `pnpm typecheck` · `pnpm format` | calidad |
| `pnpm db:migrate` / `db:deploy` / `db:seed` | Prisma |
| `pnpm backup` · `pnpm backup:verify` | backup diario y prueba de restauración (RF-1704) |

## Despliegue

`docs/deployment.md`: Docker Compose + Caddy (HTTPS automático) en el Hetzner,
migraciones al arrancar, backup diario externo y prueba de restauración semanal por cron.
__REFLEXIONIA_EOF__
cat > './apps/api/Dockerfile' <<'__REFLEXIONIA_EOF__'
# Imagen de la API (NestJS + servidor MCP en el mismo proceso, sección 4)
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile --filter api...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/domain packages/domain
COPY apps/api apps/api
RUN pnpm --filter api build && pnpm --filter api exec prisma generate

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app ./
# El entrypoint aplica `prisma migrate deploy` antes de arrancar (ver docker-compose.yml)
CMD ["sh", "-c", "pnpm --filter api exec prisma migrate deploy && node apps/api/dist/main.js"]
__REFLEXIONIA_EOF__
cat > './apps/api/nest-cli.json' <<'__REFLEXIONIA_EOF__'
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
__REFLEXIONIA_EOF__
cat > './apps/api/package.json' <<'__REFLEXIONIA_EOF__'
{
  "name": "api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "start": "node dist/main.js",
    "lint": "eslint src test",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.config.integration.ts",
    "openapi:generate": "node dist/scripts/generate-openapi.js",
    "seed": "tsx prisma/seed.ts",
    "prisma": "prisma"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@nestjs/swagger": "^11.0.0",
    "@nestjs/bullmq": "^11.0.0",
    "@prisma/client": "^6.0.0",
    "argon2": "^0.41.0",
    "bullmq": "^5.0.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "cookie-parser": "^1.4.7",
    "date-fns-tz": "^3.2.0",
    "helmet": "^8.0.0",
    "ioredis": "^5.4.0",
    "reflect-metadata": "^0.2.2",
    "rrule": "^2.8.1",
    "rxjs": "^7.8.1",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "prisma": "^6.0.0"
  }
}
__REFLEXIONIA_EOF__
cat > './apps/api/prisma/README.md' <<'__REFLEXIONIA_EOF__'
# Prisma

- `schema.prisma`: modelo de la sección 5 de la spec (nombres y enums tal cual).
- Migraciones: `pnpm db:migrate` (nunca `db push`, nunca editar migraciones aplicadas).
- `seed.ts`: usuario demo + inbox de sistema + datos de ejemplo; idempotente (`upsert`).
- Convenciones completas: `.cursor/rules/70-database-prisma.mdc` y `docs/migrations.md`.
__REFLEXIONIA_EOF__
cat > './apps/api/src/app.module.ts' <<'__REFLEXIONIA_EOF__'
import { Module } from '@nestjs/common';

// Un módulo por dominio (sección 4): tasks, lists, tags, filters, habits, focus, notes,
// calendar, reminders, search, sync, dashboard, reports, review, import-export, auth,
// mcp, webhooks, automations. Los módulos no se importan entre sí: publican/consumen eventos.
@Module({
  imports: [],
})
export class AppModule {}
__REFLEXIONIA_EOF__
cat > './apps/api/src/main.ts' <<'__REFLEXIONIA_EOF__'
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // OpenAPI generado del código (sección 18): publicado en /api/docs y exportado por openapi:generate
  const config = new DocumentBuilder()
    .setTitle('Reflexionia Tasks API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
__REFLEXIONIA_EOF__
cat > './apps/api/src/modules/README.md' <<'__REFLEXIONIA_EOF__'
# Módulos de dominio

Un módulo NestJS por dominio de la sección 4. Plantilla por módulo:

```
tasks/
  tasks.module.ts
  tasks.controller.ts      # rutas de la sección 10.3, decoradores OpenAPI completos
  tasks.service.ts         # lógica de aplicación; delega reglas puras a packages/domain
  dto/                     # class-validator + @ApiProperty en cada campo
  tasks.service.spec.ts    # unitarios
  tasks.e2e-spec.ts        # integración (en test/)
```

Reglas: sin imports entre módulos; comunicación por eventos del bus (`src/events/`).
Toda mutación publica su evento en la misma transacción (outbox) y alimenta ActivityLog.
__REFLEXIONIA_EOF__
cat > './apps/api/test/README.md' <<'__REFLEXIONIA_EOF__'
# Tests de integración de la API

Supertest contra la app NestJS real con Postgres y Redis (compose de CI o `docker-compose.dev.yml`).
Migrar antes de correr: `pnpm db:deploy`. No mockear Prisma aquí.
Nombrar los tests con el RF-xx que cubren.
__REFLEXIONIA_EOF__
cat > './apps/api/tsconfig.json' <<'__REFLEXIONIA_EOF__'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "./dist",
    "baseUrl": "./",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*", "test/**/*", "prisma/seed.ts"]
}
__REFLEXIONIA_EOF__
cat > './apps/web/Dockerfile' <<'__REFLEXIONIA_EOF__'
# Imagen de la PWA: build estático servido por Caddy/NGINX en el puerto 8080
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/sdk/package.json packages/sdk/
RUN pnpm install --frozen-lockfile --filter web...
COPY tsconfig.base.json ./
COPY packages/sdk packages/sdk
COPY apps/web apps/web
RUN pnpm --filter web build

FROM nginx:alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
__REFLEXIONIA_EOF__
cat > './apps/web/nginx.conf' <<'__REFLEXIONIA_EOF__'
server {
  listen 8080;
  root /usr/share/nginx/html;
  index index.html;
  location / {
    # SPA fallback: las rutas limpias de la sección 7 las resuelve el cliente
    try_files $uri $uri/ /index.html;
  }
}
__REFLEXIONIA_EOF__
cat > './apps/web/package.json' <<'__REFLEXIONIA_EOF__'
{
  "name": "web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint src",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.62.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^7.1.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vite-plugin-pwa": "^0.21.0",
    "vitest": "^3.0.0"
  }
}
__REFLEXIONIA_EOF__
cat > './apps/web/src/README.md' <<'__REFLEXIONIA_EOF__'
# Estructura del frontend

- `features/<feature>/` — por dominio: `components/`, `hooks/`, `api.ts` (solo vía packages/sdk), `types.ts`.
- `routes/` — rutas limpias de la sección 7 (`/today`, `/list/:id`, `/calendar/:view`, `/habits`, `/dashboard`…).
- `i18n/` — mensajes `es` (default) y `en`. Ninguna cadena hardcodeada en componentes.
- `lib/offline/` — cola de mutaciones en IndexedDB con Idempotency-Key (RF-13010).

Estado: TanStack Query para datos de servidor, Zustand para UI efímera. Sin fetch suelto.
__REFLEXIONIA_EOF__
cat > './apps/web/tsconfig.json' <<'__REFLEXIONIA_EOF__'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "noEmit": true,
    "useDefineForClassFields": true,
    "types": ["vite/client", "vite-plugin-pwa/client"]
  },
  "include": ["src", "e2e"]
}
__REFLEXIONIA_EOF__
cat > './apps/web/vite.config.ts' <<'__REFLEXIONIA_EOF__'
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

// PWA (sección 2, D1): instalable, offline-first, push. Ver RF-13010 para la cola de mutaciones.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Reflexionia Tasks',
        short_name: 'Tasks',
        start_url: '/today',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#4f46e5',
        share_target: {
          // RF-106: "compartir a la app" desde el móvil vuelca al quick add
          action: '/quick-add',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/mcp': 'http://localhost:3000',
    },
  },
});
__REFLEXIONIA_EOF__
cat > './docker-compose.dev.yml' <<'__REFLEXIONIA_EOF__'
# Desarrollo local: solo infraestructura. La API y la web corren con pnpm dev (hot reload).
# Uso: docker compose -f docker-compose.dev.yml up -d
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: reflexionia
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: reflexionia
    ports:
      - "5432:5432"
    volumes:
      - pgdata_dev:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U reflexionia"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  # Correo transaccional en desarrollo: Mailpit captura todo el SMTP en http://localhost:8025
  mailpit:
    image: axllent/mailpit:latest
    ports:
      - "1025:1025"
      - "8025:8025"

volumes:
  pgdata_dev:
__REFLEXIONIA_EOF__
cat > './docker-compose.yml' <<'__REFLEXIONIA_EOF__'
# Producción: instancia única en el servidor Hetzner (sección 4, D4).
# Uso: docker compose up -d --build
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - api
      - web

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      REDIS_URL: redis://redis:6379
    volumes:
      - attachments:/data/attachments
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    # Migraciones al arrancar: `prisma migrate deploy` va en el entrypoint de la imagen.

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redisdata:/data

  # Backup diario con prueba de restauración (RF-1704). El script real vive en scripts/backup.sh
  # y se programa con cron del host: 0 4 * * * cd /opt/reflexionia && ./scripts/backup.sh

volumes:
  caddy_data:
  caddy_config:
  pgdata:
  redisdata:
  attachments:
__REFLEXIONIA_EOF__
cat > './docs/architecture.md' <<'__REFLEXIONIA_EOF__'
# Arquitectura

Resumen operativo de la sección 4 de la spec. En caso de duda, la spec manda.

```
PWA (React) / Telegram / agentes MCP ──HTTPS──▶ Caddy ──▶ API NestJS (+MCP) ──▶ PostgreSQL
                                                    │
                                                    ├─▶ Redis/BullMQ: bus de eventos, webhooks,
                                                    │   automatizaciones, scheduler (recurrencias
                                                    │   y recordatorios, RF-808)
                                                    └─▶ volumen local de adjuntos (S3 opcional)
```

Reglas duras: módulos aislados por eventos; scheduler único materializador; integraciones
externas solo vía API/eventos; dominio puro en `packages/domain`.
__REFLEXIONIA_EOF__
cat > './docs/deployment.md' <<'__REFLEXIONIA_EOF__'
# Despliegue (Hetzner, D4)

1. DNS: `todo.reflexionia.com` → IP del servidor.
2. En el servidor: `git clone … && cd reflexionia-tasks && cp .env.example .env` y rellenar
   (`APP_SECRET` con `openssl rand -hex 32`, `BACKUP_REMOTE` obligatorio).
3. `docker compose up -d --build`. Caddy obtiene y renueva el TLS solo.
4. Migraciones: corren solas al arrancar `api` (`migrate deploy` en el CMD de la imagen).
5. Cron del host:
   - `0 4 * * *` backup diario → `scripts/backup.sh` (copia fuera de la máquina, RF-1704)
   - `0 5 * * 0` prueba de restauración → `scripts/restore-verify.sh`
6. Actualizar: `git pull && docker compose up -d --build`.

Desarrollo local: `pnpm dev` levanta Postgres/Redis/Mailpit con `docker-compose.dev.yml`
y la API/web con hot reload.
__REFLEXIONIA_EOF__
cat > './docs/migrations.md' <<'__REFLEXIONIA_EOF__'
# Convenciones de migraciones

1. `pnpm db:migrate` genera y aplica en desarrollo. Revisa el SQL generado antes de commitear.
2. Reversibilidad: cada PR con migración indica cómo se deshace. `prisma migrate` no genera
   `down` automático: documéntalo en la descripción del PR y pruébalo en una BD de desarrollo.
3. Cambios destructivos en dos PRs: expand → contract. Entre medios, doble escritura si hace falta.
4. Producción: `prisma migrate deploy` corre en el arranque del contenedor `api` (ver Dockerfile).
5. Datos semilla idempotentes en `apps/api/prisma/seed.ts`.
6. El export JSON (RF-1703/RF-1705) lleva `schema_version` y un script de migración por versión;
   al cambiar el modelo, decide si sube también la versión del export.
__REFLEXIONIA_EOF__
cat > './docs/prompts/README.md' <<'__REFLEXIONIA_EOF__'
# Prompts reutilizables para Cursor

Plantillas para encargar trabajo al agente de Cursor con el contexto que necesita.
Cópialas, rellena los `<…>` y pega en el chat. La regla general: cita siempre RF-xx,
fase y archivos de referencia.

- `implementar-rf.md` — implementar un requisito concreto con tests.
- `nuevo-endpoint.md` — añadir un recurso/endpoint a la API con OpenAPI y scopes.
- `nueva-migracion.md` — cambio de modelo con migración reversible.
- `revision-codigo.md` — checklist de revisión antes de abrir PR.
__REFLEXIONIA_EOF__
cat > './docs/prompts/implementar-rf.md' <<'__REFLEXIONIA_EOF__'
# Plantilla: implementar un RF

```
Implementa <RF-XXX> de la especificación (docs/spec/ticktick-clone-spec-v1.1.md, sección <X.Y>).

Alcance: <qué entra y qué NO entra>.
Fase: <MVP/V1/V2>.

Antes de escribir código:
1. Lee AGENTS.md y las reglas aplicables en .cursor/rules (arquitectura, módulo tocado, testing).
2. Lee la sección de la spec y el modelo de datos afectado (sección 5).
3. Dime el plan: archivos que crearás/tocarás y eventos de dominio que publicarás.

Requisitos de entrega:
- Lógica de negocio pura en packages/domain si aplica (sin dependencias de framework).
- Endpoints con OpenAPI completo y scopes declarados; OpenAPI regenerado sin diff.
- Tests que citan el RF en su nombre; casos límite de la spec.
- pnpm lint, typecheck y test en verde.
- Docs en español, código en inglés.
```
__REFLEXIONIA_EOF__
cat > './docs/prompts/nueva-migracion.md' <<'__REFLEXIONIA_EOF__'
# Plantilla: cambio de modelo con migración

```
Cambio de modelo: <descripción> (afecta a la sección 5.<x> de la spec).

1. Actualiza apps/api/prisma/schema.prisma siguiendo los nombres de la spec.
2. Genera la migración con pnpm db:migrate y revisa el SQL.
3. Si es destructivo (drop/rename), hazlo en dos pasos expand/contract (docs/migrations.md).
4. Actualiza el seed si aplica (idempotente).
5. Decide si el export JSON sube de schema_version (RF-1705).
6. Dime cómo se revierte la migración antes de abrir el PR.
```
__REFLEXIONIA_EOF__
cat > './docs/prompts/nuevo-endpoint.md' <<'__REFLEXIONIA_EOF__'
# Plantilla: nuevo endpoint / recurso de API

```
Añade a la API el recurso <recurso> según la sección 10.3 de la spec:

- Rutas: <pegar las rutas exactas de la spec>
- Scopes (10.1): <scopes>
- DTOs con class-validator y @ApiProperty; errores con códigos estables {error:{code,message,details}}.
- Paginación por cursor; Idempotency-Key en POST de creación.
- Publica los eventos de dominio <lista> en la misma transacción (outbox) y alimenta ActivityLog.
- Regenera el OpenAPI y el SDK (pnpm --filter api openapi:generate && pnpm --filter @reflexionia/sdk generate).
- Tests de integración con Supertest citando los RF.
```
__REFLEXIONIA_EOF__
cat > './docs/prompts/revision-codigo.md' <<'__REFLEXIONIA_EOF__'
# Plantilla: revisión antes de PR

```
Revisa los cambios actuales como si fueras el reviewer. Comprueba y reporta:

1. Spec: ¿los RF-xx citados quedan cubiertos? ¿algo fuera de scope?
2. Arquitectura: ¿algún módulo importando a otro? ¿eventos publicados vía outbox?
   ¿lógica de negocio fuera de packages/domain?
3. API: OpenAPI sin diff, scopes declarados, códigos de error estables, cursor + idempotencia.
4. Seguridad: sin secretos, validación en bordes, auditoría por token si aplica.
5. Tests: citan RF, cubren casos límite de la spec; cobertura de domain >80%.
6. Convenciones: español en docs/UI, inglés en código, conventional commits.
7. `pnpm lint && pnpm typecheck && pnpm test` en verde.
```
__REFLEXIONIA_EOF__
cat > './docs/roadmap.md' <<'__REFLEXIONIA_EOF__'
# Plan por fases (espejo de la sección 19 de la spec)

Usa este plan para acotar cada tarea de Cursor: cita la fase y los RF-xx.

## MVP / fase 1 (4-6 semanas de agente)

1. **Base**: monorepo, CI, Docker Compose, modelo de datos completo (sección 5), migraciones, seed.
2. **Tareas núcleo**: CRUD + checklist + subtareas (RF-201–210), listas/carpetas/secciones
   (RF-301–306), etiquetas (RF-401–403), prioridades (RF-501–503).
3. **Tiempo**: fechas y zonas (RF-601–605), recurrencias (RF-701–706), recordatorios push+email
   con scheduler fiable (RF-801–808).
4. **Captura**: quick add con NLP ES/EN (RF-101–107), email-to-task (RF-105), share target (RF-106).
5. **Hábitos** con recordatorios y estadísticas (RF-1301–1305).
6. **Smart lists + filtros** con evaluación en backend (RF-901–904); vista lista (RF-1001);
   búsqueda + paleta (RF-1501–1502).
7. **Acceso de agentes**: API v1 completa de esos recursos + PAT con scopes (RF-2002) +
   servidor MCP (RF-2001). Criterio de aceptación 4.
8. **Offline básico**: cola de mutaciones con Idempotency-Key (RF-13010; criterio 5).
9. **Export JSON** versionado (RF-1703/1705) + backup diario con restauración probada (RF-1704).

## V1

Kanban/Timeline/Eisenhower (RF-1002–1004) · calendario completo + iCal + Google Calendar lectura
(RF-1101–1105) · bot de Telegram (RF-2003) · Google Drive (RF-2005) · notas (RF-1401–1403) ·
dashboard KPIs (RF-2101–2105) · reporte semanal (RF-2201–2204) · revisiones asistidas
(RF-2301–2303) · webhooks + automatizaciones (sección 11) · sync en tiempo real (RF-13013) ·
capa `/open/v1` (10.4) · import CSV · 2FA.

## V2

Colaboración (RF-1801–1805) · Pomodoro/Focus (RF-1201–1206) · plugins (sección 12) ·
widgets nativos/apps móviles · logros (RF-1602) · WIP limits · Google Calendar two-way.
__REFLEXIONIA_EOF__
cat > './docs/security.md' <<'__REFLEXIONIA_EOF__'
# Seguridad

Puntos de la sección 15 que condicionan el día a día:

- Argon2id para contraseñas; PATs con hash (se muestran una vez), scopes mínimos, un token por
  agente, auditoría por token en ActivityLog.
- Scopes declarados por endpoint (`@Scopes`), guard global, rate limit 1000 req/15 min por token.
- Webhooks firmados HMAC-SHA256 con reintentos exponenciales.
- Secretos solo por entorno; `.env.example` nunca lleva valores reales.
- Toda entrada externa es no confiable: validar tamaño y forma (email-to-task, adjuntos 25 MB).
- Sin telemetría a terceros por defecto.
__REFLEXIONIA_EOF__
cat > './docs/spec/ticktick-clone-spec-v1.1.md' <<'__REFLEXIONIA_EOF__'
# Especificación de producto: gestor de tareas propio (clon extensible de TickTick)

- **Versión del documento:** 1.1
- **Fecha:** 17 de octubre de 2026
- **Estado:** Decisiones de plataforma resueltas (sección 21); listo para desarrollo del MVP
- **Audiencia:** agente de desarrollo / equipo de ingeniería
- **Autor:** Pablo Poveda (especificación preparada por su asistente)

**Cambios en v1.1 (17 oct 2026):** decisiones de Pablo aplicadas: PWA web como único cliente inicial, despliegue en su servidor Hetzner con Docker Compose + Caddy, dominio `todo.reflexionia.com`, hábitos al MVP, Pomodoro a V2, sin importador TickTick (arranque desde cero), servidor MCP + PATs con scopes como requisito de fase 1, orden de prioridad de integraciones (Telegram, Google Calendar, Google Drive), dos extensiones propias en V1: dashboard de KPIs («jardín digital», sección 9.21) y reporte semanal honesto (sección 9.22), y seis refuerzos aceptados por Pablo: captura rápida como prioridad máxima, backups automáticos con restauración probada fuera de la máquina, tokens por agente con auditoría, MCP desde el día uno, revisión diaria/semanal asistida (sección 9.23) y offline móvil desde el MVP.

---

## 0. Cómo leer este documento

Este documento especifica de forma exhaustiva un gestor de tareas y productividad personal que replica la funcionalidad de TickTick y, además, está diseñado desde cero para ser extendido y conectado con cualquier sistema externo (API pública completa, webhooks, automatizaciones y plugins). Es la única limitación real que motiva el proyecto: TickTick apenas permite extensión.

Convenciones:

- **MVP**, **V1**, **V2**: fase de entrega sugerida (ver sección 19).
- **RF-xx**: requisito funcional identificable y testeable.
- Las decisiones de plataforma y alcance están resueltas (secciones 2 y 21).
- Donde se describe comportamiento de TickTick, se hace a nivel funcional (qué hace el usuario), no de implementación.

---

## 1. Visión y objetivos

### 1.1 Problema

El usuario usa TickTick a diario y le encaja su modelo mental (listas, etiquetas, filtros, Pomodoro, hábitos, calendario), pero TickTick:

- Ofrece una Open API muy limitada: solo tareas y proyectos, con dos scopes (`tasks:read`, `tasks:write`). No hay webhooks, ni hábitos, ni Pomodoro, ni filtros, ni notas accesibles por API.
- No tiene sistema de plugins ni automatizaciones definibles por el usuario.
- No permite autoalojar ni exportar de forma completa y estructurada todo el estado.

### 1.2 Objetivo

Construir una aplicación propia que:

1. Replique la funcionalidad completa de TickTick (tareas, listas, etiquetas, filtros inteligentes, prioridades, subtareas, recurrencias, recordatorios, calendario, vistas Kanban/Timeline, matriz de Eisenhower, Pomodoro, hábitos, notas, estadísticas).
2. Exponga **toda** la funcionalidad mediante una API pública de primera clase (no un subconjunto).
3. Sea extensible: webhooks salientes, automatizaciones internas (trigger → condición → acción) y un sistema de plugins.
4. Permita empezar desde cero sin depender de TickTick (sin importación en fase 1; el importador queda aplazado, ver RF-1701).

### 1.3 No objetivos (al menos en las primeras fases)

- No es un gestor de proyectos de equipo completo (no Gantt real, no dependencias entre tareas, no estimaciones de carga). La vista Timeline de TickTick es deliberadamente ligera y así se replica.
- No compite con Notion como base de conocimiento: las notas existen, pero son un complemento.
- Colaboración multiusuario avanzada es fase V2 (ver sección 9.18).

---

## 2. Decisiones de plataforma y stack (resueltas el 17 oct 2026)

Pablo resolvió todas las decisiones que estaban abiertas (detalle en la sección 21). Resumen:

| # | Decisión | Resolución |
|---|----------|------------|
| D1 | Plataformas cliente | **Web PWA como único cliente en fase 1**, cuidada tanto en móvil como en escritorio (responsive, instalable, push, offline). Las apps nativas (móvil/escritorio) llegan más adelante sobre la misma API. |
| D2 | Stack backend | **TypeScript extremo a extremo: NestJS + PostgreSQL + Prisma.** Confirmado. |
| D3 | Stack frontend | **React + TypeScript.** Confirmado. |
| D4 | Alojamiento | **Servidor Hetzner ya existente de Pablo**, con Docker Compose (API, PostgreSQL, Redis si las colas lo requieren) y **Caddy como reverse proxy con HTTPS automático**. Instancia única de uso personal, empaquetada para ser portable. |
| D5 | Multiusuario | **Multiusuario desde el modelo de datos**, aunque en el lanzamiento solo hay un usuario activo. La colaboración (compartir listas con permisos read/comment/write, p. ej. una lista compartida con su pareja) sigue en el roadmap (sección 9.18). |
| D6 | Prioridad de módulos | Ver sección 19. Cambios clave: **hábitos (con recordatorios) y servidor MCP + PATs con scopes entran en el MVP; Pomodoro pasa a V2; se elimina el importador TickTick del MVP** (arranque desde cero). |
| D7 | Nombre y dominio | **`todo.reflexionia.com`** para app, API, feeds iCal, email-to-task y emails transaccionales. |


---

## 3. Principios de diseño

1. **API-first**: toda funcionalidad de la UI pasa por la misma API pública que se documenta y versiona (sección 10). Nada de endpoints privados "solo para la app".
2. **Todo emite eventos**: cada cambio de estado relevante genera un evento de dominio (sección 11) que alimenta webhooks, automatizaciones y la sincronización.
3. **Offline-first en el cliente**: la app funciona sin red y sincroniza al volver (sección 13). TickTick lo hace; es parte de la experiencia.
4. **Formatos estándar antes que inventados**: recurrencias en RRULE (RFC 5545), recordatorios como triggers estilo iCalendar, exportación iCal/CSV/JSON, Markdown para texto enriquecido.
5. **Extensibilidad como contrato**: los puntos de extensión (sección 12) son parte del producto, con versionado y deprecación anunciada.
6. **Un solo usuario primero, cero atajos de modelo**: no se sacrifica integridad del modelo de datos por ir rápido (ver D5).

---

## 4. Arquitectura general propuesta

```
┌─────────────────────────────────────────────────────────────┐
│ Clientes: Web PWA (React, móvil + escritorio) · bot Telegram │
│ · agentes MCP · futuro cliente nativo (móvil/escritorio)     │
└──────────────▲──────────────────────────────────────────────┘
               │ HTTPS (Caddy, TLS automático) / WebSocket (sync en vivo)
┌──────────────┴──────────────────────────────────────────────┐
│ API REST v1 (NestJS) + servidor MCP                          │
│  - Auth (OAuth2 + Personal Access Tokens + sesiones)         │
│  - Validación, rate limiting, versionado                     │
├──────────────────────────────────────────────────────────────┤
│ Servicios de dominio (módulos)                               │
│  tasks · lists · tags · filters · habits · focus · notes ·   │
│  calendar · reminders · search · import/export · collab      │
├──────────────────────────────────────────────────────────────┤
│ Event Bus (cola interna: BullMQ/Redis o NATS)                │
│  - webhooks dispatcher · automation engine · sync feed       │
├──────────────────────────────────────────────────────────────┤
│ Scheduler (recordatorios, recurrencias, daily reminder)      │
├──────────────────────────────────────────────────────────────┤
│ PostgreSQL (datos) · Redis (colas, caché) · S3/local (files) │
│ Meilisearch o Postgres FTS (búsqueda)                        │
└──────────────────────────────────────────────────────────────┘
```

Reglas arquitectónicas:

- Los módulos de dominio no se llaman entre sí directamente: publican/consumen eventos.
- El scheduler es el único componente autorizado a materializar ocurrencias de tareas recurrentes y a disparar recordatorios.
- El dispatcher de webhooks y el motor de automatizaciones consumen del mismo bus: un evento existe una vez y se reparte.
- Los plugins de servidor (V2) se ejecutan en proceso aislado (worker con permisos declarados), nunca en el proceso principal.

Despliegue (D4): instancia única en el servidor Hetzner de Pablo con Docker Compose: servicios `caddy` (reverse proxy con HTTPS automático para `todo.reflexionia.com`), `api` (NestJS; incluye el servidor MCP), `postgres` y `redis` (colas y caché; se añade solo si el bus de eventos y el scheduler lo requieren). Adjuntos en volumen local (S3 externo opcional). Backups diarios fuera de la máquina (RF-1704).

---

## 5. Modelo de datos

Todos los IDs son `uuid` (o ULID si se prefiere ordenación). Todas las entidades tienen `created_at`, `updated_at` y `deleted_at` (soft delete) salvo que se indique. Las fechas-hora se almacenan en UTC más la zona horaria original del usuario (ver 9.6).

### 5.1 Task (tarea)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | |
| project_id | fk → Project | lista contenedora; la "bandeja de entrada" es un Project de sistema |
| parent_id | fk → Task, nullable | subtarea de primer nivel como tarea completa (además del checklist, ver 9.2) |
| title | text | requerido, máx. 500 chars |
| content | text | descripción larga en Markdown |
| kind | enum: `task`, `note` | TickTick permite notas dentro de listas (`kind: NOTE`) |
| status | enum: `active`, `completed`, `archived` | equivalente a `status` 0/2 de la API de TickTick |
| priority | enum: `none`, `low`, `medium`, `high` | mapeo con TickTick: 0/1/3/5 |
| is_all_day | bool | |
| start_date | timestamptz, nullable | |
| due_date | timestamptz, nullable | |
| time_zone | text (IANA) | zona en la que el usuario introdujo las fechas |
| duration_minutes | int, nullable | para Timeline y time-blocking; si hay start+due se deriva |
| repeat_rule | text (RRULE), nullable | p. ej. `RRULE:FREQ=DAILY;INTERVAL=1` |
| repeat_from | enum: `due_date`, `completion_date` | "repetir desde la fecha de completado" de TickTick |
| sort_order | bigint | orden manual dentro de la lista |
| tags | m2m → Tag | |
| assignee_id | fk → User, nullable | (V2 colaboración) |
| created_by | fk → User | |
| completed_at | timestamptz, nullable | |
| source | enum: `manual`, `import`, `api`, `automation`, `plugin` | trazabilidad |
| metadata | jsonb | espacio libre para plugins/integraciones |

Índices: `(project_id, status, sort_order)`, `(due_date) where status='active'`, GIN sobre `tags`, FTS sobre `title + content`.

### 5.2 ChecklistItem (ítem de checklist dentro de una tarea)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | |
| task_id | fk → Task | |
| title | text | |
| status | enum: `active`, `completed` | API TickTick: 0/1 |
| sort_order | bigint | |
| start_date / due_date | timestamptz, nullable | TickTick permite fecha por ítem |
| is_all_day | bool | |
| time_zone | text | |
| completed_at | timestamptz | |

### 5.3 Project (lista)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | |
| name | text | |
| color | text (hex) | p. ej. `#F18181` |
| folder_id | fk → Folder, nullable | agrupación de listas (TickTick: carpetas / `groupId`) |
| view_mode | enum: `list`, `kanban`, `timeline` | igual que TickTick |
| kind | enum: `TASK`, `NOTE` | listas de tareas o de notas |
| closed | bool | lista archivada |
| is_inbox | bool | bandeja de entrada del sistema (una por usuario) |
| sort_order | bigint | |
| permission | derivado | `read`, `write`, `comment` en compartidas (V2) |

### 5.4 Folder (carpeta de listas)

`id`, `name`, `sort_order`, `owner_id`.

### 5.5 Column (columna Kanban / sección)

`id`, `project_id`, `name`, `sort_order`. Las tareas llevan además `column_id` nullable. En vista lista, las Column se muestran como secciones; en Kanban, como columnas. Replicar que TickTick muestra en Kanban la agrupación elegida y el progreso por columna.

### 5.6 Tag (etiqueta)

`id`, `name` (única por usuario, case-insensitive), `color`, `parent_id` nullable (etiquetas anidadas como en TickTick), `sort_order`.

### 5.7 SmartList y Filter

Listas inteligentes de sistema (una por usuario, no borrables, activables/desactivables en la barra lateral): **Today, Tomorrow, Next 7 Days, All, Inbox, Assigned to me, Completed, Trash**. TickTick además tiene "No date" y "Recently added"; incluirlas.

Filter (filtro personalizado del usuario):

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | |
| name | text | |
| icon/color | text | |
| mode | enum: `normal`, `advanced` | TickTick tiene ambos |
| rules | jsonb | ver gramática abajo |
| sort_order | bigint | |

Gramática de `rules` (persistida, portable por API):

```json
{
  "combinator": "AND" | "OR",
  "groups": [
    {
      "combinator": "AND",
      "conditions": [
        {"field": "list", "op": "in", "value": ["<projectId>"]},
        {"field": "tag", "op": "any_of", "value": ["casa"]},
        {"field": "date", "op": "today" | "tomorrow" | "next_7_days" | "overdue" | "no_date" | "between", "value": ["2026-10-17","2026-10-24"]},
        {"field": "priority", "op": "gte", "value": "medium"},
        {"field": "keyword", "op": "contains", "value": "leer"}
      ]
    }
  ]
}
```

Campos filtrables mínimos: lista, etiqueta, fecha (hoy/mañana/próximos 7 días/vencidas/sin fecha/rango), prioridad, palabra clave en título/contenido, estado (activa/completada), asignado (V2). El filtro avanzado de TickTick permite múltiples cláusulas con AND/OR y vista previa: replicar con un endpoint `POST /filters/preview` (ver 10).

### 5.8 Reminder (recordatorio)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | |
| task_id | fk → Task | |
| trigger | text | formato iCalendar: `TRIGGER:PT0S`, `TRIGGER:P0DT9H0M0S` (offset relativo a due/start), o absoluto `at` |
| absolute_at | timestamptz, nullable | recordatorio en hora fija |
| type | enum: `relative`, `absolute`, `location`, `daily_digest` | |
| location | jsonb, nullable | `{lat, lon, radius_m, label}` (recordatorio por ubicación) |
| channel | enum: `push`, `email`, `both` | TickTick tiene recordatorio por email |
| constant | bool | "recordatorio constante": renotifica hasta completar |
| snoozed_until | timestamptz | |

### 5.9 Habit y HabitLog

Habit: `id`, `name`, `icon`, `color`, `goal` (jsonb: `{times_per_period, period: day|week, target_count}` p. ej. beber agua 8 vasos/día), `frequency` (qué días), `reminder_time`, `motivation_note`, `archived`, `sort_order`.

HabitLog: `id`, `habit_id`, `date`, `count` (check-ins del día), `note`. Único por `(habit_id, date)`.

Estadísticas derivadas: racha actual, mejor racha, % de cumplimiento por semana/mes, mapa de calor anual. TickTick muestra estadísticas detalladas por hábito; replicar.

### 5.10 FocusSession (Pomodoro / Focus)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | |
| task_id | fk → Task, nullable | asociar sesión a una tarea (TickTick lo permite) |
| type | enum: `focus`, `short_break`, `long_break` | |
| planned_minutes | int | |
| actual_seconds | int | |
| started_at / ended_at | timestamptz | |
| completed | bool | terminó vs. abandonado |
| ambient_sound | text, nullable | white noise usado |
| interrupted_count | int | |

Configuración por usuario (`FocusSettings`): duración pomodoro (default 25), descanso corto (5), descanso largo (15-30), pomodoros antes de descanso largo (4), auto-inicio de descansos/pomodoros, sonidos ambientales disponibles, "modo estricto" (no pausar).

### 5.11 Note / StickyNote

Note reusa `Task` con `kind='note'` (como TickTick, que tiene listas de tipo NOTE). StickyNote (nota adhesiva de escritorio/widget): `id`, `text`, `color`, `pinned_task_id` nullable, `position` jsonb. MVP-lite: puede aplazarse a V1 sin daño.

### 5.12 CalendarSubscription y ExternalEvent

CalendarSubscription: `id`, `url` (iCal) o `provider` (`google`), `sync_direction` (`read` | `two_way` V2), `color`, `last_synced_at`. ExternalEvent: eventos importados de solo lectura que se muestran junto a las tareas en las vistas de calendario.

### 5.13 Attachment

`id`, `task_id`, `file_name`, `mime_type`, `byte_size`, `storage_key`, `uploaded_by`. Límite por archivo configurable (default 25 MB).

### 5.14 Comment y ActivityLog (V2 colaboración; ActivityLog desde MVP)

ActivityLog: `id`, `actor_id`, `entity_type`, `entity_id`, `action` (created/updated/completed/deleted/assigned/commented), `changes` jsonb, `created_at`. Alimenta el historial de actividad de listas compartidas y es la base del feed de eventos (sección 11).

### 5.15 Countdown

`id`, `title`, `target_date`, `color`, `show_in_sidebar`. Cuenta atrás para fechas importantes (TickTick lo tiene como mini-función).

### 5.16 Template (plantilla de lista/tarea)

`id`, `name`, `payload` jsonb (lista con sus tareas/columnas), `owner_id`. TickTick no lo tiene: es una extensión propia barata y útil.

### 5.17 User y Settings

User: `id`, `email`, `password_hash` o SSO, `display_name`, `avatar`, `time_zone`, `locale` (`es` default), `week_start` (`monday` default), `date_format`, `theme` (light/dark/auto), `nlp_language`, `daily_reminder_time`, settings de Focus (5.10), settings del reporte semanal (9.22: día/hora, canales, tono), `achievement_score` (gamificación, V2).

### 5.18 DashboardLayout

`id`, `user_id`, `name`, `widgets` jsonb (lista de `{widget_key, position, size, config}`), `is_default`. Permite varias vistas del dashboard por usuario (p. ej. "hoy", "semana").

### 5.19 WeeklyReport

`id`, `user_id`, `week_start`, `payload` jsonb (KPIs y texto generado), `tone`, `delivered_channels`, `sent_at`. Histórico consultable en la app y por API.

---

## 6. Reglas transversales del modelo

1. **Completar tarea recurrente**: al completar, se crea la siguiente ocurrencia según `repeat_rule` y `repeat_from` (`due_date`: siguiente fecha teórica; `completion_date`: siguiente fecha contando desde hoy). Las subtareas/checklist vuelven a estado activo en la nueva ocurrencia. La completada queda registrada para estadísticas.
2. **Borrado**: papelera (soft delete) durante 30 días, purga automática después. Las listas borradas llevan sus tareas a la papelera con ellas.
3. **Completadas**: ocultas por defecto en vistas, accesibles vía lista inteligente "Completed" y por API. TickTick conserva el conteo para estadísticas; igual.
4. **Ordenación manual**: `sort_order` con espaciado (incrementos de 65536) para reordenar en O(1) escrituras.
5. **Zonas horarias**: almacenar UTC + `time_zone` de captura; una tarea "a las 9:00 en Madrid" sigue siendo a las 9:00 locales aunque el usuario viaje (comportamiento TickTick).

---

## 7. Navegación y estructura de la app

Layout de tres paneles (como TickTick en escritorio; en móvil, navegación con barra inferior y gestos):

1. **Barra lateral**: Inbox y smart lists activas arriba; filtros fijados; carpetas con sus listas; etiquetas; papelera. Todo reordenable por arrastre, con contadores opcionales.
2. **Panel central**: la vista activa (lista / kanban / timeline / calendario / Eisenhower / hábitos / focus) con su cabecera de ordenación, agrupación y búsqueda contextual.
3. **Panel de detalle**: tarea o nota seleccionada (título, fechas, prioridad, etiquetas, checklist, subtareas, contenido Markdown, adjuntos, recordatorios, historial de actividad, comentarios en V2).

Rutas limpias y compartibles: `/list/{id}`, `/filter/{id}`, `/today`, `/calendar/{view}`, `/habits`, `/focus`, `/dashboard`, `/reports/weekly/{semana}`, `/task/{id}` (abre la lista contenedora con el detalle). La URL refleja siempre el estado de navegación: un enlace pegado en otro dispositivo abre exactamente lo mismo.

---

## 8. Paridad y mejoras respecto a TickTick

| Función | TickTick | Este producto |
|---|---|---|
| Tareas, listas, carpetas, secciones, etiquetas anidadas, prioridades, checklist | Sí | Paridad total |
| Filtros (normal y avanzado con AND/OR) y smart lists | Sí | Paridad + evaluación por API |
| Recurrencias RRULE, "repetir desde completado" | Sí | Paridad + ocurrencias teóricas por API |
| Recordatorios (múltiples, constante, email, ubicación, daily) | Sí (ubicación solo iOS) | Paridad multiplataforma donde el cliente lo permita |
| Vistas lista/kanban/timeline, calendario, Eisenhower | Sí | Paridad |
| Pomodoro con estadísticas y white noise | Sí | Paridad + sesiones y stats por API |
| Hábitos con estadísticas | Sí | Paridad + check-ins por API |
| Notas y sticky notes | Sí | Paridad |
| Suscripción iCal / Google Calendar | Sí (parcial de pago) | Gratis + feeds iCal propios por lista/filtro |
| Colaboración | Sí | V2, con mismos permisos read/comment/write |
| Open API | Muy limitada (tasks/projects, 2 scopes) | **API completa del dominio + servidor MCP + compatibilidad `/open/v1`** |
| Webhooks | No | **Sí, catálogo completo con firma y reintentos** |
| Automatizaciones internas | No | **Sí, motor trigger-condición-acción** |
| Plugins | No | **Sí (V2): comandos, NLP, vistas, acciones** |
| Exportación completa | Parcial | **JSON completo versionado + CSV + iCal + backup diario** |
| Plantillas de lista/tarea, WIP limits, `estimated_pomodoros` | No | Sí (extensiones propias) |
| Dashboard de KPIs configurable y reporte semanal honesto | No | Sí (extensiones propias, secciones 9.21 y 9.22) |

---

## 9. Funcionalidad detallada por módulo

Cada módulo indica fase sugerida y requisitos RF numerados. La UI debe cumplir la paridad descrita; la API debe exponer lo mismo (sección 10).

### 9.1 Captura rápida (Quick Add) y entrada de tareas — MVP

Prioridad máxima de Pablo (17 oct 2026): capturar tiene que costar un segundo desde cualquier sitio (app, voz, Telegram, atajo o share target del móvil). Si capturar cuesta, la app no se usa.

TickTick pone mucho peso en capturar sin fricción: atajo global, widget, voz, email, NLP. Replicar:

- RF-101: Crear tarea con título en una sola pulsación desde cualquier vista (atajo `N` y botón flotante).
- RF-102: **Parseo de lenguaje natural (NLP)** en el título, en español e inglés: detecta y extrae fecha/hora ("mañana 18:00", "cada lunes", "el 23/10"), prioridad (`!alta`, `!media`, `!baja` o p1-p3), etiquetas (`#casa`), lista (`^trabajo` o `~trabajo`) y recordatorio ("avísame 30 min antes"). Lo detectado se muestra resaltado antes de confirmar y es editable.
- RF-103: Gramática NLP extensible por plugins (sección 12): un plugin puede registrar patrones adicionales.
- RF-104: Entrada por voz (Web Speech API en PWA; nativo en apps futuras) que vuelca texto al mismo pipeline NLP.
- RF-105: **Email-to-task**: dirección única por usuario (`<token>@in.todo.reflexionia.com`); el asunto pasa a título y el cuerpo a contenido; adjuntos se guardan como Attachment. (TickTick lo tiene; además es nuestro primer canal de "integración externa".)
- RF-106: Atajo global de escritorio cuando exista cliente de escritorio (V2); en PWA, `share target` para "compartir a la app" desde móvil.
- RF-107: Si el título se deja vacío no se crea nada. Si la lista destino no existe (por `^lista`), se crea en Inbox y se avisa.

### 9.2 Tareas — MVP

- RF-201: CRUD completo de tareas con todos los campos de 5.1.
- RF-202: Descripción en **Markdown** con previsualización, checklist inline `- [ ]` que se convierte en ChecklistItem (comportamiento TickTick: las líneas de checklist del contenido pueden convertirse en subtareas).
- RF-203: Adjuntos múltiples por tarea (imágenes con miniatura inline).
- RF-204: Duplicar, mover entre listas, mover entre columnas/secciones, convertir tarea en nota y viceversa.
- RF-205: Dos tipos de "hijos": (a) **checklist items** (ligeros, 5.2) y (b) **subtareas completas** (Task con `parent_id`, con sus propias fechas/etiquetas/recordatorios). TickTick permite ambos. UI: pestañas o secciones dentro del detalle. Regla: un Task con `parent_id` hereda `project_id` del padre y no aparece suelto en la lista salvo vista plana.
- RF-206: Al completar un padre con hijos activos, preguntar: completar hijos también / dejarlos. Configurable.
- RF-207: Indicador de progreso del checklist (x/y) en la tarjeta de la tarea.
- RF-208: Operaciones masivas: selección múltiple → completar, mover, etiquetar, priorizar, fijar fecha, borrar.
- RF-209: Historial de cambios por tarea (ActivityLog) visible en el detalle.
- RF-210: Deshacer (undo) de completar/borrar durante 10 s vía toast; borrado real pasa por papelera (regla 2, sección 6).

### 9.3 Listas, carpetas y secciones — MVP

- RF-301: CRUD de listas con nombre, color, emoji/icono, vista por defecto (lista/kanban/timeline), orden manual, archivar (`closed`).
- RF-302: Carpetas que agrupan listas, plegables, con orden manual. Una lista puede no tener carpeta.
- RF-303: Inbox como lista de sistema por usuario: destino por defecto de captura rápida y email-to-task.
- RF-304: Secciones (Column) dentro de una lista: renombrar, reordenar, colapsar; mover tareas entre secciones. En vista lista se ven como cabeceras; en Kanban como columnas.
- RF-305: Contador de tareas activas por lista en la barra lateral (opcional en settings).
- RF-306: Vaciar papelera / archivar todas las completadas de una lista en una acción.

### 9.4 Etiquetas — MVP

- RF-401: CRUD de etiquetas con color y anidación (padre/hija). Filtrar por padre incluye hijas (configurable por filtro).
- RF-402: Asignación múltiple por tarea; autocompletado al teclear `#`.
- RF-403: Panel de etiquetas en barra lateral con contador y renombrado en cascada seguro (renombrar no rompe filtros: los filtros referencian por ID, no por nombre).

### 9.5 Prioridades — MVP

- RF-501: Cuatro niveles: High / Medium / Low / None (equivalentes a 5/3/1/0 de la API de TickTick).
- RF-502: Indicador visual (bandera/color) en tarjeta; ordenación por prioridad en cualquier vista.
- RF-503: Mapeo exacto en importación/exportación TickTick (0↔none, 1↔low, 3↔medium, 5↔high).

### 9.6 Fechas, duración y zonas horarias — MVP

- RF-601: Tarea con fecha de vencimiento (`due_date`), fecha de inicio (`start_date`) o rango (ambas). Tarea de día completo (`is_all_day`) o con hora.
- RF-602: Duración editable; la vista Timeline la usa para el largo del bloque.
- RF-603: Vencidas: destacadas en rojo, agrupadas arriba en Today, incluidas en filtro "overdue".
- RF-604: Regla de zona horaria de la sección 6.5; al cambiar la zona del usuario en ajustes, no se reescriben tareas.
- RF-605: "Aplazar a mañana / la semana que viene / fecha concreta" en un clic (snooze de fecha, no de recordatorio).

### 9.7 Recurrencias — MVP

- RF-701: Reglas RRULE completas: diaria, semanal (días concretos), mensual (día del mes o "primer lunes"), anual, intervalos personalizados (`INTERVAL=n`), fin por fecha (`UNTIL`) o por número de ocurrencias (`COUNT`).
- RF-702: UI de construcción de regla en español, sin exponer RRULE crudo salvo modo avanzado.
- RF-703: `repeat_from`: "desde la fecha de vencimiento" (default) o "desde la fecha de completado" (comportamiento TickTick para hábitos tipo "regar cada 3 días desde que lo hice").
- RF-704: Solo se materializa la ocurrencia actual; al completarla se genera la siguiente (evita explosión de filas y respeta ediciones futuras). La API expone `GET /tasks/{id}/occurrences?from&to` que calcula ocurrencias teóricas sin persistirlas.
- RF-705: Editar una ocurrencia concreta sin romper la serie: la ocurrencia editada se desvincula (`exdate` en la regla).
- RF-706: Casos límite: 29-31 de febrero en mensual/anual (usar último día del mes), cambio de horario de verano (recalcular en la zona de captura), completar con retraso (la siguiente ocurrencia no se salta: se calcula desde la regla, no desde "hoy", salvo `completion_date`).

### 9.8 Recordatorios — MVP

- RF-801: Múltiples recordatorios por tarea, relativos (5 min antes, 1 día antes...) o absolutos (fecha/hora concreta). Persistencia en formato trigger iCalendar como la API de TickTick (`TRIGGER:P0DT9H0M0S`).
- RF-802: Canales: push (Web Push en PWA) y email. Configurable por tarea y por defecto en ajustes.
- RF-803: Recordatorio constante (opcional por tarea): renotifica cada X min hasta completar o posponer.
- RF-804: Snooze de notificación: 10 min, 1 h, mañana, personalizado.
- RF-805: Daily reminder: resumen diario a hora configurable ("planifica tu día").
- RF-806: Recordatorio por ubicación (geofence) en clientes con GPS (móvil, V1+; en TickTick es solo iOS). Modelo ya previsto en 5.8.
- RF-807: Recordatorios de tareas recurrentes se heredan a cada ocurrencia.
- RF-808: Fiabilidad: el scheduler materializa recordatorios con al menos 48 h de antelación en una cola persistente; si el servicio cae, al arrancar reprograma lo perdido (catch-up) y marca como "late" lo ya vencido.

### 9.9 Listas inteligentes y filtros — MVP

- RF-901: Smart lists de sistema (5.7) activables/ordenables en la barra lateral.
- RF-902: Filtros personalizados en modo normal (campos simples) y avanzado (grupos AND/OR anidados un nivel, como TickTick) con **vista previa** antes de guardar.
- RF-903: Un filtro es una vista de primera clase: aparece en la barra lateral, tiene contador, soporta vistas lista/kanban/timeline y se puede fijar.
- RF-904: Evaluación de filtros en backend (los filtros funcionan igual por API y por todos los clientes). Nada de lógica duplicada en cliente.

### 9.10 Vistas de tareas — MVP/V1

- RF-1001 (MVP): **Vista lista**: agrupación por sección/fecha/etiqueta/prioridad; ordenación manual y automática (fecha, prioridad, título, creación); detalle en tercer panel como TickTick en escritorio.
- RF-1002 (V1): **Vista Kanban**: columnas = Column de la lista; agrupación alternativa por etiqueta/prioridad/asignado; drag & drop entre columnas actualiza `column_id`; contador y progreso por columna; WIP limit opcional por columna (extensión propia, barata).
- RF-1003 (V1): **Vista Timeline** (como la de TickTick, más ligera que un Gantt): tareas con fecha como bloques horizontales día/semana/mes; arrastrar para mover en el tiempo; arrastrar bordes para cambiar duración; tareas sin fecha en panel lateral "por planificar"; clic en hueco crea tarea con esa fecha; zoom día/semana/mes. Sin dependencias entre tareas.
- RF-1004 (V1): **Matriz de Eisenhower**: cuadrantes urgente/importante con reglas por defecto (urgente = vence en 24 h o vencida; importante = prioridad high/medium) y reglas editables por el usuario (misma gramática de filtros, 5.7); drag & drop entre cuadrantes actualiza prioridad/fecha según la regla del cuadrante destino.

### 9.11 Calendario — V1

- RF-1101: Vistas: día, semana, multi-día, multi-semana, mes, año y agenda. TickTick ofrece exactamente este conjunto.
- RF-1102: Las tareas con fecha aparecen en el calendario (all-day arriba, con hora en su franja); drag & drop re-planifica; clic crea tarea con fecha.
- RF-1103: Suscripción a calendarios externos por URL iCal (solo lectura) y cuenta de Google Calendar (lectura; escritura en V2). Los eventos externos se muestran con su color y no son editables.
- RF-1104: Feed iCal propio por lista/filtro: URL secreta regenerable para ver tareas en Google Calendar/Apple Calendar (TickTick tiene suscripción premium; aquí es gratis porque es nuestro).
- RF-1105: Los recordatorios de tareas siguen siendo los del módulo 9.8 aunque la tarea se mueva en calendario.

### 9.12 Pomodoro / Focus — V2

- RF-1201: Temporizador Pomodoro con fases focus → descanso corto → ciclo → descanso largo (config por 5.10).
- RF-1202: Asociar la sesión a una tarea: acumula tiempo de focus y cuenta de pomodoros en la tarea; estimación opcional de pomodoros por tarea (campo `estimated_pomodoros`, extensión propia).
- RF-1203: Sonidos ambientales / white noise durante el focus (catálogo local ampliable por plugin).
- RF-1204: Estadísticas: focus por día/semana/mes, distribución por lista/etiqueta, rachas de días con focus, mejor franja horaria. TickTick muestra estadísticas de pomodoro; replicar y mejorar con exportación CSV.
- RF-1205: La sesión corre en servidor (o al menos se persiste start/end): si se cierra la app, el temporizador sigue y la notificación de fin llega por push. Decisión de diseño importante para PWA.
- RF-1206: Mini-ventana flotante siempre visible (picture-in-picture en PWA si es viable; si no, badge en el título de la pestaña con la cuenta atrás).

### 9.13 Hábitos — MVP

Decisión de Pablo (sección 21): los hábitos entran en fase 1 con sus recordatorios, y deben ser fáciles de adoptar y configurar: alta de un hábito en menos de un minuto, sugerencias de hábitos comunes como punto de partida y recordatorio diario opcional.

- RF-1301: CRUD de hábitos con objetivo (veces por día/semana), días activos, icono/color, recordatorio diario a hora fija.
- RF-1302: Check-in con contador (p. ej. 8 vasos de agua) y nota opcional por día.
- RF-1303: Estadísticas: racha actual/mejor, % cumplimiento, mapa de calor anual por hábito y agregado.
- RF-1304: Los hábitos **no** son tareas: entidad separada (como TickTick), aunque un hábito puede generar recordatorio. Razón: semántica distinta (no se "completan para siempre").
- RF-1305: Los check-ins se exponen por API y emiten eventos (permite automatizaciones tipo "si fallo 3 días, créame una tarea de revisión").

### 9.14 Notas y sticky notes — V1

- RF-1401: Listas de tipo NOTE con notas en Markdown, adjuntos, etiquetas compartidas con tareas.
- RF-1402: Conversión nota ↔ tarea.
- RF-1403: Sticky notes: notas rápidas fijables (widget/escritorio) o vinculadas a una tarea. V1 tardía.

### 9.15 Búsqueda global — MVP

- RF-1501: Búsqueda instantánea sobre título, contenido, checklist, notas y nombres de lista/etiqueta, con filtros inline (`in:lista`, `#tag`, `priority:high`, `done:true`).
- RF-1502: Resultados agrupados por tipo; atajo `/` o `Ctrl/Cmd+K` con paleta de comandos (buscar + acciones: "crear tarea", "ir a lista", "cambiar tema"...).

### 9.16 Estadísticas y logros — V2

- RF-1601: Panel de productividad: completadas por periodo, focus acumulado, hábitos, tareas creadas vs completadas.
- RF-1602: Puntuación de logros estilo TickTick (niveles por consistencia). Opcional y desactivable.

### 9.17 Exportación y backup — MVP; importación aplazada

- RF-1701 (APLAZADO, fuera del MVP: Pablo arranca desde cero, sin migración; la especificación se conserva por si se retoma más adelante): **Importador TickTick** vía su Open API: proyectos (con color, carpeta, viewMode), tareas (prioridad, fechas, RRULE, recordatorios, checklist, contenido, completadas recientes) y tags. Mapeos: `project → Project`, `column → Column`, `priority 0/1/3/5 → none/low/medium/high`, `repeatFlag → repeat_rule`, `items → ChecklistItem`, `kind NOTE → lista de notas`. Limitación documentada: la Open API de TickTick no expone hábitos, pomodoros ni filtros; el importador lo advierte y sugiere recrearlos (o export manual).
- RF-1702: Importador CSV genérico con mapeo de columnas.
- RF-1703: Exportación completa JSON (todo el estado del usuario, versionada por esquema) + CSV por lista + iCal por lista/filtro.
- RF-1704: Backup automático diario de PostgreSQL (`pg_dump`) más los adjuntos, **copiado fuera de la máquina** (por defecto a Google Drive cuando exista RF-2005; antes, a cualquier almacenamiento externo configurado), con retención de 30 días configurable, restauración desde archivo y **prueba de restauración automática semanal** (restaura el último backup en un contenedor temporal y verifica su integridad; alerta si falla). Es el sistema de tareas de Pablo: perderlo no es una opción.
- RF-1705: El export JSON es el formato de referencia para migraciones futuras: versionado `schema_version` y script de migración por versión.

### 9.18 Colaboración — V2

- RF-1801: Compartir lista con permisos `read`, `comment`, `write` (los tres niveles de TickTick).
- RF-1802: Asignar tareas a miembros; vista "Assigned to me".
- RF-1803: Comentarios por tarea con menciones; ActivityLog visible por lista compartida.
- RF-1804: Presencia ligera (quién está viendo la lista) opcional.
- RF-1805: Todo lo anterior funciona por API y emite eventos (un agente externo puede ser "miembro" de una lista).

### 9.19 Widgets, atajos y personalización — V1/V2

- RF-1901: Widgets de lista/hoy/hábitos/pomodoro en móvil cuando exista app nativa; en PWA, accesos directos de icono de app y share target.
- RF-1902: Atajos de teclado completos y hoja de ayuda (`?`): navegación, crear, completar (`space`), mover fecha, cambiar prioridad. Menú de comandos (9.15).
- RF-1903: Temas claro/oscuro/auto y densidad de lista; color de acento.

### 9.20 Integraciones y agentes externos — MVP (MCP + PAT), V1 (resto)

Decisión de Pablo (sección 21): los agentes personales (ChatGPT, Cursor, Instinct y otros) deben poder conectarse fácilmente para leer y escribir. Esto convierte el acceso para agentes en requisito de fase 1, no una mejora posterior. Prioridad de integraciones: **1) MCP + API REST/PAT (MVP) · 2) Telegram · 3) Google Calendar · 4) Google Drive**.

- RF-2001 (MVP): **Servidor MCP (Model Context Protocol)** que expone las operaciones del dominio (tareas, listas, etiquetas, filtros, hábitos, búsqueda, notas) como tools/resources sobre la misma API v1, de modo que cualquier agente compatible con MCP pueda consultar y modificar el estado. Autenticación con PAT u OAuth2 (10.1) y los mismos scopes granulares: el servidor MCP nunca tiene más privilegios que el token usado.
- RF-2002 (MVP): **API REST v1 + Personal Access Tokens con scopes granulares** (10.1) como vía universal de lectura/escritura para scripts y agentes, con la documentación OpenAPI publicada para que un agente pueda descubrir la API por sí mismo.
- RF-2003 (V1, primera integración prioritaria): **bot de Telegram**: crear tareas enviando texto (mismo pipeline NLP del quick add), voz (transcripción → NLP) o foto (adjunto); consultar ("¿qué tengo hoy?", "¿qué hay en la lista compra?"); completar tareas con botones; opción de recibir recordatorios por Telegram como canal adicional de notificación.
- RF-2004 (V1): **Google Calendar** (RF-1103): lectura en V1; escritura two-way en V2.
- RF-2005 (V1): **Google Drive**: adjuntar archivos de Drive a tareas (enlace o copia al almacenamiento propio) y opción de volcar el backup diario (RF-1704) a Drive.
- RF-2006: Todas las integraciones externas se implementan como consumidores de la API y los eventos existentes (secciones 10 y 11), nunca como código especial con acceso directo a la base de datos.

### 9.21 Dashboard («jardín digital») — V1

Requisito de Pablo (17 oct 2026): una vista que permita ver todo su jardín digital de un vistazo, con KPIs y cuadro de mando.

- RF-2101: Vista `/dashboard` como cuadro de mando personal: una parrilla de widgets con KPIs calculados en backend, pensada para consulta rápida diaria en móvil y escritorio.
- RF-2102: Catálogo inicial de widgets: tareas completadas hoy/semana y tendencia; vencidas y próximas 7 días; creadas vs completadas (flujo neto); racha y cumplimiento de hábitos con mapa de calor; carga por lista/etiqueta; próximos eventos de calendario (incluye suscripciones externas); contadores de las integraciones conectadas (actividad vía MCP/Telegram, adjuntos de Drive); tiempo de foco cuando exista el Pomodoro (V2).
- RF-2103: Layout configurable sin código: añadir, quitar, reordenar y redimensionar widgets (grid con drag & drop), guardado por usuario (5.18) con varias vistas opcionales.
- RF-2104: Todo widget consume la API pública: `GET /api/v1/dashboard/widgets` (catálogo), `GET /api/v1/dashboard/data?widget=...&period=...` (datos), `GET/PATCH /api/v1/me/dashboard` (layout). Los agentes externos leen los mismos KPIs por MCP/REST.
- RF-2105: KPIs extensibles: nuevas integraciones y plugins (V2) pueden registrar widgets propios con su esquema de datos.
- Puntos abiertos (default propuesto, Pablo puede cambiarlo): el alcance inicial cubre los datos de la propia app (tareas, hábitos, calendario) más contadores de las integraciones ya conectadas; las fuentes externas del «jardín digital» (otras apps) se añaden como widgets de integración cuando exista cada conector.

### 9.22 Reporte semanal honesto — V1

Requisito de Pablo (17 oct 2026): recibir cada semana un resumen sincero de cómo lo ha hecho, en base a su actividad real.

- RF-2201: Informe semanal automático con tono **honesto, no adulador**: si la semana fue floja, lo dice con datos y sin suavizarlo; si fue buena, lo reconoce. Contenido mínimo: tareas completadas vs creadas, vencidas arrastradas, cumplimiento de hábitos (% y rachas rotas), comparativa con la semana anterior y 1-3 observaciones accionables. Añade tiempo de foco cuando exista el Pomodoro (V2).
- RF-2202: Configurable en ajustes: día y hora de envío (default: domingo 20:00, zona horaria del usuario), canales (Telegram cuando exista RF-2003, email, push), tono (`honesto` por defecto, `neutro`, `motivador`) y secciones incluidas.
- RF-2203: Implementado sobre el motor de automatizaciones (trigger cron semanal, 11.3) con una plantilla: el backend calcula los KPIs y redacta el informe con reglas deterministas sobre esos datos.
- RF-2204: Histórico de informes (5.19) consultable en la app (`/reports/weekly/{semana}`) y por API (`GET /api/v1/reports/weekly`), disponible también por MCP.

### 9.23 Revisión diaria y semanal asistida — V1

Recomendación aceptada por Pablo (17 oct 2026): que el sistema proponga, no solo liste.

- RF-2301: **Revisión diaria**: a la hora del daily reminder (o al abrir Today por primera vez en el día), el sistema propone una lista corta de «hoy» (3-7 tareas) priorizada por vencimiento, prioridad, hábitos del día y huecos en el calendario; el usuario la acepta, reordena o recorta con un gesto. La selección queda marcada en la vista Today.
- RF-2302: **Revisión semanal guiada**: recorrido opcional por tareas vencidas, sin fecha, listas estancadas (sin movimiento en X días) y hábitos en riesgo, con acciones rápidas (replanificar, mover a «algún día», borrar). Complementa el reporte semanal (9.22): el reporte mira atrás, la revisión prepara la semana.
- RF-2303: Las propuestas se calculan en backend con reglas transparentes (misma gramática de filtros, 5.7) y se exponen por API y MCP (`GET /api/v1/review/daily`, `GET /api/v1/review/weekly`), de modo que un agente personal pueda conducir la revisión también por Telegram.

---

## 10. API pública (diseño completo) — MVP para recursos núcleo

Principio rector: **la API cubre el 100% del dominio**, no el subconjunto que ofrece TickTick. La propia UI consume esta API.

### 10.1 Autenticación y autorización

- **Personal Access Tokens (PAT)** con scopes granulares, creados desde ajustes: vía rápida para scripts y agentes personales. **Un token por agente o script** (ChatGPT, Cursor, Instinct, etc.), con nombre propio, los scopes mínimos necesarios, revocación inmediata, último uso visible y registro en el ActivityLog de cada acción realizada con ese token (qué agente, qué hizo y cuándo).
- **OAuth2 Authorization Code + PKCE** para aplicaciones de terceros (pantalla de consentimiento con scopes explícitos).
- Sesiones de la propia UI con cookies httpOnly + CSRF.
- Scopes: `tasks:read`, `tasks:write`, `lists:read`, `lists:write`, `tags:read`, `tags:write`, `filters:read`, `filters:write`, `habits:read`, `habits:write`, `focus:read`, `focus:write`, `notes:read`, `notes:write`, `calendar:read`, `calendar:write`, `reminders:write`, `webhooks:manage`, `automations:manage`, `profile:read`, `backup:read`.
- Rate limiting por token: 1000 req/15 min default, cabeceras `X-RateLimit-*`, `429` con `Retry-After`.

### 10.2 Convenciones

- Base: `https://todo.reflexionia.com/api/v1`. Versionado en path. JSON en todo. Fechas ISO 8601 con offset (`2019-11-13T03:00:00+0000` aceptado por compatibilidad con el formato TickTick; `Z`/offset normal preferido).
- Paginación por cursor: `?limit=50&cursor=...`, respuesta con `next_cursor`. Filtros por query params (`?project_id=`, `?status=active`, `?due_before=`, `?tag=`).
- Idempotencia en POST con cabecera `Idempotency-Key` (evita tareas duplicadas por reintentos de red en offline).
- Errores: `{error: {code, message, details}}` con códigos estables (`task_not_found`, `validation_failed`, `scope_missing`...).
- ETag/If-None-Match en GETs de colección para clientes que cachean.
- `X-Request-Id` en todas las respuestas.
- Documentación OpenAPI 3.1 generada del código, publicada en `/api/docs`, con colección Postman exportada.

### 10.3 Endpoints (resumen por recurso)

Tareas:

```
GET    /api/v1/tasks                      listado con filtros (proyecto, fecha, tag, prioridad, estado, búsqueda)
POST   /api/v1/tasks                      crear (soporta `raw_text` con parseo NLP server-side)
GET    /api/v1/tasks/{id}
PATCH  /api/v1/tasks/{id}
DELETE /api/v1/tasks/{id}                 papelera
POST   /api/v1/tasks/{id}/complete
POST   /api/v1/tasks/{id}/uncomplete
POST   /api/v1/tasks/{id}/move            {project_id, column_id, before_task_id?}
POST   /api/v1/tasks/{id}/duplicate
GET    /api/v1/tasks/{id}/occurrences     ocurrencias teóricas de recurrente (?from&to)
POST   /api/v1/tasks/batch                operaciones masivas (complete/move/tag/delete)
GET    /api/v1/tasks/completed            historial de completadas (?from&to)
GET    /api/v1/tasks/trash                papelera
POST   /api/v1/tasks/trash/{id}/restore
```

Checklist items: `POST/PATCH/DELETE /api/v1/tasks/{id}/items[/{itemId}]`, `POST .../items/{itemId}/complete`.

Listas y estructura:

```
GET/POST         /api/v1/projects
GET/PATCH/DELETE /api/v1/projects/{id}
GET              /api/v1/projects/{id}/data        lista + tareas + columnas (equiv. TickTick /project/{id}/data)
POST             /api/v1/projects/{id}/archive | /unarchive
GET/POST         /api/v1/folders
GET/PATCH/DELETE /api/v1/folders/{id}
GET/POST/PATCH/DELETE /api/v1/projects/{id}/columns[/{columnId}]
```

Etiquetas: `GET/POST /api/v1/tags`, `GET/PATCH/DELETE /api/v1/tags/{id}`, `POST /api/v1/tags/merge`.

Filtros y smart lists:

```
GET/POST         /api/v1/filters
GET/PATCH/DELETE /api/v1/filters/{id}
POST             /api/v1/filters/preview     evalúa rules sin guardar, devuelve tareas que casan
GET              /api/v1/filters/{id}/tasks  evaluación persisted
GET              /api/v1/smart-lists         activar/ordenar smart lists de sistema
```

Recordatorios: `GET/POST/DELETE /api/v1/tasks/{id}/reminders[/{rid}]`.

Hábitos: `GET/POST /api/v1/habits`, `GET/PATCH/DELETE /api/v1/habits/{id}`, `POST /api/v1/habits/{id}/checkins` ({date, count, note}), `GET /api/v1/habits/{id}/stats`.

Focus: `POST /api/v1/focus/sessions` (start), `POST /api/v1/focus/sessions/{id}/finish | /abort`, `GET /api/v1/focus/sessions?from&to`, `GET /api/v1/focus/stats?period=`, `GET/PATCH /api/v1/focus/settings`.

Notas: mismas rutas de tasks con `kind=note` + `GET /api/v1/notes` atajo filtrado.

Calendario: `GET /api/v1/calendar/events?from&to` (tareas con fecha + eventos externos unificados), `GET/POST/DELETE /api/v1/calendar/subscriptions[/{id}]`, `POST /api/v1/calendar/feeds` (crear feed iCal por lista/filtro), `DELETE /api/v1/calendar/feeds/{id}` (revocar).

Búsqueda: `GET /api/v1/search?q=&types=task,note&filters...`.

Dashboard: `GET /api/v1/dashboard/widgets`, `GET /api/v1/dashboard/data?widget=&period=`, `GET/PATCH /api/v1/me/dashboard`. Reportes: `GET /api/v1/reports/weekly[/{semana}]`, `GET/PATCH /api/v1/me/report-settings`.

Revisiones asistidas: `GET /api/v1/review/daily`, `GET /api/v1/review/weekly`.

Import/export: `POST /api/v1/import/ticktick` (con credenciales OAuth del usuario o token), `POST /api/v1/import/csv`, `GET /api/v1/export/json | /csv?project_id= | /ical?filter_id=`, `GET /api/v1/backups`, `POST /api/v1/backups/restore`.

Administración: `GET/PATCH /api/v1/me`, `GET/POST/DELETE /api/v1/me/tokens`, `GET /api/v1/me/activity`, `GET /api/v1/me/tokens/{id}/activity`.

### 10.4 Compatibilidad TickTick (opcional pero recomendada)

Capa de compatibilidad `GET /open/v1/...` que replica la forma de la Open API de TickTick (mismos nombres de campo: `projectId`, `repeatFlag`, `sortOrder`, `items`...). Permite reutilizar integraciones existentes de terceros (MCP servers, CLIs, atajos) contra nuestro backend cambiando solo la URL base y el token. Implementación: adaptador fino sobre los servicios de dominio. Prioridad V1.

---

## 11. Eventos, webhooks y automatizaciones — V1 (la razón de ser del proyecto)

### 11.1 Catálogo de eventos de dominio

Todos versionados (`task.created@v1`). Mínimo:

```
task.created task.updated task.completed task.uncompleted task.deleted task.restored task.moved task.due_soon task.overdue
checklist_item.completed
project.created project.updated project.archived
tag.created tag.updated
habit.checkin habit.streak_broken habit.goal_met
focus.session_started focus.session_finished focus.session_aborted
reminder.fired
note.created note.updated
calendar.event_imported
automation.executed
```

Payload ejemplo:

```json
{
  "id": "evt_01J...",
  "type": "task.completed@v1",
  "occurred_at": "2026-10-17T09:11:04Z",
  "actor": {"kind": "user|api|automation|plugin", "id": "..."},
  "data": {"task": { "...entidad completa tras el cambio..." }},
  "previous": {"status": "active"}
}
```

### 11.2 Webhooks salientes

- RF-11010: CRUD de endpoints webhook por API y UI: URL, secreto, lista de eventos suscritos, filtro opcional (p. ej. solo tareas de una lista o con etiqueta), activo/pausado.
- Firma HMAC-SHA256 en cabecera `X-Signature-256` con secreto por endpoint (verificación estándar).
- Entrega con reintentos exponenciales (10 intentos en 24 h), registro de entregas con último código HTTP, botón "reenviar" y "ping" de prueba.
- Cola aislada: un endpoint lento nunca bloquea los demás.

### 11.3 Motor de automatizaciones internas

Reglas `when → if → then` definidas por el usuario (UI + API, scope `automations:manage`):

```json
{
  "name": "Vencidas importantes a revisión",
  "trigger": {"event": "task.overdue@v1"},
  "conditions": {"combinator": "AND", "conditions": [
    {"field": "priority", "op": "gte", "value": "medium"}
  ]},
  "actions": [
    {"type": "add_tag", "tag": "revisar"},
    {"type": "notify", "channel": "push", "text": "Tarea importante vencida: {{task.title}}"},
    {"type": "webhook", "url": "https://..."},
    {"type": "create_task", "project": "Inbox", "title": "Replanificar {{task.title}}"}
  ]
}
```

- Acciones mínimas: `add_tag`, `remove_tag`, `set_priority`, `move_to_list`, `reschedule`, `create_task`, `notify`, `webhook`, `run_plugin_action` (V2).
- Triggers adicionales de tiempo: `cron` (expresión cron, p. ej. "cada lunes 9:00") y `date_arrived` (tarea alcanza start/due).
- Condiciones usan la misma gramática de filtros (5.7): una sola implementación.
- Plantillas con variables `{{task.*}}`, `{{habit.*}}`, `{{now}}`.
- Log de ejecuciones por regla con resultado y errores.

---

## 12. Sistema de plugins — V2

Objetivo: que cualquier funcionalidad nueva (integración con otra app, una vista distinta, un tipo de recordatorio) sea un plugin, no un fork.

### 12.1 Manifiesto

```json
{
  "id": "com.pablo.mi-plugin",
  "version": "1.0.0",
  "name": "Mi plugin",
  "permissions": ["tasks:read", "webhooks:receive", "ui:commands"],
  "entrypoints": {
    "commands": "./commands.js",
    "nlp_patterns": "./nlp.js",
    "automations": "./actions.js",
    "views": "./views/"
  }
}
```

### 12.2 Puntos de extensión (mínimos)

1. **Comandos de la paleta** (Ctrl/Cmd+K): el plugin registra comandos con UI propia en iframe sandboxed o componentes declarativos.
2. **Patrones NLP**: extienden el parser de quick add (RF-103).
3. **Acciones de automatización**: nuevos `type` disponibles en el motor (11.3).
4. **Vistas personalizadas**: renderizado de una lista/filtro con layout propio (iframe + bridge API tipado).
5. **Recepción de eventos**: el plugin declara una URL interna y recibe eventos como un webhook más, con entrega garantizada.
6. **Campos personalizados**: el plugin añade campos con esquema a tareas (persistidos en `metadata` namespaced por `plugin_id`).

### 12.3 Seguridad

- Ejecución en worker aislado con red restringida (allowlist de dominios declarada) y cuota de CPU/memoria.
- Permisos declarados en manifiesto y otorgados al instalar, revocables.
- Los plugins se instalan desde repositorio git o paquete local; firma opcional.

---

## 13. Sincronización y offline — MVP (base), V1 (tiempo real)

- RF-13010: Cliente offline-first: cola local de mutaciones con `Idempotency-Key`, replay al reconectar.
- Prioridad de Pablo: la PWA móvil debe seguir funcionando sin conexión desde el MVP — crear, editar y completar tareas offline y que todo converja sin duplicados al volver la red (criterio de aceptación 5).
- RF-13011: Delta sync: `GET /api/v1/sync?since=<cursor>` devuelve cambios (upserts y tombstones) desde el cursor; el cursor es el `event_id` del bus.
- RF-13012: Resolución de conflictos: last-write-wins por campo con `updated_at`; completar/borrar gana a edición de texto si llega después; los conflictos se registran en ActivityLog. (Suficiente para uso personal; CRDT queda fuera.)
- RF-13013: Tiempo real entre dispositivos abiertos: WebSocket/SSE que empuja eventos del bus al cliente.
- RF-13014: Tamaño de página de sync y tombstones retenidos 90 días.

---

## 14. Notificaciones (infraestructura) — MVP

- Canales: Web Push (PWA), email (SMTP transaccional), Telegram (V1, RF-2003) y canal `automation` interno.
- Centro de preferencias por tipo: recordatorios de tareas, daily reminder, hábitos, fin de pomodoro, automatizaciones.
- Horario de silencio configurable (no molestar 22:00-08:00 default) con excepción para recordatorios marcados como "críticos".
- Todas las notificaciones quedan registradas (qué, cuándo, canal, entregada/leída).

---

## 15. Seguridad y privacidad — MVP

- Contraseñas con Argon2id; 2FA TOTP (V1); sesiones revocables.
- PATs con hash almacenado y último uso visible.
- TLS extremo a extremo; secretos en variables de entorno / gestor de secretos; cifrado at-rest del volumen de datos.
- Tokens de feeds iCal y dirección email-to-task regenerables (revocación inmediata).
- Auditoría: ActivityLog por usuario con IP/agente para acciones de cuenta, y **registro por token de cada operación de los agentes externos**, consultable en `GET /api/v1/me/tokens/{id}/activity`.
- Datos del usuario exportables y borrables por completo (RF-1703 + `DELETE /api/v1/me` con confirmación).
- Sin telemetría a terceros por defecto.

---

## 16. Requisitos no funcionales

| Área | Requisito |
|---|---|
| Rendimiento | p95 < 200 ms en lecturas de listas típicas (<5k tareas visibles); quick add < 300 ms incluyendo NLP; búsqueda < 300 ms con 100k tareas |
| Escalabilidad | diseño válido hasta 50 usuarios / 1M tareas por instancia sin cambios (sobra para uso personal y pequeño equipo) |
| Disponibilidad | backup diario + restauración probada (RF-1704); RPO 24 h, RTO 1 h |
| i18n | español e inglés desde el MVP; todas las cadenas externalizadas; NLP al menos en ambos |
| Accesibilidad | WCAG 2.1 AA en web: navegación completa por teclado, contraste, aria-labels en vistas complejas |
| Navegadores | últimas 2 versiones de Chrome/Firefox/Safari/Edge; PWA instalable en Android/iOS |
| Observabilidad | logs estructurados JSON, métricas (Prometheus), alertas básicas (cola de recordatorios atrasada, webhooks fallando) |
| Tests | pirámide: unitarios de dominio (recurrencias, filtros, NLP) con cobertura >80% en esos módulos, integración de API, e2e de flujos críticos (crear→recordar→completar) |

---

## 17. Criterios de aceptación globales

1. Pablo puede vivir una semana usando solo esta app en lugar de TickTick sin perder: captura rápida, filtros, recurrentes, recordatorios y hábitos (el Pomodoro llega en V2).
2. Todo lo hecho en la UI se puede reproducir con `curl` contra la API documentada.
3. Un cambio de una tarea dispara el webhook suscrito en < 5 s.
4. Un agente externo (ChatGPT, Cursor, etc.) conecta por MCP con un PAT de scopes limitados y puede listar, crear y completar tareas sin tocar nada fuera de sus scopes.
5. Sin red, se pueden crear/editar/completar tareas y al volver la red todo converge sin duplicados.
6. El dashboard muestra los KPIs de la semana con el layout configurado, y el reporte semanal llega por el canal elegido con el tono elegido (por defecto: domingo 20:00, honesto).

---

## 18. Convenciones de desarrollo

- Monorepo (pnpm workspaces): `apps/web`, `apps/api`, `packages/domain` (reglas de negocio puras: recurrencias, filtros, NLP), `packages/sdk` (cliente TS de la API generado del OpenAPI).
- Las reglas de negocio viven en `packages/domain` sin dependencias de framework: así el motor de automatizaciones, la API y los clientes comparten exactamente el mismo código de filtros y recurrencias.
- Migraciones de base de datos con Prisma Migrate, siempre reversibles.
- Commits con conventional commits; CI con lint, typecheck, tests unitarios e integración; despliegue con `docker compose up` (Caddy + API + Postgres + Redis si aplica) en el servidor Hetzner, documentado en el README.
- El OpenAPI se genera del código (no al revés) y se verifica en CI que no hay endpoints sin documentar.

---

## 19. Plan por fases

**MVP / fase 1 (4-6 semanas de agente, uso personal ya posible):**
modelo de datos completo de tareas/listas/etiquetas/filtros (multiusuario desde el inicio, D5) · quick add con NLP · CRUD tareas + checklist + subtareas · fechas/recurrencias/recordatorios push+email · **hábitos con recordatorios y estadísticas (RF-1301–1305), fáciles de adoptar y configurar** · smart lists + filtros · vista lista · búsqueda + paleta · API v1 de esos recursos + **PAT con scopes granulares + servidor MCP (RF-2001/2002)** · export JSON · offline básico (cola de mutaciones) · Docker Compose con Caddy en Hetzner (`todo.reflexionia.com`).

**V1:**
Kanban, Timeline, Eisenhower · calendario completo + suscripciones iCal + Google Calendar (lectura) + feeds propios · **bot de Telegram (RF-2003)** · **Google Drive: adjuntos y backups (RF-2005)** · notas · **dashboard de KPIs / jardín digital (RF-2101–2105)** · **reporte semanal honesto (RF-2201–2204)** · **revisión diaria/semanal asistida (RF-2301–2303)** · webhooks + automatizaciones · sync en tiempo real · capa de compatibilidad `/open/v1` · import CSV, export iCal/CSV · 2FA.

**V2:**
colaboración (compartir listas con permisos — p. ej. la lista compartida con su pareja —, asignar, comentarios) · **Pomodoro/Focus con estadísticas (RF-1201–1206)** · plugins · widgets nativos / apps móviles · logros · WIP limits y otras mejoras propias · Google Calendar two-way · (opcional, solo si surge la necesidad) importador TickTick.

---

## 20. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Alcance enorme para un solo desarrollador/agente | Fases duras; el MVP ya es usable; cada RF es independiente y testeable |
| Recurrencias y zonas horarias: fuente clásica de bugs | Usar librería probada (rrule.js / dateutil), suite de tests de casos límite (RF-706) |
| NLP en español pobre | Empezar con reglas, no ML; resaltar lo detectado para corrección manual inmediata |
| PWA: push y background timer limitados en iOS | Sesiones de focus persistidas en servidor (RF-1205); Web Push en iOS requiere app instalada: documentarlo |
| Exposición a agentes externos (MCP/PAT) desde fase 1 | Scopes granulares, tokens revocables con último uso visible, rate limiting por token; el servidor MCP hereda los límites del token (RF-2001) |
| Instancia única en Hetzner: punto único de fallo | Backup diario externo y restauración probada (RF-1704); RPO 24 h / RTO 1 h asumidos en sección 16 |
| Importador TickTick (aplazado) limitado por su API si se retoma | Documentar lo no exportable (hábitos/pomodoros) y ofrecer recreación guiada |

---

## 21. Decisiones de Pablo (resuelta el 17 oct 2026)

Las preguntas abiertas originales quedaron resueltas así:

1. **Plataformas**: solo PWA web en fase 1, bien cuidada en móvil y escritorio. Apps nativas más adelante.
2. **Stack**: TypeScript extremo a extremo confirmado: NestJS + PostgreSQL + Prisma en backend, React + TypeScript en frontend.
3. **Nombre y dominio**: `todo.reflexionia.com` (app, API, feeds iCal, email-to-task, emails transaccionales).
4. **Alojamiento**: su servidor Hetzner existente, Docker Compose (API, PostgreSQL, Redis si hace falta) y Caddy con HTTPS automático.
5. **Usuarios**: lanzamiento con un solo usuario, pero modelo de datos multiusuario desde el principio y compartición de listas en el roadmap (caso de uso: lista compartida con su pareja para ver y editar).
6. **Prioridad de módulos**: los hábitos con recordatorios entran en fase 1, con foco en que sean fáciles de adoptar y configurar. El Pomodoro pasa a fase 2 (V2).
7. **Migración**: sin importación desde TickTick; se empieza desde cero. Importador fuera del MVP (RF-1701 aplazado).
8. **Integraciones**: prioridad 1) agentes personales (ChatGPT, Cursor, Instinct...) vía **servidor MCP + API REST con PATs de scopes granulares, requisito de fase 1**; 2) Telegram (consultar y crear tareas); 3) Google Calendar; 4) Google Drive.


---

## 22. Apéndice A: referencia de la Open API de TickTick (para el importador y la capa de compatibilidad)

Resumen verificado contra la documentación pública (developer.ticktick.com, octubre 2026):

- Auth: OAuth2 (`https://ticktick.com/oauth/authorize`, `.../oauth/token`), Basic Auth con client_id/secret al canjear el code, scopes `tasks:read tasks:write`, Bearer token en `api.ticktick.com`.
- Endpoints: `GET /open/v1/project`, `GET /open/v1/project/{id}`, `GET /open/v1/project/{id}/data`, `POST /open/v1/project`, `POST /open/v1/project/{id}`, `DELETE /open/v1/project/{id}`; `GET /open/v1/project/{projectId}/task/{taskId}`, `POST /open/v1/task`, `POST /open/v1/task/{taskId}`, `POST /open/v1/project/{projectId}/task/{taskId}/complete`, `DELETE /open/v1/project/{projectId}/task/{taskId}`.
- Task: `id, projectId, title, content, desc, isAllDay, startDate, dueDate, timeZone, reminders[TRIGGER:...], repeatFlag (RRULE), priority (0/1/3/5), status (0 normal / 2 completada), completedTime, sortOrder, items[ChecklistItem]`.
- ChecklistItem: `id, title, status (0/1), completedTime, isAllDay, sortOrder, startDate, timeZone`.
- Project: `id, name, color, sortOrder, closed, groupId, viewMode (list|kanban|timeline), permission (read|write|comment), kind (TASK|NOTE)`.
- Column: `id, projectId, name, sortOrder`.
- **No expone**: hábitos, pomodoros, filtros, etiquetas como recurso, notas sueltas, estadísticas, webhooks. Esta carencia es la justificación del proyecto.

## 23. Apéndice B: fuentes consultadas

- Documentación de la Open API de TickTick: https://developer.ticktick.com/ (vía espejo del documento openapi en repositorios públicos de integración).
- Centro de ayuda de TickTick (taxonomía de funciones: tareas, listas, filtros, Pomodoro, hábitos, calendario, Eisenhower, Timeline, colaboración, integraciones, widgets, sticky notes): https://help.ticktick.com/
- Página de funciones: https://ticktick.com/features

> Nota: no se usó ninguna credencial para esta especificación; todo proviene de documentación pública. Si en desarrollo hace falta explorar la app con sesión iniciada para detalles de UI/UX, hacerlo a través del gestor de contraseñas del usuario, nunca con credenciales pegadas en conversaciones.

---

*Fin del documento. Mantener versionado junto al código; cada fase cerrada actualiza la sección 19.*
__REFLEXIONIA_EOF__
cat > './docs/testing.md' <<'__REFLEXIONIA_EOF__'
# Testing

Frameworks elegidos por defecto (el harness los fija; la spec no los fijaba):

- Vitest (unitarios en todo el monorepo, incluida la API NestJS).
- Supertest para integración de API contra Postgres/Redis reales.
- Playwright para e2e de la PWA.

Pirámide de la sección 16: cobertura >80% en `packages/domain` (recurrencias, filtros, NLP);
integración por cada recurso de la API; e2e solo de flujos críticos
(crear→recordar→completar; offline→reconectar→converge sin duplicados).

Los tests citan su RF: `it('RF-706: …')`.
__REFLEXIONIA_EOF__
cat > './eslint.config.mjs' <<'__REFLEXIONIA_EOF__'
// ESLint flat config compartida por todo el monorepo.
// Convención: cada app/package puede extenderla desde su propio eslint.config.mjs.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/build/**', '**/coverage/**', '**/node_modules/**', '**/src/generated/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Reglas de negocio puras: prohibido importar frameworks en packages/domain (ver .cursor/rules/50-domain.mdc)
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
    },
  },
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@nestjs/*', 'express', 'fastify', 'react', 'react-dom', 'prisma', '@prisma/*'],
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
);
__REFLEXIONIA_EOF__
cat > './package.json' <<'__REFLEXIONIA_EOF__'
{
  "name": "reflexionia-tasks",
  "version": "0.1.0",
  "private": true,
  "description": "Gestor de tareas personal extensible (clon de TickTick) - todo.reflexionia.com",
  "engines": {
    "node": ">=22",
    "pnpm": ">=9"
  },
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "docker compose -f docker-compose.dev.yml up -d && pnpm -r --parallel dev",
    "dev:api": "pnpm --filter api dev",
    "dev:web": "pnpm --filter web dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:integration": "pnpm --filter api test:integration",
    "test:e2e": "pnpm --filter web test:e2e",
    "db:migrate": "pnpm --filter api prisma migrate dev",
    "db:deploy": "pnpm --filter api prisma migrate deploy",
    "db:seed": "pnpm --filter api seed",
    "backup": "bash scripts/backup.sh",
    "backup:verify": "bash scripts/restore-verify.sh"
  }
}
__REFLEXIONIA_EOF__
cat > './packages/domain/package.json' <<'__REFLEXIONIA_EOF__'
{
  "name": "@reflexionia/domain",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./recurrence": "./src/recurrence/index.ts",
    "./filters": "./src/filters/index.ts",
    "./nlp": "./src/nlp/index.ts"
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --coverage"
  },
  "dependencies": {
    "rrule": "^2.8.1",
    "date-fns-tz": "^3.2.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@vitest/coverage-v8": "^3.0.0"
  }
}
__REFLEXIONIA_EOF__
cat > './packages/domain/src/filters/README.md' <<'__REFLEXIONIA_EOF__'
# filters

ÚNICA implementación de la gramática de filtros de la sección 5.7
(combinators AND/OR, un nivel de grupos, campos lista/etiqueta/fecha/prioridad/keyword/estado).
La usan `POST /filters/preview`, smart lists, automatizaciones (11.3) y revisiones (9.23).
Prohibido duplicar esta lógica en cliente o en queries SQL a mano (RF-904): si hace falta
evaluar en SQL, generar el WHERE desde esta misma gramática.
__REFLEXIONIA_EOF__
cat > './packages/domain/src/nlp/README.md' <<'__REFLEXIONIA_EOF__'
# nlp

Parser del quick add (RF-102) en español e inglés con reglas (no ML, sección 20).
Extrae: fecha/hora ("mañana 18:00", "cada lunes"), prioridad (!alta, p1-p3),
etiquetas (#casa), lista (^trabajo), recordatorio ("avísame 30 min antes").
Siempre devuelve los fragmentos reconocidos para que la UI los resalte antes de confirmar.
Extensible por plugins (RF-103): registrar patrones adicionales sin tocar el núcleo.
__REFLEXIONIA_EOF__
cat > './packages/domain/src/recurrence/README.md' <<'__REFLEXIONIA_EOF__'
# recurrence

Expansión RRULE (RFC 5545) con rrule.js. Reglas de la sección 6.1 y RF-701 a RF-706.
Casos límite obligatorios en tests: 29-31 de febrero, DST en la zona de captura,
completar con retraso, `repeat_from: completion_date`. Solo se materializa la
ocurrencia actual; el cálculo de ocurrencias teóricas (RF-704) no persiste nada.
__REFLEXIONIA_EOF__
cat > './packages/domain/tsconfig.json' <<'__REFLEXIONIA_EOF__'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true
  },
  "include": ["src"]
}
__REFLEXIONIA_EOF__
cat > './packages/sdk/README.md' <<'__REFLEXIONIA_EOF__'
# @reflexionia/sdk

Cliente TypeScript de la API, **generado del OpenAPI** (sección 18: el OpenAPI se genera
del código, no al revés). No editar `src/generated/` a mano.

Regenerar tras cambios en la API:

```bash
pnpm --filter api openapi:generate
pnpm --filter @reflexionia/sdk generate
```

La web consume la API solo a través de este paquete.
__REFLEXIONIA_EOF__
cat > './packages/sdk/package.json' <<'__REFLEXIONIA_EOF__'
{
  "name": "@reflexionia/sdk",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "generate": "openapi-typescript ../../apps/api/openapi.json -o src/generated/schema.d.ts",
    "build": "tsc -p tsconfig.build.json",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "openapi-typescript": "^7.4.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
__REFLEXIONIA_EOF__
cat > './pnpm-workspace.yaml' <<'__REFLEXIONIA_EOF__'
packages:
  - 'apps/*'
  - 'packages/*'
__REFLEXIONIA_EOF__
cat > './scripts/backup.sh' <<'__REFLEXIONIA_EOF__'
#!/usr/bin/env bash
# Backup diario (RF-1704): pg_dump + adjuntos, copiado FUERA de la máquina, retención 30 días.
# Programar en el host: 0 4 * * * cd /opt/reflexionia && ./scripts/backup.sh
set -euo pipefail

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_DIR:-./backups}/$STAMP"
mkdir -p "$DEST"

echo "[backup] pg_dump…"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-reflexionia}" "${POSTGRES_DB:-reflexionia}" \
  | gzip > "$DEST/db.sql.gz"

echo "[backup] adjuntos…"
docker run --rm -v reflexionia-tasks_attachments:/data -v "$PWD/$DEST":/out alpine \
  tar czf /out/attachments.tar.gz -C /data .

if [ -n "${BACKUP_REMOTE:-}" ]; then
  echo "[backup] copiando a destino externo: $BACKUP_REMOTE"
  rclone copy "$DEST" "$BACKUP_REMOTE/$STAMP"
else
  echo "[backup] AVISO: BACKUP_REMOTE no configurado; el backup NO sale de la máquina (incumple RF-1704)"
fi

# Retención
find "${BACKUP_DIR:-./backups}" -maxdepth 1 -type d -mtime +"${BACKUP_RETENTION_DAYS:-30}" -exec rm -rf {} +
echo "[backup] OK $DEST"
__REFLEXIONIA_EOF__
cat > './scripts/new-module.sh' <<'__REFLEXIONIA_EOF__'
#!/usr/bin/env bash
# Crea el esqueleto de un módulo de dominio en apps/api (ver apps/api/src/modules/README.md)
set -euo pipefail
NAME="${1:?uso: scripts/new-module.sh <nombre>}"
DIR="apps/api/src/modules/$NAME"
mkdir -p "$DIR/dto"
touch "$DIR/$NAME.module.ts" "$DIR/$NAME.controller.ts" "$DIR/$NAME.service.ts" "$DIR/$NAME.service.spec.ts"
echo "Módulo creado en $DIR — recuerda: sin imports entre módulos, eventos por el bus, OpenAPI completo."
__REFLEXIONIA_EOF__
cat > './scripts/restore-verify.sh' <<'__REFLEXIONIA_EOF__'
#!/usr/bin/env bash
# Prueba de restauración automática semanal (RF-1704): restaura el último backup en un
# Postgres temporal y verifica integridad. Alerta (exit != 0) si falla.
# Programar en el host: 0 5 * * 0 cd /opt/reflexionia && ./scripts/restore-verify.sh
set -euo pipefail

LATEST="$(ls -1d "${BACKUP_DIR:-./backups}"/*/ | sort | tail -1)"
echo "[restore-verify] usando $LATEST"

docker run -d --name restore-verify -e POSTGRES_PASSWORD=verify postgres:17-alpine
trap 'docker rm -f restore-verify >/dev/null 2>&1 || true' EXIT
sleep 5

gunzip -c "$LATEST/db.sql.gz" | docker exec -i restore-verify \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - >/dev/null

TABLES=$(docker exec restore-verify psql -U postgres -d postgres -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
echo "[restore-verify] tablas restauradas: $TABLES"
[ "$TABLES" -gt 0 ] && echo "[restore-verify] OK"
__REFLEXIONIA_EOF__
cat > './tsconfig.base.json' <<'__REFLEXIONIA_EOF__'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "exclude": ["node_modules", "dist", "build", "coverage"]
}
__REFLEXIONIA_EOF__
echo 'Listo: proyecto recreado en ./reflexionia-tasks-harness-v1/'
