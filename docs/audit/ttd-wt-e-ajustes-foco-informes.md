# Paquete E · Ajustes, Foco e Informes: reporte semanal diario, tarjeta Google única, Pomodoro y aviso de ancla con corrección

- **Repo:** povedica/tick-tack-done · **Base:** `main` en `318fbd9`
- **Rama/worktree:** `git worktree add ../ttd-wt-e -b codex/wt-e-ajustes-foco-informes main`
- **PR:** `fix(wt-e): reporte semanal diario, Google unificado, Pomodoro y corrección de ancla`
- **Prioridad:** P2 · **Tamaño:** M (4 puntos; web + API de foco e informes)
- **Rutas:** las líneas son de `318fbd9`.

## 1. Objetivo y contexto

Cerrar los fallos de la prueba UI de r80 (23/10/2026) en Ajustes, Foco e Informes, y los bugs de API de foco que encontró la prueba MCP:

- **95/124:** el Reporte de la semana en curso dice «Sin detalle diario verificable» y no tiene barras L–D. Por API, el `payload.snapshot` guardado no trae desglose diario, y `trend` = `completed_week` con `completed_previous_week: 0`.
- **97:** no hay una tarjeta única «Google (Calendar y Drive)» ni un «Desconectar» que explique los efectos. Hay tres tarjetas: Calendar, Drive y «Permisos de Google» (con «Cambiar permisos» y «Revocar acceso»).
- **101 + 120 + 121:**
  - `/focus` no muestra presets bajo el reloj (están ocultos tras un clic);
  - `/settings/focus` acepta 200 sin aviso de validación;
  - las respuestas de start/pause/resume/abort traen `task:null` aunque haya `task_id`;
  - `PUT /focus/settings` con cuerpo parcial pone a su valor por defecto los campos que faltan.
- **81:** el detalle muestra «La fecha no coincide con la repetición; la próxima será el lun, 9 nov» **sin botón para corregirlo**.

**Datos de prueba en producción:**

- `d2210ac0-39cc-42bb-9260-673ad2172140` «UI-r80 ancla martes con regla lunes» (3/11, `BYDAY=MO`) → aviso de ancla.
- `70e7c1e9-4a20-4a69-a40f-76a935ccbdfb` «T83 inicio 28 fin 30», con la sesión de foco `219bc3a0`.

## 2. Reglas de trabajo en paralelo (obligatorias)

Este paquete se trabaja **a la vez que otros 4**, cada uno en su propio worktree. Ninguno depende de que otro se haya fusionado. Para que el merge sea limpio:

1. **Base y rama.**
   - Parte de `main` actualizado: `318fbd9` o posterior; producción está en `318fbd9`.
   - Crea el worktree: `git worktree add ../ttd-wt-e -b codex/wt-e-ajustes-foco-informes main`.
   - **Una PR** con un commit por punto: `fix(TTD-AUD-NNN): …` o `feat(TTD-AUD-NNN): …`.
2. **Ficheros.**
   - Solo puedes modificar los de la sección «Ficheros que PUEDE tocar». Puedes crear ficheros nuevos dentro de esas carpetas.
   - Si necesitas tocar un fichero de «NO debe tocar», **para**: busca una alternativa local (envolver, componer, CSS con más especificidad en tu propio fichero) o déjalo anotado en la PR como «pendiente de otro paquete». No lo edites.
3. **Sin dependencias nuevas.** No toques `package.json`, `pnpm-lock.yaml`, `.github/` ni `CHANGELOG.md`. La entrada de changelog va en la descripción de la PR; Pablo la consolida al fusionar.
4. **i18n.**
   - **No edites** `apps/web/src/i18n/es.ts`, `en.ts` ni `extra.ts`: todos los paquetes web chocarían ahí.
   - Crea `apps/web/src/features/settings/i18n-wt-e.ts` con `const es = {…}` y `const en = {…}` (mismas claves) y un hook `useWtEMessages()`.
   - El hook usa `useLocale` de `apps/web/src/i18n/locale.ts` y elige igual que `messagesFor()` (`es` salvo que el locale empiece por `en`).
   - Añade un spec junto al fichero que compruebe que `es` y `en` tienen las mismas claves.
   - Puedes **leer** las claves existentes con `useMessages()`.
