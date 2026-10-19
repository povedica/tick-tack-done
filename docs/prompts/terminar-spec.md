# Prompt: terminar lo que queda de la spec

Pega esto en un chat nuevo de Cursor, con el repo en `main` ya actualizado (PR #12 mergeada).

---

Termina lo que `docs/spec/especificacion-producto-v1.1.md` deja pendiente después de la PR #12. Una sola rama, `feat/terminar-spec`, y una sola PR contra `main`. No reabras la fase 1, la PR #12 ni la sección 21. No publiques la spec como v1.2. No resucites la PR #9.

Lee primero `docs/handoff.md` (cierre de V1 y V2), `docs/roadmap.md`, `AGENTS.md`, `.cursor/rules/` y, de la spec, RF-2003, RF-2004, RF-2005, RF-1704 y la sección 19. La fuente de verdad es esa spec. No leas ni cites `docs/spec/tick-tack-done-ui-spec-v1.0*.md` ni `docs/spec/cursor-prompt-ui-look-v1.2.md`.

En cuanto haya un commit, abre el PR contra `main`. Al dejarlo cerrado, la CI tiene que estar en verde. No mergees salvo que te lo pida. Español en docs y UI, inglés en el código. Commits pequeños, Conventional Commits, sin `--no-verify` ni amend.

## Qué ya está y no se reabre

Fase 1 en `main` (PR #11, tag `phase-1`). Sistema visual en `main` (PR #13). V1 y V2 de la sección 19 en `main` (PR #12, tags `phase-v1` y `phase-v2`). Kanban, timeline, matriz, calendario e iCal, notas, dashboard, reporte, revisión, webhooks, automatizaciones, SSE, `/open/v1`, CSV, 2FA, colaboración, Pomodoro, plugins y logros ya tienen superficie. No los reescribas.

`apps/api/tsconfig.json` sigue en NodeNext. No lo reviertas a CommonJS. La CI compila `packages/domain` antes del lint y de los tests. No quites ese paso. Prisma 6.19. `scripts/with-env.sh` pisa `DATABASE_URL`. Todo constructor de Nest con dependencias lleva `@Inject`. Los módulos de dominio no se importan entre sí. Solo el scheduler materializa recurrencias y dispara recordatorios. Cobertura de `packages/domain` por encima del 80 %. La web llama a la API solo a través de `@reflexionia/sdk`. Si cambia un endpoint: `pnpm --filter api build && pnpm --filter api openapi:generate` y `pnpm --filter @reflexionia/sdk generate`, con `SCHEDULER_AUTOSTART=false` y `BUS_AUTOSTART=false`.

El consentimiento de Google ya guarda `google_refresh_token` y el correo en el usuario. No vuelvas a pedir `GOOGLE_REFRESH_TOKEN` a mano. En local la cuenta ya está conectada; los secretos están en `.env` y no se commitean ni se imprimen. `APP_WEB_URL` local es `http://127.0.0.1:5173`.

## Qué entra en esta PR

1. **Telegram (RF-2003), de verdad.** El sondeo `scripts/telegram-poll.mjs` es solo de desarrollo. El webhook `POST /api/v1/integrations/telegram/webhook` tiene que crear la tarea, contestar en el chat y dejar de responder `called_telegram: false`. Conserva los comandos que ya parsea el dominio: `/capturar` y `/add` con el quick add, `/hoy`, `/manana`, `/semana`, `/lista`, `/lista #etiqueta` y `/lista !alta`. Añade voz (transcripción y luego el mismo NLP), foto como adjunto, completar una tarea desde el chat sin pedir un UUID, y los recordatorios por Telegram. La lista puede seguir siendo texto con enlace a la PWA; si el enlace tiene que abrirse en el teléfono, `APP_WEB_URL` tiene que ser el origen público. No imprimas `TELEGRAM_BOT_TOKEN`.

2. **Google Calendar (RF-2004 y two-way de V2).** Lee y escribe con el refresh token guardado en el usuario. La variable de entorno solo es respaldo. No pegues un token nuevo.

3. **Google Drive (RF-2005).** Adjuntar un archivo de Drive a una tarea (enlace o copia) y volcar el backup diario (RF-1704) a la carpeta que ya apunta `GOOGLE_DRIVE_FOLDER_ID`. Hoy `scripts/backup.sh` avisa y no llama a Google: `BACKUP_REMOTE` sigue siendo rclone y está vacío.

4. **Copia fuera de la máquina (RF-1704) y despliegue.** Si hay destino y acceso al VPS, publica en `todo.reflexionia.com` según `docs/deployment.md`, sin `AUTH_MODE=dev`. Si falta el destino o el acceso, no inventes secretos ni entres por SSH a ciegas: deja el mecanismo listo y dilo.

## Qué no entra

RF-1701 (importador externo) sigue aplazado. Apps nativas y widgets de iOS/Android no entran. No cambies el look. No publiques la spec como v1.2. La sección 21 no se toca.

## Cierre

Actualiza `docs/handoff.md` y `docs/roadmap.md`, y la nota de estado de la sección 19, diciendo qué quedó hecho y qué siguió fuera. Push de la rama y del PR. No mergees a `main` salvo que te lo pida.
