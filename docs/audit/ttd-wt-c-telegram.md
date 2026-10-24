# Paquete C · Telegram por usuario y notificaciones: estado único, gestión completa y matriz coherente

- **Repo:** povedica/tick-tack-done · **Base:** `main` en `318fbd9` (incluye la PR #76, «per-user Telegram»)
- **Rama/worktree:** `git worktree add ../ttd-wt-c -b codex/wt-c-telegram main`
- **PR:** `fix(wt-c): Telegram por usuario — estado único, gestión y entrega coherente`
- **Prioridad:** **P1 (urgente)**. Hoy los avisos por Telegram de Pablo se pierden en silencio.
- **Tamaño:** M-L (3 puntos: API + migración + web)
- **Rutas:** las líneas son de `318fbd9`.

## 1. Objetivo y contexto

Pablo, 23/10/2026: «Lo de Telegram está mal. Lo he cambiado para que cualquier usuario pueda conectar su bot de Telegram con su token, pero creo que sigue teniendo guardado el anterior y no permite gestionar».

**Diagnóstico confirmado** (API de producción en solo lectura, el 23/10/2026 a las 21:15, hora de Madrid):

- `GET /api/v1/integrations/telegram` → `configured:false`, `source:"none"`, `webhook_state:"unconfigured"`, `linked:false`, **pero** `status:"connected"` y `linked_at:"2026-10-18T17:03Z"`. El vínculo es del bot global anterior; el TelegramLink no se migró.
- `GET /me/notification-settings` → `telegram.linked:true`, `status:"connected"` (solo mira el `TelegramLink`).
- `send_test_notification` → `push_not_configured` (push no está configurado en producción). No se envió nada por Telegram.
- `POST /api/v1/integrations/telegram/webhook` (global) → `410 telegram_user_bot_required`. Telegram sigue reintentando contra él si el bot antiguo conserva ese webhook.

**Prueba UI de r80** (23/10/2026):

- **102:** push muestra «Bloqueado en el navegador» en vez de «No configurado»; Telegram muestra un punto gris y un «@» sin nombre.
- **103:** la tarjeta Telegram dice «Sin vincular» y «Sin configurar», con el campo del token y «Guardar bot» deshabilitado (hasta escribir). No hay forma de quitar el vínculo antiguo.

## 2. Reglas de trabajo en paralelo (obligatorias)

Este paquete se trabaja **a la vez que otros 4**, cada uno en su propio worktree. Ninguno depende de que otro se haya fusionado. Para que el merge sea limpio:

1. **Base y rama.**
   - Parte de `main` actualizado: `318fbd9` o posterior; producción está en `318fbd9`.
   - Crea el worktree: `git worktree add ../ttd-wt-c -b codex/wt-c-telegram main`.
   - **Una PR** con un commit por punto: `fix(TTD-AUD-NNN): …` o `feat(TTD-AUD-NNN): …`.
2. **Ficheros.**
   - Solo puedes modificar los de la sección «Ficheros que PUEDE tocar». Puedes crear ficheros nuevos dentro de esas carpetas.
   - Si necesitas tocar un fichero de «NO debe tocar», **para**: busca una alternativa local (envolver, componer, CSS con más especificidad en tu propio fichero) o déjalo anotado en la PR como «pendiente de otro paquete». No lo edites.
3. **Sin dependencias nuevas.** No toques `package.json`, `pnpm-lock.yaml`, `.github/` ni `CHANGELOG.md`. La entrada de changelog va en la descripción de la PR; Pablo la consolida al fusionar.
4. **i18n.**
   - **No edites** `apps/web/src/i18n/es.ts`, `en.ts` ni `extra.ts`: todos los paquetes web chocarían ahí.
   - Crea `apps/web/src/features/settings/i18n-wt-c.ts` con `const es = {…}` y `const en = {…}` (mismas claves) y un hook `useWtCMessages()`.
   - El hook usa `useLocale` de `apps/web/src/i18n/locale.ts` y elige igual que `messagesFor()` (`es` salvo que el locale empiece por `en`).
   - Añade un spec junto al fichero que compruebe que `es` y `en` tienen las mismas claves.
   - Puedes **leer** las claves existentes con `useMessages()`.
5. **Tokens CSS.**
   - **No edites** `apps/web/src/styles/tokens.css`.
   - Los tokens nuevos van en `apps/web/src/features/settings/telegram-wt-c.css` (`:root {…}` y `[data-theme='dark'] {…}`), importado desde tu componente.
   - Usa nombres con prefijo de tu zona para no pisar otros tokens.
6. **Tests e2e.**
   - No edites `playwright.r80.config.ts` ni `e2e/r80.fixture.ts`.
   - Crea `apps/web/playwright.wt-c.config.ts` (copia de `playwright.r80.config.ts`) con:
     - `testMatch: 'wt-c-*.spec.ts'`;
     - puerto **4193**;
     - proyectos de **360×780, 390×844, 768×1024 y 1280×800**, en claro y oscuro, llamados `wt-c-<ancho>-<light|dark>`.
   - Specs en `apps/web/e2e/wt-c-*.spec.ts` y datos en `apps/web/e2e/wt-c.fixture.ts`.
   - **Ojo:** `apps/web/playwright.config.ts` (`testDir: './e2e'`, sin `testMatch`) también recoge tus specs. Deben pasar también con esa config, o saltarse con `test.skip(!testInfo.project.name.startsWith('wt-c'), …)` si dependen de los anchos de tu config. **No edites** `playwright.config.ts`.
7. **API y BD.**
   - Si cambias rutas o DTO de la API, regenera **al final** con `pnpm --filter api build && pnpm --filter api openapi:generate && pnpm --filter @reflexionia/sdk generate`.
   - Haz commit de `apps/api/openapi.json`, `apps/api/src/mcp/api-operations.json` y `packages/sdk/src/generated/schema.d.ts` **en un commit aparte** `chore(api): regenerate openapi`. No los edites a mano.
   - Si al rebasar chocan, quédate con la versión de `main` y vuelve a generarlos.
   - Para los tests de integración usa una BD propia: `DATABASE_URL=…/ttd_wt_c`.
8. **Evidencias:** `test-artifacts/audit/evidencias/wt-c/<ID>_<pantalla>_<antes|despues>_<ancho>_<light|dark>.png`. Pon una tabla por punto en la PR.
9. **Verificación antes de la PR:**
   - `pnpm format:check`, `pnpm lint`, `pnpm typecheck` y `pnpm test`.
   - Los e2e propios: `pnpm --filter web exec playwright test -c playwright.wt-c.config.ts`.
   - `pnpm test:integration` si tocas la API.
   - Recorre cada criterio en la PR: «✅ cómo/ancho» o «❌ por qué».
10. **KISS:** el cambio mínimo que cumpla los criterios. Sin refactors fuera del alcance. Lo que no puedas reproducir, documéntalo en la PR con evidencia («a verificar»).

## 3. Puntos (orden de commits)

| Orden | ID                 | Prio | Título                                                                                                             | Tamaño |
| ----- | ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------ | ------ |
| 1     | TTD-AUD-125 (+114) | P1   | Telegram por usuario: estado único, migración del legado, acciones de gestión, webhook seguro y entrega con motivo | L      |
| 2     | TTD-AUD-135        | P2   | Matriz de notificaciones: push «No configurado» y Telegram sin «@» vacío                                           | S      |

TTD-AUD-114 («estado incoherente entre `/integrations/telegram` y los ajustes de notificaciones») queda **absorbido** por 125: se resuelve con `telegramState()`. TTD-AUD-115 (canal por defecto `push` al crear recordatorios) es del **paquete D**, porque vive en `tasks.service.ts`. **No lo toques aquí.**

### 3.1 TTD-AUD-125 (especificación completa)

##### TTD-AUD-125 · P1 · Telegram por usuario: el vínculo heredado del bot global deja un estado incoherente y no se puede gestionar

**Diagnóstico** (repo en `318fbd9`, PR #76; producción leída por API el 23/10/2026 a las 21:15, hora de Madrid):

1. **Modelo de datos**
   - **Bot por usuario:** `TelegramBotConfiguration` (`prisma/schema.prisma:1283-1296`).
     - `token` y `webhookSecret` se guardan cifrados con `sealField` (`telegram-settings.service.ts:122-123`).
     - `botId` es único: un bot solo puede pertenecer a una cuenta.
     - `webhookUrl` es por usuario: `${PUBLIC_URL}/api/v1/integrations/telegram/webhook/{ownerId}` (`telegram-settings.service.ts:186`).
   - **Vinculación del chat:** `TelegramLink` (`schema.prisma:1298-1312`): `chatId`, `status` (por defecto `connected`) y `deletedAt`. **No guarda con qué bot se vinculó.**
   - **Legado:**
     - El código ya no lee `TELEGRAM_BOT_TOKEN` ni `TELEGRAM_WEBHOOK_SECRET`; se quitaron de `.env.example` y de `telegram-secret.ts`.
     - Aun así, `runtime-config.ts` no avisa si siguen definidas en el entorno de producción. No se puede verificar desde fuera.
     - El webhook global `POST /api/v1/integrations/telegram/webhook` responde **410** `telegram_user_bot_required` (`integrations.controller.ts:310-323`; comprobado con curl anónimo).
   - **Migración** `20261023130823_add_telegram_bot_configuration`: solo crea la tabla y cambia el índice único de `telegram_links` a `(owner_id, chat_id)`. **No migra ni limpia** los `telegram_links` creados con el bot global.
   - En producción: `linked_at 2026-10-18T17:03Z`, `status connected` y `deletedAt null`, sin `TelegramBotConfiguration`.

2. **Origen de cada campo del estado**

   | Campo           | Endpoint                     | Cálculo                                                                                                   | Valor actual        |
   | --------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------- |
   | `configured`    | `GET /integrations/telegram` | existe `TelegramBotConfiguration` (`telegram-settings.service.ts:24`)                                     | `false`             |
   | `source`        | `GET /integrations/telegram` | `none` o `settings` (`telegram-settings.service.ts:25`)                                                   | `none`              |
   | `webhook_state` | `GET /integrations/telegram` | `telegram-settings.service.ts:29-30`                                                                      | `unconfigured`      |
   | `status`        | `GET /integrations/telegram` | `link?.status ?? 'not_linked'`: viene del `TelegramLink` heredado (`integrations.controller.ts:178`)      | `connected`         |
   | `linked_at`     | `GET /integrations/telegram` | `integrations.controller.ts:177`                                                                          | `2026-10-18T17:03Z` |
   | `linked`        | `GET /integrations/telegram` | `status.configured && link !== null` (`integrations.controller.ts:183`)                                   | `false`             |
   | `linked`        | ajustes de notificaciones    | `!!telegram`, **solo mira `TelegramLink`, no el bot** (`notifications/notifications.service.ts:33,59-60`) | «vinculado»         |

   **La contradicción:** hay dos fuentes y tres cálculos distintos.
   - `deliver.ts:43-44` también usa `linked = !!link`. Por eso la matriz activa Telegram por defecto (`notificationDefault`, `packages/domain/src/reminders/preferences.ts:16-21`; web `NotificationsPage.tsx:118,200`).
   - Luego el transporte no tiene token (`scheduler/reminder.transport.ts:164-172`) y devuelve `skipped` **sin motivo**.
   - Resultado: los avisos por Telegram se pierden en silencio. `send_test_notification` tropezaría con `telegram_not_configured` 503 (`notifications.service.ts:124-125`).

3. **Por qué la UI no deja gestionarlo** (`web/src/features/settings/TelegramCard.tsx`)
   - `linked = data.linked` (`:47`) es `false`, así que no se pinta el bloque «Conectado como…» ni «Desvincular» (`:143-209`).
   - Como `configured` es `false`, tampoco sale el emparejamiento (`:210`) y queda «Sin configurar» (`:253`).
   - **El vínculo heredado no se puede borrar desde la UI.** La API tiene `DELETE /integrations/telegram`, pero solo borra los chats, y su `farewell` no tiene token con el que enviar.
   - **No existe** un endpoint para quitar o reemplazar el bot (`TelegramBotConfiguration`).
   - **Reutilizar el bot antiguo falla:**
     - `save()` llama a `getWebhookInfo`. Si el bot sigue apuntando al webhook global, `webhook.url ≠ url` y lanza **409 `telegram_webhook_in_use`** (`telegram-settings.service.ts:83-100`).
     - El formulario solo muestra el error genérico `telegramBotSaveError` (`TelegramBotSettings.tsx:81`), así que Pablo no sabe que el problema es el webhook antiguo.
     - Mientras tanto, Telegram sigue reintentando contra el 410.
   - **Webhook por usuario:** sí, con ruta `/webhook/{ownerId}` y `secret_token` aleatorio de 32 bytes por bot (`telegram-settings.service.ts:77-80,144-149`), comprobado en `integrations.controller.ts:202-240`.
   - **Otros problemas:**
     - `getMe`, `getWebhookInfo` y `setWebhook` se ejecutan **dentro** de una transacción de hasta 40 s.
     - Falta `drop_pending_updates`.
     - Si el token deja de valer después, no hay ningún estado `error`.

**Comportamiento esperado (KISS):**

1. **Una sola fuente de estado.** Una función `telegramState(ownerId)` devuelve exactamente uno de `none | token_saved | webhook_ok | linked | blocked | error`. La usan `GET /integrations/telegram`, los ajustes de notificaciones, `deliver.ts` y la web.
   - «linked» = `TelegramBotConfiguration` existe **y** su webhook está OK **y** hay un `TelegramLink` activo **del mismo `botId`**.
   - Añadir `TelegramLink.botId` (nullable): los vínculos con `botId null` son legado.
2. **Migración de limpieza:** marcar `deletedAt = now()` en los `telegram_links` activos de los dueños sin `TelegramBotConfiguration`. Hacerlo con un evento `telegram.legacy_unlinked` y sin enviar mensajes.
3. **Acciones en la tarjeta según el estado:**

   | Estado                  | Acciones                                                 |
   | ----------------------- | -------------------------------------------------------- |
   | `none`                  | «Conectar bot» (token)                                   |
   | `token_saved` / `error` | «Reintentar webhook», «Reemplazar token», «Quitar bot»   |
   | `webhook_ok`            | QR/enlace de emparejamiento, «Reemplazar», «Quitar bot»  |
   | `linked`                | «Probar», «Desvincular chat», «Reemplazar», «Quitar bot» |
   - Nuevo `DELETE /integrations/telegram/settings`: llama a `deleteWebhook` (sin error si falla), borra la configuración y los vínculos.

4. **Al guardar el token:**
   - **Fuera** de la transacción: validar con `getMe`, mirar `getWebhookInfo`, y luego `setWebhook {url, secret_token, allowed_updates, drop_pending_updates:true}`.
   - Si la URL actual es el **webhook global retirado de este mismo `PUBLIC_URL`**, se puede tomar sin pedir nada.
   - Si es otra URL, devolver 409 con un mensaje claro y la opción «Tomar el control del bot» (`force:true`, que llama a `deleteWebhook`).
   - La transacción solo escribe en la BD.
5. **Errores visibles:** la web muestra el `code` concreto (`telegram_token_invalid`, `telegram_bot_in_use`, `telegram_webhook_in_use`, `telegram_configuration_failed`).
6. **Entrega:** si el estado no es `linked`, el canal Telegram queda **deshabilitado en la matriz** y `deliver` registra `skipped` con el motivo `not_configured` o `not_linked`. Nunca `skipped` sin motivo.
7. **Entorno:** `runtime-config.ts` registra un aviso si existen `TELEGRAM_BOT_TOKEN` o `TELEGRAM_WEBHOOK_SECRET` («ignorado: Telegram es por usuario»). Hay que quitarlas del `.env` de producción.

**Paso para que Pablo limpie su estado actual de forma segura** (tras desplegar):

1. Ajustes → Integraciones → Telegram. Con la migración, la tarjeta debe mostrar «Sin configurar» y la matriz Telegram deshabilitada (motivo «sin configurar»).
2. Pegar el token del bot (el antiguo o uno nuevo de BotFather) y pulsar «Conectar».
   - Con el bot antiguo, el servidor detecta el webhook global retirado y lo reemplaza.
   - Si avisa de «otra URL», usar «Tomar el control».
3. Escanear el QR o abrir `t.me/<bot>?start=<código>` y esperar a «Conectado como @…».
4. Pulsar «Probar»: el mensaje llega en ≤ 10 s.
5. Quitar `TELEGRAM_BOT_TOKEN` y `TELEGRAM_WEBHOOK_SECRET` del `.env` de producción y reiniciar.
6. No hace falta revocar el token en BotFather salvo que se crea filtrado. Si se revoca, repetir el paso 2 con el nuevo.

**Criterios de aceptación:**

- [ ] La migración convierte un usuario con `TelegramLink` activo y sin `TelegramBotConfiguration` en `deletedAt != null` (test de migración). `GET /integrations/telegram` → `state:"none"`, `linked:false`. `GET /me/notification-settings` → `telegram.linked:false`, `status:"not_configured"`.
- [ ] Los tres consumidores (estado de la integración, ajustes de notificaciones y `deliver`) usan `telegramState`. Un test con 6 escenarios (uno por estado) da el mismo resultado en los tres.
- [ ] `PUT /integrations/telegram/settings`:
  - [ ] Token mal formado → 400 `telegram_token_invalid`.
  - [ ] `getMe` falla → 400 `telegram_token_invalid`.
  - [ ] El bot es de otra cuenta → 409 `telegram_bot_in_use`.
  - [ ] Webhook global retirado del mismo origen → 200 y `setWebhook` llamado con `secret_token` y `drop_pending_updates:true`.
  - [ ] Otra URL sin `force` → 409 `telegram_webhook_in_use`; con `force:true` → 200.
  - [ ] Ninguna llamada a Telegram se hace dentro de `prisma.$transaction` (test con un mock que lo comprueba).
- [ ] `DELETE /integrations/telegram/settings` → 204: se llama a `deleteWebhook`, la configuración y los vínculos quedan borrados y el estado es `none`. Si `deleteWebhook` falla → sigue siendo 204 y se registra un aviso.
- [ ] Un vínculo creado con el bot A no cuenta como `linked` tras configurar el bot B (`TelegramLink.botId`).
- [ ] La web muestra las acciones de la tabla según el estado, y el mensaje concreto de cada `code` de error (test de `TelegramBotSettings` y `TelegramCard`).
- [ ] La matriz de notificaciones deshabilita Telegram si el estado no es `linked`. Un recordatorio con Telegram no `linked` → historial `skipped` con motivo `not_configured` o `not_linked`.
- [ ] Ninguna respuesta, log ni evento contiene el token ni el secreto (test con grep sobre los logs del e2e).
- [ ] `runtime-config` avisa si existe `TELEGRAM_BOT_TOKEN` en producción.
- [ ] e2e completo con un falso Telegram: conectar, emparejar, probar, reemplazar y quitar.
- [ ] Capturas a 1280×800 y 390×844 de los estados `none`, `webhook_ok`, `linked` y `error`.

**Precisiones para trabajar en paralelo:**

- **`scheduler/scheduler.service.ts` es del paquete D.** Hoy pasa `telegramChatId` del primer `TelegramLink` (`:937`).
  - No lo cambies. Haz que `scheduler/reminder.transport.ts` (de C) resuelva el chat válido por su cuenta con `telegramState(ownerId)`: usa el `chatId` del vínculo activo **del bot configurado** e ignora el que llega si no coincide.
  - Devuelve `skipped` **con motivo** (`not_configured`, `not_linked`, `blocked`, `disabled_by_user`) para que `deliver.ts` lo registre.
- **Migración:** nombre único `apps/api/prisma/migrations/20261024100000_telegram_link_bot_id_cleanup/migration.sql`. Es la **única** migración de los 5 paquetes. Contenido:
  1. `ALTER TABLE telegram_links ADD COLUMN bot_id TEXT NULL;`
  2. `UPDATE telegram_links SET deleted_at = now() WHERE deleted_at IS NULL AND owner_id NOT IN (SELECT owner_id FROM telegram_bot_configuration);` (legado sin bot).
  3. Rellenar `bot_id` en los vínculos activos de dueños con bot configurado: `UPDATE … SET bot_id = c.bot_id FROM telegram_bot_configuration c WHERE …`.
  - Añade su script de rollback en `scripts/rollback-telegram-link-bot-id.sql`.
- **Evento nuevo** `telegram.legacy_unlinked@v1` en `apps/api/src/events/domain-events.ts` (de C). Regístralo desde un script idempotente `apps/api/scripts/telegram-legacy-cleanup.ts`, porque SQL puro no emite eventos. O bien documenta en la PR que la migración no emite evento y por qué.
- **Secretos:** ni el token ni el `webhook_secret` aparecen en respuestas, logs, eventos ni errores. Ya están cifrados con `sealField` (`telegram-settings.service.ts:122-123`); mantenlo así.

#### TTD-AUD-135 · P2 · Matriz de notificaciones: push «No configurado» y Telegram sin «@» vacío

**Observado:** en `/settings/notifications`, la fila Push dice «Bloqueado en el navegador» aunque el servidor no tiene push configurado (`channels.push.configured:false`, `public_key` vacía). La fila Telegram muestra «@» sin nombre y un punto gris.

**Causa:**

- `apps/web/src/features/settings/NotificationsPage.tsx:29-31,48` calcula el estado de push **solo con `Notification.permission`** y no mira `channels.push.configured`.
- `:181-195` pinta `@${username}` siempre que `telegram.linked`, aunque `username` sea `null`, que es lo que pasa con el vínculo heredado (`notifications.service.ts:59-61`).

**Cambio propuesto:**

- **Push:**
  - si `channels.push.configured !== true` → texto «No configurado en el servidor» (clave nueva), interruptores de push **deshabilitados** con `title` explicativo, y «Probar» deshabilitado;
  - si está configurado → la lógica actual del permiso del navegador.
- **Telegram:** con el estado único de 125:
  - `linked` con `username` → «@usuario»;
  - `linked` sin `username` → `display_name` o «Conectado»;
  - en otro caso, el texto del estado (`none` → «Sin configurar», `token_saved`/`webhook_ok` → «Pendiente de vincular», `blocked` → «Bloqueado», `error` → «Error: revisa la configuración»).
  - El punto de color sigue al estado: verde `linked`, ámbar pendiente, rojo `blocked`/`error`, gris `none`.
  - Nunca se pinta «@» sin nombre.

**Criterios de aceptación:**

- [ ] Con `channels.push.configured:false` (mock): la fila Push dice «No configurado en el servidor»; sus interruptores y «Probar» están `disabled`.
- [ ] Con `configured:true` y `Notification.permission='denied'`: «Bloqueado en el navegador» (como hoy).
- [ ] Telegram `linked` sin `username` → no aparece el texto «@» suelto (`expect(row).not.toHaveText(/^@$/)`).
- [ ] Cada uno de los 6 estados de 125 muestra su texto y su color (test de componente).
- [ ] 1280×800: la matriz se ve entera sin scroll horizontal. 390×844: columnas fijas y filas con scroll, sin cortes. Claro y oscuro.

**Tests:** unit `NotificationsPage.spec.tsx` con los estados; e2e `wt-c-notifications.spec.ts`.

## 4. Ficheros que PUEDE tocar (propiedad exclusiva de C)

**API:**

- `apps/api/src/modules/integrations/integrations.controller.ts`: rutas `telegram*`. Las rutas Google no cambian; nadie más toca este fichero.
- `apps/api/src/modules/integrations/telegram-*.ts`, `focus-telegram.listener.ts` e `integrations.module.ts`.
- `apps/api/src/integrations/telegram-configuration.ts`, `telegram-secret.ts`, `config.ts` (solo `telegramConfigured`) y el nuevo `telegram-state.ts`.
- `apps/api/src/notifications/**`: `notifications.service.ts`, `deliver.ts`…
- `apps/api/src/scheduler/reminder.transport.ts`.
- `apps/api/src/events/domain-events.ts`: solo el evento nuevo.
- `apps/api/src/security/runtime-config.ts`: aviso de variables Telegram heredadas.
- `apps/api/prisma/schema.prisma` (`TelegramLink.botId`) + la **nueva** migración `20261024100000_telegram_link_bot_id_cleanup`.
- `apps/api/scripts/telegram-legacy-cleanup.ts` (nuevo), `scripts/rollback-telegram-link-bot-id.sql` (nuevo), `scripts/telegram-*.mjs`.
- `.env.example`: solo comentarios de Telegram.
- `packages/domain/src/reminders/preferences.ts` (`notificationDefault` recibe el estado en vez de un booleano, o equivalente).
- `apps/api/test/telegram-*.e2e-spec.ts`, `notification-*.e2e-spec.ts` y el nuevo `wt-c-*.e2e-spec.ts`.

**Web:**

- `apps/web/src/features/settings/TelegramCard.tsx`, `TelegramBotSettings.tsx` (+ specs), `NotificationsPage.tsx`, `telegram.css`, `notifications.css`, `LegacyNotificationSettings.tsx`.
- `apps/web/src/api.ts`: **solo C** edita este fichero. Métodos nuevos: `removeTelegramBot`, `retryTelegramWebhook`… Añádelos **al final** del objeto, en un bloque comentado `// wt-c`.
- `packages/sdk/src/resources.ts`: solo C.

**Ficheros nuevos web:**

- `apps/web/src/features/settings/i18n-wt-c.ts` + spec;
- `apps/web/playwright.wt-c.config.ts` (puerto 4193), `e2e/wt-c-*.spec.ts` y `e2e/wt-c.fixture.ts`.

**Generados** (solo regenerar, commit aparte): `apps/api/openapi.json`, `apps/api/src/mcp/api-operations.json` y `packages/sdk/src/generated/schema.d.ts`.

## 5. Ficheros que NO debe tocar

| Fichero o carpeta                                                                                                    | Propietario                   |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `apps/api/src/scheduler/scheduler.service.ts`                                                                        | D                             |
| `apps/api/src/modules/tasks/**` (incluido el canal por defecto de recordatorios, TTD-AUD-115)                        | D                             |
| `apps/api/src/mcp/**` (salvo `api-operations.json` regenerado)                                                       | D                             |
| `apps/api/src/drive/**`, `modules/planning/**`, `modules/search/**`                                                  | D                             |
| `apps/api/src/modules/focus/**`, `modules/reports/**`, `reading/**`, `modules/stats/**`                              | E                             |
| `apps/web/src/features/settings/DriveCard.tsx`, `GoogleCalendarsCard.tsx`, `FocusSettingsPage.tsx`, `AboutPage.tsx`  | E (las tres primeras) / nadie |
| `apps/web/src/features/product/**` (incluido `ProductPages.tsx`, que solo **renderiza** `<TelegramCard/>`)           | E                             |
| `apps/web/src/components/**`, `features/calendar/**`, `features/places/**`, `features/tasks/**`, `features/today/**` | A / B / E                     |
| `apps/web/src/i18n/es.ts`, `en.ts`, `extra.ts`, `styles/tokens.css`                                                  | nadie                         |
| `package.json`, `pnpm-lock.yaml`, `CHANGELOG.md`, `.github/**`                                                       | nadie                         |

## 6. Cómo evitar conflictos (específico de C)

- **Única migración Prisma de esta ronda.** Si al rebasar aparece otra migración posterior en `main`, renombra la carpeta a un timestamp posterior y vuelve a ejecutar `prisma migrate dev --create-only` para comprobar el orden. No edites migraciones existentes.
- **`schema.prisma`:** solo el modelo `TelegramLink` (campo `botId String? @map("bot_id")` + índice `@@index([ownerId, botId])`).
- **`api.ts`:** bloque propio al final. Ningún otro paquete lo edita.
- **OpenAPI/SDK:** commit aparte y regenerado. En conflicto, quédate con `main` y vuelve a generar.
- **`notificationDefault`** (`packages/domain`) lo usa también la web (`NotificationsPage.tsx:118`, de C). Si cambias su firma, mantén una sobrecarga compatible con `boolean`, para no romper compilaciones de otras ramas que no lo usan.

## 7. Tests a añadir

| Tipo                  | Fichero                                                                               | Qué cubre                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit API              | `integrations/telegram-state.spec.ts`                                                 | los 6 estados a partir de (config, webhook, link.botId, status)                                                                                                                                     |
| Unit API              | `modules/integrations/telegram-settings.service.spec.ts` (ampliar)                    | token mal formado; `getMe` falla; bot de otra cuenta; webhook global retirado del mismo origen (lo toma); otra URL sin/con `force`; **ninguna llamada a Telegram dentro de `$transaction`**         |
| Unit API              | `notifications/deliver.spec.ts`                                                       | `skipped` con motivo en cada estado no `linked`                                                                                                                                                     |
| Integración (e2e API) | `test/wt-c-telegram.e2e-spec.ts`                                                      | conectar → emparejar (`/start <código>` con un falso Telegram) → probar → reemplazar → quitar bot; migración de legado; ningún token en las respuestas ni en los logs (grep del bot token simulado) |
| Migración             | `test/wt-c-migration.e2e-spec.ts`                                                     | usuario con link y sin config → `deleted_at` no nulo; usuario con config → `bot_id` relleno                                                                                                         |
| Unit web              | `TelegramCard.spec.tsx`, `TelegramBotSettings.spec.tsx`, `NotificationsPage.spec.tsx` | acciones por estado; mensaje por `code` de error; 135                                                                                                                                               |
| e2e web               | `e2e/wt-c-telegram.spec.ts`, `e2e/wt-c-notifications.spec.ts`                         | 360/390/768/1280, claro/oscuro; capturas de los estados `none`, `webhook_ok`, `linked` y `error`                                                                                                    |

## 8. Checklist de verificación manual (tras desplegar C)

| #   | Dónde                                         | Qué comprobar                                                                                                                 |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | `GET /api/v1/integrations/telegram` (lectura) | `state:"none"`, `linked:false`, sin `status:"connected"` heredado.                                                            |
| 2   | `/settings/notifications`                     | Telegram «Sin configurar», con sus interruptores deshabilitados; push «No configurado en el servidor» mientras no haya VAPID. |
| 3   | `/settings/integrations` → Telegram           | Campo de token + «Conectar». Si se pega un token inválido, sale un mensaje concreto.                                          |
| 4   | **Limpieza manual de Pablo**                  | Seguir los pasos de la sección 9.                                                                                             |
| 5   | Tras vincular                                 | «Conectado como @…» en ≤ 3 s sin recargar; «Probar» llega en ≤ 10 s; un recordatorio de prueba a 1 min llega por Telegram.    |
| 6   | Tras «Quitar bot»                             | Estado `none`; un recordatorio posterior → historial `skipped`, motivo `not_configured`.                                      |
| 7   | 390 px                                        | Tarjeta sin QR, con botón «Abrir Telegram» de 44 px.                                                                          |

## 9. Limpieza manual del estado de Pablo (tras desplegar C, en este orden)

1. **Comprobar el estado** en Ajustes → Integraciones → Telegram. Debe decir «Sin configurar»: la migración ya ha retirado el vínculo heredado. En Ajustes → Notificaciones, Telegram debe estar deshabilitado con el motivo «Sin configurar».
2. **Conectar el bot:** pegar el token del bot (el antiguo o uno nuevo creado en BotFather) y pulsar «Conectar».
   - Con el bot antiguo, el servidor detecta el webhook global retirado de `todo.reflexionia.com` y lo reemplaza solo.
   - Si avisa de que el webhook apunta a «otra URL», usar «Tomar el control» solo si ese bot no se usa en otro entorno (por ejemplo, staging).
3. **Emparejar:** escanear el QR, o abrir `t.me/<bot>?start=<código>` desde el móvil, y esperar a «Conectado como @…».
4. **Probar:** pulsar «Probar» en Telegram. Debe llegar en ≤ 10 s y la UI debe mostrar «Enviado ✓».
5. **Limpiar el servidor:** quitar `TELEGRAM_BOT_TOKEN` y `TELEGRAM_WEBHOOK_SECRET` del `.env` de producción, si siguen, y reiniciar la API. El arranque ya no debe mostrar el aviso «variables de Telegram heredadas ignoradas».
6. **Revocar el token** en BotFather (`/revoke`) solo si se cree filtrado. Si se hace, repetir el paso 2 con el token nuevo.

**No** hay que tocar la base de datos a mano ni llamar a la API de Telegram con `curl`: así se evita exponer el token en el historial de la shell.

## 10. Prompt para Codex (también en `ttd-wt-c-telegram-prompt.txt`)

```text
Trabaja en el repo povedica/tick-tack-done.
Crea un worktree propio desde main actualizado (318fbd9 o posterior):
  git worktree add ../ttd-wt-c -b codex/wt-c-telegram main
Copia en el repo docs/audit/ttd-wt-c-telegram.md (este documento). Si docs/ no existe, usa test-artifacts/audit/.
Léelo entero: es autónomo y es la única fuente de requisitos.

Objetivo: Telegram por usuario (estado único, gestión, migración del legado) y matriz de notificaciones coherente.
Puntos: TTD-AUD-125 (+114), 135.

Reglas clave:
- Este paquete se desarrolla EN PARALELO con otros 4 paquetes (A–E) en otros worktrees.
- Modifica SOLO los ficheros de «Ficheros que PUEDE tocar».
- NO edites los de «NO debe tocar», ni i18n/es.ts, en.ts o extra.ts, ni styles/tokens.css, package.json, pnpm-lock.yaml, CHANGELOG.md o .github/.
- i18n en tu fichero propio. Tokens CSS en tu fichero propio. Playwright con tu config y tu puerto.
- OpenAPI/SDK solo regenerados, en un commit aparte.
- Una PR «fix(wt-c): Telegram por usuario (estado único, gestión, migración del legado) y matriz de notificaciones coherente», con un commit por punto en el orden de la sección 3.
- Tests unitarios, de integración y e2e según el documento. Capturas antes/después a 360/390/768/1280, claro y oscuro, donde aplique.
- pnpm format:check, lint, typecheck, test, los e2e propios (y test:integration si tocas la API), todo en verde.
- En la PR, recorre cada criterio de aceptación con ✅/❌ y evidencia.
- KISS. No inventes datos: lo que no reproduzcas, anótalo como «a verificar» con evidencia.
```

## Apéndice de implementación C

RF-2003/2006 y RF-802/808. Evento nuevo `telegram.legacy_unlinked@v1`: `link_id` y `reason: legacy_bot_removed`, sin mensajes ni credenciales. La migración escribe el outbox y ActivityLog en SQL transaccional; el script idempotente cubre cualquier vínculo legado activo posterior.

El valor interno vacío de `TelegramBotConfiguration.webhookUrl` representa error de registro; NULL representa token guardado/local. La API normaliza el marcador vacío a `webhook_url:null`. Consultar estado no realiza llamadas de red.

El rollback revierte columna e índice y conserva la retirada de vínculos legados por seguridad. La recuperación completa de datos requiere backup previo; nunca se reactivan automáticamente vínculos del bot global.

La finalización del registro usa el bloqueo del propietario y compare-and-set sobre la reserva cifrada (token, secreto, updatedAt y webhook). Una finalización o un 401 tardíos no pueden confirmar ni degradar otra reserva, ni siquiera para el mismo bot. La retirada revalida su snapshot para conservar configuraciones creadas/reemplazadas mientras esperaba a Telegram. El estado público `state` se documenta opcional para compatibilidad de esquemas, aunque el servidor siempre lo devuelve.