5. **Tokens CSS.**
   - **No edites** `apps/web/src/styles/tokens.css`.
   - Los tokens nuevos van en `apps/web/src/features/settings/settings-wt-e.css` (`:root {…}` y `[data-theme='dark'] {…}`), importado desde tu componente.
   - Usa nombres con prefijo de tu zona para no pisar otros tokens.
6. **Tests e2e.**
   - No edites `playwright.r80.config.ts` ni `e2e/r80.fixture.ts`.
   - Crea `apps/web/playwright.wt-e.config.ts` (copia de `playwright.r80.config.ts`) con:
     - `testMatch: 'wt-e-*.spec.ts'`;
     - puerto **4195**;
     - proyectos de **360×780, 390×844, 768×1024 y 1280×800**, en claro y oscuro, llamados `wt-e-<ancho>-<light|dark>`.
   - Specs en `apps/web/e2e/wt-e-*.spec.ts` y datos en `apps/web/e2e/wt-e.fixture.ts`.
   - **Ojo:** `apps/web/playwright.config.ts` (`testDir: './e2e'`, sin `testMatch`) también recoge tus specs. Deben pasar también con esa config, o saltarse con `test.skip(!testInfo.project.name.startsWith('wt-e'), …)` si dependen de los anchos de tu config. **No edites** `playwright.config.ts`.
7. **API y BD.**
   - Si cambias rutas o DTO de la API, regenera **al final** con `pnpm --filter api build && pnpm --filter api openapi:generate && pnpm --filter @reflexionia/sdk generate`.
   - Haz commit de `apps/api/openapi.json`, `apps/api/src/mcp/api-operations.json` y `packages/sdk/src/generated/schema.d.ts` **en un commit aparte** `chore(api): regenerate openapi`. No los edites a mano.
   - Si al rebasar chocan, quédate con la versión de `main` y vuelve a generarlos.
   - Para los tests de integración usa una BD propia: `DATABASE_URL=…/ttd_wt_e`.
8. **Evidencias:** `test-artifacts/audit/evidencias/wt-e/<ID>_<pantalla>_<antes|despues>_<ancho>_<light|dark>.png`. Pon una tabla por punto en la PR.
9. **Verificación antes de la PR:**
   - `pnpm format:check`, `pnpm lint`, `pnpm typecheck` y `pnpm test`.
   - Los e2e propios: `pnpm --filter web exec playwright test -c playwright.wt-e.config.ts`.
   - `pnpm test:integration` si tocas la API.
   - Recorre cada criterio en la PR: «✅ cómo/ancho» o «❌ por qué».
10. **KISS:** el cambio mínimo que cumpla los criterios. Sin refactors fuera del alcance. Lo que no puedas reproducir, documéntalo en la PR con evidencia («a verificar»).

## 3. Puntos (orden de commits)

| Orden | ID                       | Prio | Título                                                                                                          | Tamaño |
| ----- | ------------------------ | ---- | --------------------------------------------------------------------------------------------------------------- | ------ |
| 1     | TTD-AUD-129 (+120, +121) | P2   | Foco: presets visibles, validación en Ajustes > Foco, `task` en las respuestas y merge en `PUT /focus/settings` | M      |
| 2     | TTD-AUD-134              | P2   | Aviso de ancla con botón «Mover al lun 9 nov»                                                                   | S      |
| 3     | TTD-AUD-126 (+95, +124)  | P2   | Reporte de la semana en curso con detalle diario (barras L–D)                                                   | M      |
| 4     | TTD-AUD-127 (97)         | P2   | Tarjeta única «Google (Calendar y Drive)» con «Desconectar» que explica los efectos                             | M      |

#### TTD-AUD-129 · P2 · Foco: presets visibles, validación, `task` en las respuestas y merge en `PUT`

**129.1 · Presets visibles (UI)**

