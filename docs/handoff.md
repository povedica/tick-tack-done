# Handoff — tareas núcleo (fase 1, punto 2)

Punto seguro para retomar. Lint, typecheck, tests unitarios e integración pasan. Este estado está en la rama `feat/core-tasks` con el tag `phase-1.2`. No está en `main`: la norma del repo impide commits directos a esa rama.

## Dónde estamos

Cerrado el punto 2 de la fase 1 (`docs/roadmap.md`): CRUD de tareas con checklist, subtareas, adjuntos y papelera (RF-201–210), listas, carpetas y secciones (RF-301–306), etiquetas (RF-401–403) y prioridades (RF-501–503).

La API pública sigue en `/api/v1`. OpenAPI está en `/api/docs` y el JSON commiteado es `apps/api/openapi.json`.

Siguiente trabajo: punto 3, tiempo. Fechas y zonas (RF-601–605), recurrencias (RF-701–706) y recordatorios push+email con scheduler (RF-801–808). El scheduler sigue siendo el único componente que puede materializar ocurrencias y disparar recordatorios.

## Tags

| Tag | Qué marca |
|---|---|
| `phase-1.2-domain` | Reglas puras de orden, prioridad, checklist, subtareas y etiquetas |
| `phase-1.2-schema` | Outbox, idempotencia, `task_complete_children` y secciones plegables, con `down.sql` probado |
| `phase-1.2-api` | Módulos de listas, etiquetas y tareas, más OpenAPI |
| `phase-1.2` | Este handoff. Punto seguro para seguir |

Los tags `phase-1.1*` siguen en `main`.

## Cómo probar las tareas

La auth de desarrollo no es la de producción. Con `AUTH_MODE=dev` (está en `.env.example`) cada ruta con `@Scopes` exige la cabecera `X-Dev-User-Email` de un usuario que exista. El seed crea `demo@reflexionia.test` y su inbox. `/api/v1/health` sigue público.

```bash
curl -H 'X-Dev-User-Email: demo@reflexionia.test' http://localhost:3000/api/v1/tasks
```

Los `POST` aceptan `Idempotency-Key` (24 h, por usuario). Repetir la misma clave con otro cuerpo responde `409 idempotency_conflict`.

Integración, con Postgres migrado:

```bash
bash scripts/with-env.sh pnpm --filter api exec vitest run --config vitest.config.integration.ts
```

`scripts/with-env.sh` pisa `DATABASE_URL`. Para una base scratch hay que llamar a Prisma sin ese wrapper.

## Qué quedó dentro del corte

- `packages/domain`: `sort_order` con hueco 65536, prioridades y el mapa TickTick 0/1/3/5, checklist Markdown, progreso, política al completar al padre, herencia de lista en subtareas, nombres y ciclos de etiquetas, zona IANA y duración. El paquete emite CommonJS en `dist/` para que Nest lo importe. Vitest de la API aliasa el fuente, así que los tests no dependen de ese build. Cobertura 100 %.
- Módulos aislados en `apps/api/src/modules/`: `lists`, `tags`, `tasks`. No se importan entre sí. Borrar una lista manda sus tareas a la papelera en la misma transacción y publica `task.deleted` con `EventRecorder`, sin llamar a `TasksService`.
- Outbox y `ActivityLog` en la misma transacción Prisma. `published_at` se queda a null: BullMQ no está cableado.
- Prioridades en la API pública son `none | low | medium | high`. `priorityToTickTick` / `priorityFromTickTick` quedan en dominio para la capa `/open/v1` (V1, RF-503).
- `PATCH /api/v1/me` acepta `display_name`, `time_zone` y `task_complete_children` (`ask | complete | leave`, default `ask`). Completar una tarea con hijos activos y política `ask` responde `409 children_need_decision` salvo que el cuerpo pida `complete_with_children`.
- Adjuntos en disco (`ATTACHMENT_DIR`, 25 MB). La descarga fuerza `Content-Disposition: attachment`. No hay miniaturas.
- `GET /api/v1/tasks` oculta subtareas salvo `flat=true`. `status` por defecto es `active`. Orden `manual | priority | due`, paginación por cursor y ETag débil en los listados.

Eventos que emite este corte (catálogo 11.1 actualizado): `task.created/updated/completed/uncompleted/deleted/restored/moved`, `checklist_item.created/updated/completed/uncompleted/deleted`, `project.created/updated/archived/unarchived/deleted`, `folder.*`, `column.*`, `tag.created/updated/deleted/merged`, `note.created/updated`. Duplicar publica `task.created` con `duplicated_from`. Completar una recurrente no crea la siguiente ocurrencia.

## Decisiones que no hay que reabrir

- Sección 21 de la spec, sin cambios.
- Prisma sigue en 6.19. La migración `20261017113322_add_outbox_idempotency_and_task_policies` no toca los índices parciales ni `search_vector`. `prisma migrate diff` contra el schema quedó vacío. El `down.sql` se probó en una base scratch: borra el outbox, la idempotencia, las dos columnas y el enum, y deja los índices de la migración inicial.
- `typescript-eslint` sigue en 8.18.2 y `eslint` en 9.17.0 por Node 23 (`eslint-visitor-keys@5` lo excluye). `.nvmrc` pide 22.
- Vitest no emite `design:paramtypes`. Todo constructor de Nest lleva `@Inject` explícito; si no, la integración inyecta `undefined`.
- Los scopes se declaran con `@Scopes` pero el guard de desarrollo los concede todos. La aplicación real llega con los PAT del punto 7.
- `apps/api/openapi.json` está en `.prettierignore`. Si cambia un endpoint, `pnpm --filter api build && pnpm --filter api openapi:generate`.

## Qué no está hecho

- UI, hábitos funcionales, scheduler, MCP, cola offline del cliente y NLP. `POST /tasks` no acepta `raw_text` (el cuerpo desconocido responde 400); el parseo llega en el punto 4.
- `GET /api/v1/tasks/{id}/occurrences` (las ocurrencias son del scheduler, punto 3).
- Miniaturas de adjuntos (RF-203). No hay `sharp`.
- Límite de 1000 peticiones / 15 min. Entra con los PAT del punto 7.
- Drenado del outbox por BullMQ. Redis sí está en el compose.
- `packages/domain` sigue lanzando `recurrence is not implemented`, `filters are not implemented` y `nlp is not implemented`.
- `pnpm format:check` sigue fallando en ficheros del arnés que ya estaban sin formatear: la spec, el README, los compose, el workflow de CI y `pnpm-lock.yaml`. No se reformatearon.

## Norma de trabajo

Commits pequeños en inglés (Conventional Commits), un tag por hito cerrado, y un tag de punto seguro al dejar la sesión retomable. Español en docs y UI; inglés en código. Módulos de dominio solo se hablan por eventos. Lógica pura en `packages/domain`.
