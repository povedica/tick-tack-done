# Handoff — base del MVP (fase 1, punto 1)

Punto seguro para retomar. El árbol está limpio, los comandos de calidad pasan y este estado está en `main` con el tag `phase-1.1`.

## Dónde estamos

Cerrado el punto 1 de la fase 1 (`docs/roadmap.md`): monorepo que instala, hace lint, typecheck y test; infra local; modelo de la sección 5; migración reversible; seed; API Nest en `/api/v1` con OpenAPI en `/api/docs`.

Siguiente trabajo: punto 2, tareas núcleo. CRUD + checklist + subtareas (RF-201–210), listas/carpetas/secciones (RF-301–306), etiquetas (RF-401–403), prioridades (RF-501–503). Aún no hay módulos de dominio en `apps/api/src/modules/`.

## Tags

Cada hito cerrado lleva un tag anotado `phase-<fase>.<punto>-<hito>`. El tag sin sufijo marca el punto seguro de ese punto del roadmap.

| Tag | Commit | Qué marca |
|---|---|---|
| `phase-1.1-harness` | arnés importado | Reglas, spec, Compose, CI, paquetes vacíos |
| `phase-1.1-domain` | entradas de dominio | Contratos de recurrence, filters y nlp |
| `phase-1.1-scripts` | scripts ejecutables | api, web y sdk pasan lint, typecheck y test |
| `phase-1.1-schema` | `schema.prisma` | Modelo de la sección 5 |
| `phase-1.1-migration` | migración y seed | SQL aplicado y `down.sql` probado |
| `phase-1.1-api` | arranque Nest | `/api/v1/health` y `/api/docs` |
| `phase-1.1` | este handoff | Punto seguro para seguir |

Al cerrar el siguiente corte, crear `phase-1.2-…` y, al dejarlo retomable, `phase-1.2`.

## Cómo arrancar

```bash
cp .env.example .env
pnpm install
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- API: http://localhost:3000/api/v1/health
- OpenAPI: http://localhost:3000/api/docs
- Mailpit: http://localhost:8025
- Seed: `demo@reflexionia.test`. La contraseña es `SEED_USER_PASSWORD` del `.env` (`dev-only` en el ejemplo). No está en el código.

`pnpm install`, `pnpm lint`, `pnpm typecheck` y `pnpm test` estaban en verde al etiquetar `phase-1.1`. La integración (`pnpm test:integration`) exige Postgres migrado y `DATABASE_URL`.

## Decisiones que no hay que reabrir

- Sección 21 de la spec: PWA, Nest + Prisma + Postgres, dominio `todo.reflexionia.com`, un usuario activo con modelo multiusuario, hábitos en fase 1, Pomodoro en V2, sin importador TickTick, MCP + PAT en fase 1.
- Prisma se queda en 6.19. Los índices parciales (tareas activas por `due_date`, una inbox por usuario) viven en el SQL de `20261017105855_init_domain_model` porque Prisma 6 no los modela. No generan drift. `search_vector` es una columna generada; el `@default(dbgenerated(...))` del schema coincide con lo que introspecciona Prisma. Si se toca, hay que repetir `prisma migrate diff` y dejarlo vacío.
- El rollback de esa migración es `down.sql` en la misma carpeta. Probado en una base scratch: borra tablas, enums y `citext`. No borra `_prisma_migrations`.
- `nest build` usa `apps/api/tsconfig.build.json` (`rootDir: src`) para emitir `dist/main.js`, que es lo que espera el Dockerfile.
- Node del entorno era v23.9.0 y `.nvmrc` pide 22. `engine-strict` rompe con `typescript-eslint` 8.71 (`eslint-visitor-keys@5` excluye Node 23). Quedaron fijados `typescript-eslint` 8.18.2 y `eslint` 9.17.0.
- Los ficheros `*config*.ts` no están en un tsconfig. ESLint los cubre con `disableTypeChecked` en `eslint.config.mjs`.
- `apps/api/openapi.json` está en `.prettierignore` porque lo genera `pnpm --filter api openapi:generate`. Si cambia un endpoint, regenerar y commitear el JSON.

## Qué no está hecho

- CRUD, UI, hábitos funcionales, scheduler, MCP, offline, NLP.
- BullMQ no está cableado. Redis sí está en el compose.
- `packages/domain` lanza `recurrence is not implemented`, `filters are not implemented` y `nlp is not implemented`. Los tipos sí son el contrato.
- `pnpm format:check` sigue fallando en ficheros del arnés que ya estaban sin formatear: la spec, el README, los compose, el workflow de CI y `pnpm-lock.yaml`. No se reformatearon para no mezclarlos con la base.

## Norma de trabajo

Commits pequeños en inglés (Conventional Commits), un tag por hito cerrado, y un tag de punto seguro al dejar la sesión retomable. Español en docs y UI; inglés en código.