- **Observado:** en `/focus` no se ven los presets bajo el reloj.
- **Causa:** `apps/web/src/features/focus/FocusPage.tsx:275-277` solo pinta `.focus-quick-duration` / `.focus-presets` (15, 25, 45 y 60) si `editingDuration` es true, y eso se activa con un clic en el reloj (`:263`).
- **Cambio:**
  - en modo Pomodoro y sin sesión en curso (`!live && !stopwatch`), los presets se ven **siempre** bajo el reloj, como fila de chips de 28 px;
  - el modo edición con el input numérico sigue tras el clic;
  - el valor configurado en Ajustes aparece como preset activo si no está en la lista (por ejemplo, «35»).
- **Aceptación:**
  - [ ] 1280 y 390: `.focus-presets` es visible sin interacción; cada chip mide 28 ±1 px de alto **[medible]**.
  - [ ] Elegir 15 deja el reloj en `15:00`; `aria-pressed="true"` en el chip 15.
  - [ ] Durante una sesión no se ven.

**129.2 · Validación en Ajustes > Foco (UI)**

- **Observado:** escribir 200 en «Duración del Pomodoro» no muestra error.
- **Causa:** `apps/web/src/features/settings/FocusSettingsPage.tsx:90-130` usa `<input type=number min max step>`, pero `save()` (`:39-60`) envía sin validar, y el error de la API solo se ve tras guardar (`failureMessage`).
- **Cambio:**
  - validar en el cliente con los mismos rangos de la tabla `numbers` (`:30-37`): mínimo, máximo y múltiplo del paso;
  - mostrar el error **en línea** bajo el campo (`aria-invalid`, `aria-describedby`);
  - deshabilitar «Guardar» mientras haya errores;
  - si la API devuelve 400, mostrar su mensaje junto al campo.
- **Aceptación:**
  - [ ] Escribir 200 → «Entre 5 y 180, de 5 en 5» bajo el campo; «Guardar» `disabled`; no hay petición de red.
  - [ ] Escribir 45 y guardar → 200 OK; el reloj de `/focus` muestra `45:00` sin recargar (la caché `['focus-settings']` ya se actualiza en `:54`).

**129.3 · `task` en las respuestas de sesión (API, antes TTD-AUD-120)**

- **Evidencia:** `start_focus {task_id}` → `"task": null`; en cambio, `GET /focus/sessions` sí trae `task{id,title}`.
- **Causa:** `apps/api/src/modules/focus/focus.controller.ts`: el listado incluye `task` (`:441`, `:483`), pero start, pause, resume y abort devuelven la fila sin `include` y el mapper hace `task: row.task ?? null` (`:834`).
- **Cambio:** `include: { task: { select: { id: true, title: true } } }` en todas las escrituras de sesión.
- **Aceptación:**
  - [ ] start, pause, resume, finish y abort con `task_id` → `task.title` presente.

**129.4 · Merge en `PUT /focus/settings` (API, antes TTD-AUD-121)**

- **Evidencia (código):** `focus.controller.ts` ≈ `:600-660`: el `create` rellena con valores por defecto, y el `PUT` (si existe aparte del `PATCH`) sustituye todo.
- **Cambio:** decidir **una** semántica y documentarla:
  - `PATCH` = merge;
  - `PUT` = cuerpo completo obligatorio (400 si falta un campo), o bien `PUT` como alias de `PATCH`.
  - Lo más simple y seguro: que `PUT` haga merge igual que `PATCH`. Actualiza la descripción OpenAPI.
- **Aceptación:**
  - [ ] Con `pomodoro_minutes` 35 guardado, `PUT {volume: 50}` deja `pomodoro_minutes` en 35.
  - [ ] `PUT {pomodoro_minutes: 200}` → 400 `validation_failed`.

**Tests:**

- unit web `FocusSettingsPage.spec.tsx` y `FocusPage.spec.tsx`;
- integración `test/wt-e-focus.e2e-spec.ts`;
- e2e `wt-e-focus.spec.ts` (390/1280, claro/oscuro).

#### TTD-AUD-134 · P2 · Aviso de ancla con botón «Mover al lun 9 nov»

**Observado:** en el detalle de `d2210ac0` (vence el martes 3/11, regla «cada lunes») se ve «La fecha no coincide con la repetición; la próxima será el lun, 9 nov», pero no hay acción para corregirlo.

