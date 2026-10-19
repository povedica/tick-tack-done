# Prompt: cerrar la fase 1 de Reflexionia Tasks

Pega esto en un chat nuevo de Cursor, con el repo en `main` ya actualizado (PR #8 mergeada).

---

Cierra la fase 1 de `docs/spec/especificacion-producto-v1.1.md` (sección 19, MVP). Los puntos 1 a 7 ya están en `main`. Esta PR es la excepción pedida el 18 oct 2026: el resto del MVP va junto, en una sola rama y una sola PR. No abras V1 ni V2. No reabras la sección 21. No publiques la spec como v1.2.

Lee primero `docs/handoff.md`, `docs/roadmap.md`, `AGENTS.md`, `.cursor/rules/` y, de la spec, las secciones 9.7 (RF-702), 9.17 (RF-1703 JSON y RF-1704, RF-1705), 10.1, 10.2, 10.3 (export, backups, `DELETE /api/v1/me`), 13 (RF-13010 a RF-13012 y RF-13014), 14 en lo que ya esté a medias de push/email, 15, 16 y 17 (criterios 1 y 5). La fuente de verdad es esa spec. No leas ni cites `docs/spec/tick-tack-done-ui-spec-v1.0*.md` ni `docs/spec/cursor-prompt-ui-look-v1.2.md`: el look es otro corte.

Abre `feat/fase-1` desde `main`. En cuanto haya un commit, abre el PR contra `main`. Al dejarlo cerrado, la CI tiene que estar en verde. No mergees salvo que te lo pida. Español en docs y UI, inglés en el código.

## Qué ya está y no se reabre

Puntos 1 a 6 en `main`. Punto 7 (RF-2001, RF-2002, criterio 4, 1000 peticiones / 15 min por token) mergeado en la PR #8, tag `phase-1.7`. Completar una recurrente no crea la siguiente fila: solo el scheduler la materializa. Prisma 6.19. `scripts/with-env.sh` pisa `DATABASE_URL`. Todo constructor de Nest con dependencias lleva `@Inject`. Los módulos de dominio no se importan entre sí. Cobertura de `packages/domain` por encima del 80 %. La CI compila `packages/domain` antes del lint y de los tests; no quites ese paso. `apps/api/tsconfig.json` está en NodeNext; no lo reviertas a CommonJS.

El shell y Hoy de la PR #5 se quedan. No pulas la barra ni Hoy, y no hagas el rediseño de la sección 7.

## Qué entra en esta PR

1. **Offline (punto 8, criterio 5).** Cola local de mutaciones con `Idempotency-Key` (RF-13010 y la convención de 10.2). Crear, editar y completar tareas sin red, y al volver la red convergen sin duplicados. Delta `GET /api/v1/sync?since=` (RF-13011), last-write-wins por campo (RF-13012) y página de sync con tombstones 90 días (RF-13014). El tiempo real (RF-13013) es V1 y no entra.

2. **Export y backup (punto 9).** Export JSON versionado de todo el estado del usuario, con `schema_version` (RF-1703 en su parte JSON, RF-1705). `GET /api/v1/export/json`. CSV e iCal no entran: la sección 19 los deja en V1. Backup diario de Postgres más adjuntos, copia fuera de la máquina, retención 30 días, restauración desde archivo y prueba automática semanal en un contenedor temporal (RF-1704). Rutas públicas de 10.3: `GET /api/v1/backups` y `POST /api/v1/backups/restore`. `DELETE /api/v1/me` con confirmación (sección 15) entra junto al export. Google Drive como destino es V1 (RF-2005): el destino es el almacenamiento externo que diga `docs/deployment.md` (`BACKUP_REMOTE`). Si no hay destino ni acceso al servidor, deja el mecanismo y la documentación listos y para ahí; no inventes secretos ni entres por SSH a ciegas.

3. **Sesión real, porque sin ella no se puede desplegar.** Sección 10.1 y 15: contraseñas con Argon2id, cookies httpOnly + CSRF, sesiones revocables. `AUTH_MODE=dev` y `X-Dev-User-Email` se quedan solo para desarrollo local. Un PAT sigue sin heredar ese pase. OAuth2 Authorization Code + PKCE entra aquí (10.1), con pantalla de consentimiento y los mismos scopes. En local la PWA puede seguir en modo dev.

4. **RF-702.** Pantalla en español para construir la recurrencia, sin enseñar la RRULE salvo en modo avanzado. La materialización sigue siendo solo del scheduler.

5. **Bus.** Hoy el outbox se escribe con `published_at` null y BullMQ no está cableado. Publícalo en el bus. No construyas el dispatcher de webhooks ni el motor de automatizaciones: la sección 11 es V1.

6. **Despliegue de la sección 19.** Docker Compose + Caddy en un VPS con Docker, dominio `todo.reflexionia.com`, siguiendo `docs/deployment.md`. Producción sin `AUTH_MODE=dev` y sin datos de mentira. Antes de exponer `POST /api/v1/inbound/email`, confirma el límite de tamaño (25 MB) y añade límite de ritmo: es un endpoint público. El cron de `scripts/backup.sh` (04:00) y `scripts/restore-verify.sh` (domingo 05:00) entra con RF-1704. Si falta acceso al servidor o un secreto, no lo inventes: dilo y deja el corte desplegable a falta de ese dato.

7. **Pruebas de la sección 16.** e2e del flujo crear → recordar → completar, y del flujo offline → reconectar → converge sin duplicados. Tests con el RF en el nombre.

## Qué no entra

V1: Kanban, timeline, Eisenhower, calendario, Telegram, Google Drive, Google Calendar, notas, dashboard, reporte semanal, revisiones asistidas, webhooks, automatizaciones, sync en tiempo real, `/open/v1`, import CSV, export iCal/CSV, 2FA, geovallado (RF-806).

V2: colaboración, Pomodoro, plugins, widgets nativos, logros, WIP limits, Calendar two-way.

RF-1701 (importador externo) sigue aplazado. No pulir el look. No ejecutar el prompt de look de UI.

## Reglas de cierre

Si el estado cambia, emite eventos de dominio versionados y añade solo sus nombres a la línea del catálogo 11.1. Esa línea, y la de rutas de 10.3 si falta un endpoint público, son las únicas ediciones de la spec v1.1.

Antes de dar el corte por cerrado: `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde; integración si tocas la API. Si hay UI, recórrela en el navegador. Commits pequeños, Conventional Commits, sin `--no-verify` ni amend. Tags `phase-1.8-offline`, `phase-1.9-export`, `phase-1.10-auth` y `phase-1.11-deploy` en el commit de cada hito, y `phase-1` en el handoff final. Actualiza `docs/handoff.md` y `docs/roadmap.md`. Conserva «Avisos para más adelante» y añade un cierre que diga qué de la fase 1 quedó hecho y qué se dejó fuera por ser V1 o V2. Push de la rama, del PR y de los tags. No mergees a `main` salvo que te lo pida.