**Causa:** `apps/web/src/features/tasks/TaskDetail.tsx:191-195` calcula `recurrenceAnchorWarning(...)` y `:461-474` lo pinta como `<span role="status">` sin botón.

**Cambio:**

- Añadir al lado del aviso un botón secundario pequeño «Mover al {fecha}» que hace `PATCH` de la tarea con `due_date` = `next_matching` (día completo si la tarea es de día completo; si tiene hora, conserva la hora local) y el `start_date` desplazado lo mismo.
- Tras guardar, el aviso desaparece.
- Alternativa en el mismo bloque: «Cambiar la regla», que abre el editor de repetición existente (`setDateOpen(true)`, como hace el botón de la repetición en `:455`).
- **Solo** se toca el bloque del aviso en `TaskDetail.tsx`. El resto del detalle no cambia.

**Aceptación:**

- [ ] En el detalle de una tarea con ancla martes y regla lunes se ve «Mover al lun, 9 nov» (es) / «Move to Mon, Nov 9» (en). Pulsarlo → `due_date` 9/11; el aviso desaparece sin recargar; la actividad registra `task.updated`.
- [ ] Una tarea con hora (martes 10:00) → lunes 10:00 en su zona.
- [ ] «Cambiar la regla» abre el editor de repetición.
- [ ] 390 px: el botón mide ≥ 44 px de alto y el aviso no se corta.

**Tests:** unit del cálculo de la nueva fecha (día completo y con hora, incluido el cambio de hora del 25/10 → 1/11); e2e `wt-e-anchor.spec.ts`.

#### TTD-AUD-126 · P2 · Reporte de la semana en curso con detalle diario (95 + 124)

**Observado:**

- `/reports/weekly` (semana del 19/10, en curso) → «Sin detalle diario verificable», sin barras L–D.
- Por API, `GET /api/v1/reports/weekly` → `payload.snapshot` sin desglose diario, `trend: 214` = `completed_week: 214`, `completed_previous_week: 0`.

**Causa (en dos partes):**

1. **Web:** `apps/web/src/features/product/WeeklyPages.tsx:60-80` calcula `days = reportDays(payload.days, statistics.data?.daily, ongoing, start, today)` (`report-days.ts:20-39`). Para la semana en curso usa `statsApi.overview(...).daily`, con `enabled: ongoing && !!me.data`. Si `daily` llega vacío o con otra forma (claves `date`/`completed`/`created`, `report-days.ts:8-18`), `days.length !== 7` → `valid=false` → `copy.unverified` (`:149`).
   - **A verificar reproduciendo:** si la query de estadísticas se ejecuta, qué devuelve `daily` (`apps/api/src/modules/stats/stats.service.ts:153`, `stats.schema.ts:91`) y si `start`/`today` usan el mismo formato de día.
2. **API:** el informe guardado (`apps/api/src/reading/weekly-report.ts` y la plantilla de automatización que lo construye en `apps/api/src/modules/automations/automations.controller.ts`) no incluye `days[]`. Además, `trend` se calcula frente a una semana anterior sin datos (`completed_previous_week: 0`), así que no tiene sentido.

**Cambio:**

- **API:** al construir el informe (POST `/reports/weekly` y la automatización), guardar `payload.days = [{date, completed, created}] × 7` (hasta hoy, el resto a 0) con el mismo agregado que `stats.service.ts`. `trend`/`trend_label` = `null` si la semana anterior no tiene datos comparables (lo que ya describe el OpenAPI de `reports.controller.ts:119`).
- **Web:**
  - semana en curso → siempre 7 barras L–D con la etiqueta «hasta hoy, vie 23»;
  - semana cerrada → las 7 guardadas;
  - `unverified` solo si no hay **ningún** dato (ni guardado ni en vivo);
  - si la query de estadísticas falla, mostrar el error con «Reintentar» en vez de `unverified`.

**Aceptación:**

- [ ] Semana en curso (con datos): 7 barras; las de los días futuros vacías; no aparece «Sin detalle diario verificable». Fija la fecha en Playwright con `page.clock`.
- [ ] Semana cerrada con `payload.days` de 7 → 7 barras guardadas.
- [ ] Un informe nuevo por API trae `payload.days.length === 7` y `trend: null` si la semana anterior no tiene datos.
- [ ] La suma de `completed` de `days` = `completed_week` (test de dominio).
- [ ] 390/1280, claro y oscuro.

**Tests:** unit `report-days.spec.ts` (ampliar: forma de `daily`, en curso, cerrada, vacía); integración `test/wt-e-weekly.e2e-spec.ts`; e2e `wt-e-weekly.spec.ts`.

#### TTD-AUD-127 · P2 · Tarjeta única «Google (Calendar y Drive)» con «Desconectar» (97)

**Observado:** en `/settings/integrations` hay tres tarjetas: Calendar, Drive y «Permisos de Google» (con «Cambiar permisos» y «Revocar acceso a Google»). TTD-AUD-97 pedía una sola.

**Causa:**

- `apps/web/src/features/product/ProductPages.tsx:285-299` (`IntegrationSettings`) pinta `<GoogleIntegrationCards />`, que en `apps/web/src/features/settings/DriveCard.tsx` genera las tarjetas separadas.
- El diálogo de revocación (`DriveCard.tsx:98-150`) ya existe y llama a `api.disconnectGoogle({ removeImportedEvents })` (`:43`) → `DELETE /api/v1/integrations/google`. La API ya revoca en Google (`integrations.controller.ts:359-430`).
- **No hace falta tocar la API.**

**Cambio (solo web, KISS):**

- `GoogleIntegrationCards` pasa a ser **una tarjeta** «Google (Calendar y Drive)» con:
  - la cuenta (`googleAccountEmail`) y el estado global («Conectado», «Reconectar» o «Desconectado»);
  - dos filas de servicio: «Calendario: lectura y escritura» y «Drive: solo ficheros creados por ttd», cada una con su estado y su interruptor local (`api.setGoogleService`, como hoy, `:176`);
  - acciones «Cambiar permisos» (la actual) y **«Desconectar»** (antes «Revocar acceso a Google»).
- El diálogo de «Desconectar» explica los tres efectos:
  1. los calendarios dejan de sincronizarse; los eventos importados se quedan, o se borran si se marca la casilla (por defecto se quedan);
  2. **los adjuntos siguen en tu Drive como enlaces**, pero no se pueden subir nuevos;
  3. se revoca el acceso también en Google.
- Tras desconectar, aviso: «Google desconectado. Puedes revisar los permisos en myaccount.google.com/permissions».
- `GoogleCalendarsCard.tsx` (la lista de calendarios suscritos) puede quedarse **dentro** de la tarjeta, como sección plegable.

**Aceptación:**

- [ ] Una sola tarjeta con el título «Google (Calendar y Drive)», el correo, dos filas de permisos y su estado (`getAllByRole('heading', {name: /Google/})` → 1 en la sección).
- [ ] «Desconectar» → diálogo con los 3 efectos; «Cancelar» no hace ninguna petición (mock de red).
- [ ] Confirmar → `DELETE /integrations/google` con `removeImportedEvents:false` por defecto; aviso con el enlace a myaccount.
- [ ] Desconectado: los chips de adjuntos existentes siguen abriendo Drive (e2e con datos simulados) y «Adjuntar» queda deshabilitado (comprobación de humo; el detalle es de otro paquete y aquí no se cambia).
- [ ] 360/390/768/1280, claro y oscuro: la tarjeta sin cortes y el diálogo con los botones visibles.

**Tests:** unit `DriveCard.spec.tsx`; e2e `wt-e-google.spec.ts`. **No pruebes contra la cuenta real**: usa mocks.

## 4. Ficheros que PUEDE tocar (propiedad exclusiva de E)

**API:**

- `apps/api/src/modules/focus/**` (`focus.controller.ts` + spec): 129.3 y 129.4.
- `apps/api/src/modules/reports/**`, `apps/api/src/reading/weekly-report.ts`: 126.
- `apps/api/src/modules/automations/automations.controller.ts`: **solo** la construcción del informe semanal (126). Nadie más lo toca.
- `apps/api/src/modules/stats/**`: solo si 126 necesita exponer o reutilizar el agregado diario (preferible solo lectura).
- `apps/api/test/wt-e-*.e2e-spec.ts` (nuevos).
- **Generados** (commit aparte): `openapi.json`, `api-operations.json` y `schema.d.ts`.

**Web:**

- `apps/web/src/features/focus/**` (`FocusPage.tsx`, `focus.css`).
- `apps/web/src/features/settings/FocusSettingsPage.tsx`, `DriveCard.tsx` y `GoogleCalendarsCard.tsx`.
- `apps/web/src/features/product/**` (`WeeklyPages.tsx`, `report-days.ts`, `weekly.css`, `GoogleAccessActions.tsx`, `google-access.css`, `ProductPages.tsx` **sin tocar** la línea `<TelegramCard />`). **No edites `WeekPicker.tsx`** (usa `PeriodNavigator`, que es de A).
- `apps/web/src/features/statistics/**`: solo si 126 lo necesita.
- `apps/web/src/features/tasks/TaskDetail.tsx`: **solo** el bloque del aviso de ancla (≈ `:185-200` y `:455-475`).

**Ficheros nuevos:**

- `apps/web/src/features/settings/i18n-wt-e.ts` + spec, `apps/web/src/features/settings/settings-wt-e.css`;
- `apps/web/playwright.wt-e.config.ts` (puerto 4195), `e2e/wt-e-*.spec.ts` y `e2e/wt-e.fixture.ts`.

## 5. Ficheros que NO debe tocar

| Fichero o carpeta                                                                                                                          | Propietario                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/api.ts`                                                                                                                      | C. E usa los métodos que **ya existen**: `disconnectGoogle`, `setGoogleService`, `updateFocusSettings`, `weeklyReports`, `statsApi`. Si falta alguno, llama con el cliente existente desde un helper local en `features/product/` o `features/settings/`, sin editar `api.ts`. |
| `apps/web/src/features/settings/TelegramCard.tsx`, `TelegramBotSettings.tsx`, `NotificationsPage.tsx`, `telegram.css`, `notifications.css` | C                                                                                                                                                                                                                                                                              |
| `apps/web/src/features/tasks/TaskList.tsx`, `features/today/**`, `components/ui.css`                                                       | B                                                                                                                                                                                                                                                                              |
| `apps/web/src/components/Popover.tsx`, `DatePopover.tsx`, `components/period/**`, `features/calendar/**`, `features/places/**`, `shell/**` | A                                                                                                                                                                                                                                                                              |
| `apps/api/src/modules/integrations/**` (incluido el `DELETE google`), `notifications/**`, `prisma/**`                                      | C                                                                                                                                                                                                                                                                              |
| `apps/api/src/modules/tasks/**`, `mcp/**`, `scheduler/**`, `planning/**`, `search/**`, `drive/**`, `auth/auth-user.ts`                     | D                                                                                                                                                                                                                                                                              |
| `apps/web/src/i18n/es.ts`, `en.ts`, `extra.ts`, `styles/tokens.css`                                                                        | nadie                                                                                                                                                                                                                                                                          |
| `package.json`, `pnpm-lock.yaml`, `CHANGELOG.md`, `.github/**`                                                                             | nadie                                                                                                                                                                                                                                                                          |

## 6. Cómo evitar conflictos (específico de E)

- **`TaskDetail.tsx`:** solo el bloque del aviso de ancla; el diff no debe tocar otras secciones. A arregla la hoja de fecha dentro de `DatePopover`, no en `TaskDetail`.
- **`ProductPages.tsx`:** no muevas ni quites `<TelegramCard />` (C lo cambia por dentro).
- **Sin migraciones.** `payload.days` va dentro del JSON del informe; no hace falta columna nueva.
- **OpenAPI:** commit aparte y regenerado.

## 7. Tests a añadir

| Tipo        | Fichero                                                                                   | Puntos                         |
| ----------- | ----------------------------------------------------------------------------------------- | ------------------------------ |
| Unit web    | `FocusPage.spec.tsx`, `FocusSettingsPage.spec.tsx`                                        | 129.1, 129.2                   |
| Integración | `test/wt-e-focus.e2e-spec.ts`                                                             | 129.3, 129.4                   |
| Unit web    | `features/tasks/anchor-fix.spec.ts` (helper nuevo en `features/tasks/`)                   | 134                            |
| Unit web    | `report-days.spec.ts` (ampliar)                                                           | 126                            |
| Integración | `test/wt-e-weekly.e2e-spec.ts`                                                            | 126                            |
| Unit web    | `DriveCard.spec.tsx`                                                                      | 127                            |
| e2e         | `wt-e-focus.spec.ts`, `wt-e-anchor.spec.ts`, `wt-e-weekly.spec.ts`, `wt-e-google.spec.ts` | 360/390/768/1280, claro/oscuro |

## 8. Checklist de verificación manual

| #   | URL                                               | Ancho      | Qué comprobar                                                                                                                            |
| --- | ------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/focus`                                          | 1280 / 390 | Presets 15/25/45/60 visibles bajo el reloj sin clic.                                                                                     |
| 2   | `/settings/focus`                                 | 1280 / 390 | Escribir 200 → error en línea y «Guardar» deshabilitado. **No guardar** si es la cuenta real (es un ajuste de Pablo); probar en preview. |
| 3   | Detalle de `d2210ac0-39cc-42bb-9260-673ad2172140` | 1280 / 390 | Botón «Mover al lun, 9 nov». En producción, pulsarlo solo sobre esta tarea de prueba.                                                    |
| 4   | `/reports/weekly`                                 | 1280 / 390 | 7 barras L–D «hasta hoy…»; sin «Sin detalle diario verificable».                                                                         |
| 5   | `/settings/integrations`                          | 1280 / 390 | Una tarjeta «Google (Calendar y Drive)»; «Desconectar» → diálogo con 3 efectos → **Cancelar**.                                           |
| 6   | Por MCP                                           | —          | `start_focus {task_id: <tarea de prueba>}` → `task.title` presente; `abort_focus`.                                                       |

## 9. Prompt para Codex (también en `ttd-wt-e-ajustes-foco-informes-prompt.txt`)

```text
Trabaja en el repo povedica/tick-tack-done.
Crea un worktree propio desde main actualizado (318fbd9 o posterior):
  git worktree add ../ttd-wt-e -b codex/wt-e-ajustes-foco-informes main
Copia en el repo docs/audit/ttd-wt-e-ajustes-foco-informes.md (este documento). Si docs/ no existe, usa test-artifacts/audit/.
Léelo entero: es autónomo y es la única fuente de requisitos.

Objetivo: ajustes, foco e informes (reporte semanal diario, Google unificado, Pomodoro y corrección de ancla).
Puntos: TTD-AUD-129 (+120, +121), 134, 126 (+95, +124), 127 (97).

Reglas clave:
- Este paquete se desarrolla EN PARALELO con otros 4 paquetes (A–E) en otros worktrees.
- Modifica SOLO los ficheros de «Ficheros que PUEDE tocar».
- NO edites los de «NO debe tocar», ni i18n/es.ts, en.ts o extra.ts, ni styles/tokens.css, package.json, pnpm-lock.yaml, CHANGELOG.md o .github/.
- i18n en tu fichero propio. Tokens CSS en tu fichero propio. Playwright con tu config y tu puerto.
- OpenAPI/SDK solo regenerados, en un commit aparte.
- Una PR «fix(wt-e): ajustes, foco e informes (reporte semanal diario, Google unificado, Pomodoro y corrección de ancla)», con un commit por punto en el orden de la sección 3.
- Tests unitarios, de integración y e2e según el documento. Capturas antes/después a 360/390/768/1280, claro y oscuro, donde aplique.
- pnpm format:check, lint, typecheck, test, los e2e propios (y test:integration si tocas la API), todo en verde.
- En la PR, recorre cada criterio de aceptación con ✅/❌ y evidencia.
- KISS. No inventes datos: lo que no reproduzcas, anótalo como «a verificar» con evidencia.
```
