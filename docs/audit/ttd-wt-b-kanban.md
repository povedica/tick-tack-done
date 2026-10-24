# Paquete B · Listas y Kanban: carrusel móvil, fondo de columnas, mover tarjetas y contador de enlaces en la fila

- **Repo:** povedica/tick-tack-done · **Base:** `main` en `318fbd9`
- **Rama/worktree:** `git worktree add ../ttd-wt-b -b codex/wt-b-kanban main`
- **PR:** `fix(wt-b): kanban móvil/escritorio, mover tarjetas y contador de enlaces`
- **Prioridad:** P1 · **Tamaño:** M (4 puntos, solo web)
- **Rutas:** `web/` = `apps/web/src/`. Las líneas son de `318fbd9`.

## 1. Objetivo y contexto

Pablo, 23/10/2026: «el kanban en móvil requiere más acabado: columnas más intuitivas, navegables y con un fondo distinto del blanco».

Hay que hacer el kanban (lista `?view=kanban` y Hoy en kanban):

- navegable en móvil, como carrusel con snap y pestañas de columnas;
- con columnas visibles en escritorio y en oscuro;
- con una forma fiable de mover tarjetas en táctil.

Además, la fila de la vista lista debe mostrar el contador de enlaces «🔗 N». Hoy no lo muestra (prueba UI de r80, punto 100).

**Fuentes:**

- capturas `r105-shots/PROD-r105_kanban-movil-a.webp`, `PROD-r105_kanban-movil-b.webp` y `PROD-r105_kanban-escritorio.webp`;
- prueba UI de r80 del 23/10/2026 (`r80-ui-shots/`);
- código en `318fbd9`.

**Dato de prueba:** `ac63d7aa-9c2f-43ef-b298-849cf7d7c020` «UI-r80 enlaces y adjuntos» (2 enlaces), en la lista `grokbot-ticktackdone` (`/list/b7e06139-a8b5-4ed5-b60b-25bd27358b9d`). `GET /api/v1/tasks?project_id=…` devuelve `link_count: 2` para esa tarea.

## 2. Reglas de trabajo en paralelo (obligatorias)

Este paquete se trabaja **a la vez que otros 4**, cada uno en su propio worktree. Ninguno depende de que otro se haya fusionado. Para que el merge sea limpio:

1. **Base y rama.**
   - Parte de `main` actualizado: `318fbd9` o posterior; producción está en `318fbd9`.
   - Crea el worktree: `git worktree add ../ttd-wt-b -b codex/wt-b-kanban main`.
   - **Una PR** con un commit por punto: `fix(TTD-AUD-NNN): …` o `feat(TTD-AUD-NNN): …`.
2. **Ficheros.**
   - Solo puedes modificar los de la sección «Ficheros que PUEDE tocar». Puedes crear ficheros nuevos dentro de esas carpetas.
   - Si necesitas tocar un fichero de «NO debe tocar», **para**: busca una alternativa local (envolver, componer, CSS con más especificidad en tu propio fichero) o déjalo anotado en la PR como «pendiente de otro paquete». No lo edites.
3. **Sin dependencias nuevas.** No toques `package.json`, `pnpm-lock.yaml`, `.github/` ni `CHANGELOG.md`. La entrada de changelog va en la descripción de la PR; Pablo la consolida al fusionar.
4. **i18n.**
   - **No edites** `apps/web/src/i18n/es.ts`, `en.ts` ni `extra.ts`: todos los paquetes web chocarían ahí.
   - Crea `apps/web/src/features/tasks/i18n-wt-b.ts` con `const es = {…}` y `const en = {…}` (mismas claves) y un hook `useWtBMessages()`.
   - El hook usa `useLocale` de `apps/web/src/i18n/locale.ts` y elige igual que `messagesFor()` (`es` salvo que el locale empiece por `en`).
   - Añade un spec junto al fichero que compruebe que `es` y `en` tienen las mismas claves.
   - Puedes **leer** las claves existentes con `useMessages()`.
5. **Tokens CSS.**
   - **No edites** `apps/web/src/styles/tokens.css`.
   - Los tokens nuevos van en `apps/web/src/features/tasks/kanban-wt-b.css` (`:root {…}` y `[data-theme='dark'] {…}`), importado desde tu componente.
   - Usa nombres con prefijo de tu zona para no pisar otros tokens.
6. **Tests e2e.**
   - No edites `playwright.r80.config.ts` ni `e2e/r80.fixture.ts`.
   - Crea `apps/web/playwright.wt-b.config.ts` (copia de `playwright.r80.config.ts`) con:
     - `testMatch: 'wt-b-*.spec.ts'`;
     - puerto **4192**;
     - proyectos de **360×780, 390×844, 768×1024 y 1280×800**, en claro y oscuro, llamados `wt-b-<ancho>-<light|dark>`.
   - Specs en `apps/web/e2e/wt-b-*.spec.ts` y datos en `apps/web/e2e/wt-b.fixture.ts`.
   - **Ojo:** `apps/web/playwright.config.ts` (`testDir: './e2e'`, sin `testMatch`) también recoge tus specs. Deben pasar también con esa config, o saltarse con `test.skip(!testInfo.project.name.startsWith('wt-b'), …)` si dependen de los anchos de tu config. **No edites** `playwright.config.ts`.
7. **API y BD.**
   - Si cambias rutas o DTO de la API, regenera **al final** con `pnpm --filter api build && pnpm --filter api openapi:generate && pnpm --filter @reflexionia/sdk generate`.
   - Haz commit de `apps/api/openapi.json`, `apps/api/src/mcp/api-operations.json` y `packages/sdk/src/generated/schema.d.ts` **en un commit aparte** `chore(api): regenerate openapi`. No los edites a mano.
   - Si al rebasar chocan, quédate con la versión de `main` y vuelve a generarlos.
   - Para los tests de integración usa una BD propia: `DATABASE_URL=…/ttd_wt_b`.
8. **Evidencias:** `test-artifacts/audit/evidencias/wt-b/<ID>_<pantalla>_<antes|despues>_<ancho>_<light|dark>.png`. Pon una tabla por punto en la PR.
9. **Verificación antes de la PR:**
   - `pnpm format:check`, `pnpm lint`, `pnpm typecheck` y `pnpm test`.
   - Los e2e propios: `pnpm --filter web exec playwright test -c playwright.wt-b.config.ts`.
   - `pnpm test:integration` si tocas la API.
   - Recorre cada criterio en la PR: «✅ cómo/ancho» o «❌ por qué».
10. **KISS:** el cambio mínimo que cumpla los criterios. Sin refactors fuera del alcance. Lo que no puedas reproducir, documéntalo en la PR con evidencia («a verificar»).

## 3. Puntos (orden de commits)

| Orden | ID          | Prio | Título                                                                     | Tamaño |
| ----- | ----------- | ---- | -------------------------------------------------------------------------- | ------ |
| 1     | TTD-AUD-109 | P2   | Kanban escritorio y oscuro: separación visual de columnas (base de tokens) | S      |
| 2     | TTD-AUD-108 | P1   | Kanban móvil: carrusel con snap, fondo, cabecera fija e indicador          | M      |
| 3     | TTD-AUD-110 | P2   | Mover tarjetas entre columnas en táctil («Mover a…»)                       | M      |
| 4     | TTD-AUD-128 | P2   | La fila de la lista no muestra el contador de enlaces «🔗 N»               | S      |

> **Ajustes respecto al texto original de r105:**
>
> - Los tokens `--kanban-*` **no** van en `styles/tokens.css`, sino en `apps/web/src/features/tasks/kanban-wt-b.css` (`:root` y `[data-theme='dark']`). Impórtalo desde `TaskList.tsx` y desde `TaskGroup.tsx`.
> - Las claves i18n (`kanbanColumnsNav`, `kanbanMoveTo`, `kanbanEmpty`…) van en `apps/web/src/features/tasks/i18n-wt-b.ts`.
> - Para la hoja «Mover a…» puedes **usar** `components/Popover.tsx` tal cual (no lo edites: es del paquete A) o un `<dialog>` propio en `features/tasks/KanbanMoveSheet.tsx`.

### 3.1 Nuevo punto abierto por la prueba UI de r80

#### TTD-AUD-128 · P2 · La fila de la lista no muestra el contador de enlaces «🔗 N»

**Observado:** en `/list/b7e06139-a8b5-4ed5-b60b-25bd27358b9d`, la fila de `UI-r80 enlaces y adjuntos` (2 enlaces) **no muestra «🔗 2»**. TTD-AUD-100 lo pedía.

**Causa:**

- Hoy (`features/today/TaskGroup.tsx:262-266`) ya lo pinta, usando `linkCount` (`features/today/board.ts:38`, `groups.ts:19`).
- La vista lista y kanban de una lista usa `TaskRow` de `apps/web/src/features/tasks/TaskList.tsx:232` (desde `features/views/components/ViewPages.tsx:346,407,462`), que **no lee `link_count`**. Ni el modelo de fila (`RowModel`) ni el render lo incluyen.
- La API ya lo da en el listado (`GET /tasks` → `link_count: 2`). El 0 de `get_task` es un bug aparte (TTD-AUD-112, paquete D) que **no afecta** a esta vista.

**Cambio propuesto:**

- Añadir `linkCount` al `RowModel`, mapeado de `task.link_count ?? 0`.
- En `TaskRow` (vista lista y tarjeta kanban), pintar junto a checklist, repetición y adjuntos el mismo marcado que Hoy:
  ```tsx
  <span className="task-link-count" title={…} aria-label={…}>
    <LinkIcon size={12} /> {n}
  </span>
  ```
  Solo si `n > 0`.
- `aria-label`: «2 enlaces» / «1 enlace» (plural con `Intl.PluralRules`, claves en `i18n-wt-b.ts`).
- Reutiliza la clase `.task-link-count` existente. Si su CSS vive en `today.css`, puedes ajustarlo, porque `today.css` es de B.

**Criterios de aceptación:**

- [ ] 1280×800 y 390×844: en la lista, la fila de una tarea con 2 enlaces muestra un icono de enlace + «2». Con 0 enlaces no se pinta nada.
- [ ] En el kanban de esa lista (`?view=kanban`), la tarjeta muestra el mismo contador.
- [ ] El `aria-label` del contador es «2 enlaces» (es) / «2 links» (en); con 1, «1 enlace» / «1 link».
- [ ] Tras `add_task_link` por API o MCP, el contador se actualiza en ≤ 2 s sin recargar (refetch o invalidación existente; e2e con mock de la API).
- [ ] Claro y oscuro: contraste del contador ≥ 4,5:1.

**Tests:** unit del mapeo `RowModel` (0/1/2), unit del plural, e2e `wt-b-links.spec.ts`.

### 3.2 Puntos de r105 (especificación original, vigente salvo los ajustes de arriba)

##### TTD-AUD-109 · P2 · Kanban escritorio y modo oscuro: separación visual de columnas

**Estado actual:** captura `PROD-r105_kanban-escritorio.webp`: columnas blancas sobre blanco, separadas solo por espacio. Misma causa que 108 (override de `ui.css:3018-3023` y `today.css:1429-1432`). Las tarjetas tienen `:hover` con `--accent-soft` (`ui.css:3063-3066`), correcto.

**Comportamiento esperado:** columnas de `--kanban-col-w` (288 px), fondo `--kanban-col-bg`, `gap: var(--sp-3)`, cabecera fija dentro de la columna, scroll vertical por columna, scroll horizontal solo en `.kanban` (con `scroll-snap-type: x proximity`). En oscuro, columna `#1a1a1a` y tarjeta `#2a2a2a`.

- `.kanban-col.is-over` (`ui.css:411-413`) usa `--warning` (naranja): cambiar a `outline: 2px dashed var(--accent)` + `background: var(--accent-soft)`, como Hoy (`today.css:1577-1581`).

**Criterios de aceptación:**

- [ ] 1280×800 claro y oscuro: fondo de columna ≠ fondo de página ≠ fondo de tarjeta.
- [ ] Contraste del texto de cabecera sobre `--kanban-col-bg` ≥ 4,5:1 en ambos temas.
- [ ] Al arrastrar una tarjeta sobre otra columna, la columna destino muestra el contorno de acento discontinuo.
- [ ] Lista y Hoy en kanban usan las mismas variables (test de componente o de estilos computados).

##### TTD-AUD-108 · P1 · Kanban móvil: carrusel de columnas con snap, fondo de columna, cabecera fija e indicador

**Estado actual (lista `?view=kanban`, `web/features/tasks/TaskList.tsx:483-680`; Hoy en kanban, `web/features/today/today.css:1381-1580`):**

- Contenedor `.kanban`: `display:flex; gap:var(--sp-3); overflow-x:auto; align-items:flex-start` (`web/components/ui.css:358-363`). **Sin `scroll-snap`** (en el CSS de producción solo hay `scroll-snap` en Estadísticas y Tokens). El «salto» de columnas que se ve con scroll rápido es inercia libre, no snap.
- Columna: `ui.css:365-372` le da `background: var(--surface-2)` y borde, pero **`ui.css:3018-3023` la redefine** con `flex: 0 0 300px; max-width:360px; border:0; background:transparent` → **columna blanca sobre página blanca** (confirmado en el CSS servido). Igual en Hoy: `today.css:1404-1408` pone `--surface-2` y `today.css:1429-1432` lo anula con `transparent`.
- `--surface-2` es `rgba(25,25,25,.04)` en claro y `rgba(255,255,255,.04)` en oscuro (`tokens.css:119`, `:338`): casi invisible aunque se aplicara. En oscuro, `--surface #222` sobre `--bg #242424` (`tokens.css:326`, `:337`) hace que las tarjetas tampoco se distingan.
- Ancho fijo de 300 px: a 393 px se ve la columna y ~45 px de la siguiente, cortada a «Ho…» (capturas kanban móvil). No hay indicador de cuántas columnas hay ni de cuál es la actual.
- Cabecera `<h3>` (`TaskList.tsx:558-582`) no es fija: al bajar en una columna larga se pierde el nombre y el contador.
- Columna vacía: solo un `<p>` con `kanbanEmpty` (`TaskList.tsx:583`) sin contenedor → hueco blanco.
- `section.kanban-col` crea tarea al tocar su fondo (`TaskList.tsx:521-523`): en móvil, al deslizar o tocar un hueco se abre el composer sin querer (**a verificar** en dispositivo).
- Hoy en kanban: las columnas son `<details>` (`today/TaskGroup.tsx:87`, `:130`): tocar la cabecera **pliega** la columna.

**Comportamiento esperado (TickTick móvil, KISS):**

1. **Tokens nuevos** (`tokens.css`):
   - `--kanban-col-bg`: claro `#f3f4f6`; oscuro `#1a1a1a`.
   - `--kanban-card-bg`: claro `var(--surface)` (#fff); oscuro `#2a2a2a`.
   - `--kanban-col-w-mobile: calc(100vw - 2 * var(--sp-4) - 32px)` (columna casi a ancho completo con ~32 px de la siguiente visibles).
   - `--kanban-col-w: 288px` (escritorio).
2. **Una sola definición** de `.kanban-col` (borrar la duplicada de `ui.css:3018-3023` y unificar con `ui.css:365-372`): `background: var(--kanban-col-bg); border-radius: var(--radius-lg); padding: var(--sp-2); border: 0`. Tarjetas `background: var(--kanban-card-bg); border: 1px solid var(--border); box-shadow: var(--shadow-sm)`. Mismo criterio en `today.css` (borrar `:1429-1432`).
3. **≤ 768 px, carrusel:**
   - `.kanban { scroll-snap-type: x mandatory; scroll-padding-inline: var(--sp-4); padding-inline: var(--sp-4); overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; }`
   - `.kanban-col { flex: 0 0 var(--kanban-col-w-mobile); scroll-snap-align: start; scroll-snap-stop: always; }` (`always` evita que un gesto rápido salte columnas).
   - Columna con altura de la zona útil (`max-height: calc(100dvh - <cabecera> - var(--bottombar-h) - env(safe-area-inset-bottom))`) y **scroll vertical interno**; la página no hace scroll horizontal.
4. **Cabecera de columna fija** (`position: sticky; top: 0; z-index: 1; background: var(--kanban-col-bg)`): nombre + contador (`ui-badge`) + «+» + «⋯». Altura 44 px en móvil.
5. **Indicador de columnas** (≤ 768 px): fila de **pestañas/píldoras** desplazable bajo la cabecera de la vista, una por columna con nombre y contador (p. ej. «Vencidas 3 · Hoy 0 · Mañana 1 …»). La activa se resalta (`--accent-soft`), se actualiza con `IntersectionObserver` (umbral 0,6) y al tocarla hace `scrollIntoView({inline:'start', behavior:'smooth'})` de la columna. `role="tablist"`/`tab` + `aria-selected`. (Si se prefiere algo aún más simple: puntos, pero las píldoras con nombre son más intuitivas, que es lo que pide Pablo.)
6. **Añadir tarea al final** de cada columna: se mantiene `.kanban-add-space` como botón de 44 px con borde discontinuo sutil (`1px dashed var(--border)`).
7. **Columna vacía:** misma caja `--kanban-col-bg` con un texto `kanbanEmpty` centrado en `--ink-3` y el botón «Añadir tarea»; altura mínima 120 px.
8. **No crear al tocar el fondo** de la columna en móvil (`pointer: coarse`): eliminar el `onClick` de `section.kanban-col` o limitarlo a `pointer: fine`.
9. Hoy en kanban: la cabecera de columna deja de plegar en modo kanban (o el `summary` se sustituye por un `h3` en ese modo).
10. **769–1023 px:** varias columnas visibles, `scroll-snap-type: x proximity`, sin pestañas.

**Criterios de aceptación:**

- [ ] 360 y 390: la primera columna mide `innerWidth - 2*16 - 32` px (±2) y se ven entre 24 y 40 px de la segunda.
- [ ] 360 y 390: `getComputedStyle(.kanban).scrollSnapType` contiene `x mandatory`; cada `.kanban-col` tiene `scroll-snap-stop: always`.
- [ ] Tras `kanban.scrollBy({left: 3*innerWidth})` en un solo gesto, el `scrollLeft` final coincide con el inicio de la **columna siguiente** a la de partida (no salta columnas). **[medible]**
- [ ] El color de fondo de `.kanban-col` ≠ color de fondo de `.outlet`/`body` en claro y oscuro; la tarjeta ≠ columna en ambos temas (comparar `getComputedStyle().backgroundColor`).
- [ ] Al hacer scroll vertical dentro de una columna con 15 tarjetas, la cabecera conserva su `boundingBox().y` (±1).
- [ ] Hay un `role="tablist"` con una pestaña por columna, con contador; tocar la 4.ª deja la 4.ª columna alineada a la izquierda (`±2 px` de `scroll-padding`) y `aria-selected="true"`.
- [ ] Columna vacía: caja visible con fondo `--kanban-col-bg`, ≥ 120 px de alto, texto vacío y botón «Añadir tarea» ≥ 44 px.
- [ ] Tocar el hueco de una columna (no un botón) **no** abre el composer en `pointer: coarse`.
- [ ] Criterio global: a 360/390/768/1280 `document.documentElement.scrollWidth === innerWidth`; solo `.kanban` tiene `scrollWidth > clientWidth`.

##### TTD-AUD-110 · P2 · Mover tarjetas entre columnas en táctil

**Estado actual:** el kanban usa HTML5 drag & drop (`draggable` + `onDragStart`/`onDrop`, `TaskList.tsx:524-555`, `:602-605`; Hoy en `today/TaskGroup.tsx:175-196`). Con el dedo no es fiable (depende del navegador y en la práctica no funciona de forma consistente en móviles). No hay alternativa sin arrastre.

**Comportamiento esperado (KISS, en dos pasos):**

1. **Obligatorio:** en el menú «⋯» de la tarjeta (o con pulsación larga de 400 ms), acción **«Mover a…»** que abre una hoja con las columnas (nombre + contador) y mueve con el mismo `PATCH` que el drop (`column_id`, o `dateBucketPatch` en el kanban por fechas). Respeta `wip_exceeded` (`TaskList.tsx:546-549`).
2. **Opcional (si cabe sin librerías):** arrastre con Pointer Events tras pulsación larga, con **autoscroll horizontal** cuando el dedo está a < 48 px del borde del carrusel (velocidad proporcional) y snap al soltar. Si no se hace en esta PR, dejarlo anotado como pendiente.

**Criterios de aceptación:**

- [ ] 390×844 (`hasTouch: true`): «Mover a… → Hoy» mueve la tarjeta y el contador de ambas columnas se actualiza sin recargar.
- [ ] Con WIP superado, se muestra `wipExceeded` y la tarjeta no se mueve.
- [ ] Accesible por teclado en escritorio (el menú es un `menu` con `menuitem`).
- [ ] Si se implementa el arrastre: a 390 px, arrastrar una tarjeta al borde derecho desplaza el carrusel a la columna siguiente en < 1 s.

## 4. Ficheros que PUEDE tocar (propiedad exclusiva de B)

**Componentes:**

- `apps/web/src/features/tasks/TaskList.tsx` (kanban de lista, `TaskRow` y `RowModel`), `apps/web/src/features/tasks/row-date.ts` (si hace falta).
- `apps/web/src/features/today/**`: `TaskGroup.tsx`, `today.css`, `TodayPage.tsx` (solo modo kanban), `board.ts`, `groups.ts`.
- `apps/web/src/components/ui.css`: **solo** las secciones `.kanban*` (≈ `:358-413`, `:3018-3066`). Nadie más edita `ui.css`.
- `apps/web/src/components/ViewMenu.tsx` y `apps/web/src/features/views/**` (solo si el modo kanban lo exige).
- `apps/web/src/features/matrix/**` (solo si comparte estilos de columna; en principio no hace falta).

**Ficheros nuevos:**

- `apps/web/src/features/tasks/kanban-wt-b.css`, `KanbanTabs.tsx`, `KanbanMoveSheet.tsx`;
- `apps/web/src/features/tasks/i18n-wt-b.ts` + spec;
- `apps/web/playwright.wt-b.config.ts` (puerto 4192), `apps/web/e2e/wt-b-*.spec.ts` y `apps/web/e2e/wt-b.fixture.ts`.

## 5. Ficheros que NO debe tocar

| Fichero o carpeta                                                                                                | Propietario              |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `apps/web/src/features/tasks/TaskDetail.tsx`                                                                     | E                        |
| `apps/web/src/features/tasks/composer.css`, `TaskComposer`/`CaptureSheet`                                        | nadie (fuera de alcance) |
| `apps/web/src/components/Popover.tsx`, `DatePopover.tsx`, `inline-time.css`, `components/period/**`              | A (usar sí, editar no)   |
| `apps/web/src/features/calendar/**`, `features/places/**`, `shell/**`                                            | A                        |
| `apps/web/src/features/settings/**`, `apps/web/src/api.ts`                                                       | C / E                    |
| `apps/web/src/features/product/**`, `features/focus/**`, `features/statistics/**`                                | E                        |
| `apps/web/src/i18n/es.ts`, `en.ts`, `extra.ts`, `styles/tokens.css`                                              | nadie                    |
| `apps/api/**`, `packages/**`                                                                                     | C / D / E                |
| `package.json`, `pnpm-lock.yaml`, `CHANGELOG.md`, `.github/**`, `playwright.r80.config.ts`, `e2e/r80.fixture.ts` | nadie                    |

## 6. Cómo evitar conflictos (específico de B)

- **`ui.css` es enorme y lo usan todos**, pero solo B lo edita, y solo en las reglas `.kanban*`. No reordenes ni reformatees el resto del fichero: el diff debe limitarse a las líneas del kanban.
- **Sin cambios de API:** «Mover a…» usa el mismo `PATCH` que el drop (`column_id` o `dateBucketPatch`). No regeneres OpenAPI.
- **No dependas de 112 (D)**: el contador de la fila sale del listado, que ya es correcto.

## 7. Tests a añadir

| Tipo   | Fichero                                                    | Qué cubre                                                                                                                |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Unit   | `features/tasks/i18n-wt-b.spec.ts`                         | claves es/en y plurales                                                                                                  |
| Unit   | `features/tasks/kanban-move.spec.ts`                       | destino y patch de «Mover a…» (`column_id` y buckets de fecha); WIP excedido                                             |
| Unit   | `features/tasks/row-model.spec.ts`                         | `linkCount` 0/1/2                                                                                                        |
| e2e    | `e2e/wt-b-kanban-mobile.spec.ts` (360/390, `hasTouch`)     | snap mandatory, `scroll-snap-stop`, ancho de columna, pestañas, cabecera fija, columna vacía, no crear al tocar el fondo |
| e2e    | `e2e/wt-b-kanban-desktop.spec.ts` (768/1280, claro/oscuro) | fondos distintos (página ≠ columna ≠ tarjeta), contraste, `is-over` con acento                                           |
| e2e    | `e2e/wt-b-move.spec.ts`                                    | «Mover a… → Hoy» actualiza los contadores; WIP                                                                           |
| e2e    | `e2e/wt-b-links.spec.ts`                                   | 128                                                                                                                      |
| Global | todos                                                      | sin scroll horizontal de página; solo `.kanban` tiene `scrollWidth > clientWidth`                                        |

**Fixture:** una lista con 5 columnas (una vacía) y unas 15 tareas, una de ellas con 2 enlaces; Hoy con vencidas, hoy y mañana.

## 8. Checklist de verificación manual

| #   | URL                                          | Ancho                  | Qué comprobar                                                                                                                                                                                          |
| --- | -------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `/list/<lista con columnas>?view=kanban`     | 390 / 360              | Columna casi a todo el ancho con 24–40 px de la siguiente; un deslizamiento rápido avanza **una** columna; pestañas con nombre y contador; la cabecera de columna queda fija al hacer scroll vertical. |
| 2   | Igual                                        | 390                    | Tocar el hueco de una columna no abre el composer; «⋯ → Mover a…» mueve y actualiza los contadores.                                                                                                    |
| 3   | Igual                                        | 1280, claro y oscuro   | Columnas grises distintas de la página; tarjetas distintas de la columna; arrastrar muestra el contorno discontinuo de acento.                                                                         |
| 4   | `/today` en kanban                           | 390 / 1280             | Mismo aspecto; la cabecera no pliega la columna.                                                                                                                                                       |
| 5   | `/list/b7e06139-a8b5-4ed5-b60b-25bd27358b9d` | 1280 / 390             | La fila «UI-r80 enlaces y adjuntos» muestra 🔗 2.                                                                                                                                                      |
| 6   | Todas                                        | 360 / 390 / 768 / 1280 | Sin scroll horizontal de página.                                                                                                                                                                       |

## 9. Prompt para Codex (también en `ttd-wt-b-kanban-prompt.txt`)

```text
Trabaja en el repo povedica/tick-tack-done.
Crea un worktree propio desde main actualizado (318fbd9 o posterior):
  git worktree add ../ttd-wt-b -b codex/wt-b-kanban main
Copia en el repo docs/audit/ttd-wt-b-kanban.md (este documento). Si docs/ no existe, usa test-artifacts/audit/.
Léelo entero: es autónomo y es la única fuente de requisitos.

Objetivo: kanban (móvil y escritorio), mover tarjetas y contador de enlaces en la fila.
Puntos: TTD-AUD-109, 108, 110, 128.

Reglas clave:
- Este paquete se desarrolla EN PARALELO con otros 4 paquetes (A–E) en otros worktrees.
- Modifica SOLO los ficheros de «Ficheros que PUEDE tocar».
- NO edites los de «NO debe tocar», ni i18n/es.ts, en.ts o extra.ts, ni styles/tokens.css, package.json, pnpm-lock.yaml, CHANGELOG.md o .github/.
- i18n en tu fichero propio. Tokens CSS en tu fichero propio. Playwright con tu config y tu puerto.
- OpenAPI/SDK solo regenerados, en un commit aparte.
- Una PR «fix(wt-b): kanban (móvil y escritorio), mover tarjetas y contador de enlaces en la fila», con un commit por punto en el orden de la sección 3.
- Tests unitarios, de integración y e2e según el documento. Capturas antes/después a 360/390/768/1280, claro y oscuro, donde aplique.
- pnpm format:check, lint, typecheck, test, los e2e propios (y test:integration si tocas la API), todo en verde.
- En la PR, recorre cada criterio de aceptación con ✅/❌ y evidencia.
- KISS. No inventes datos: lo que no reproduzcas, anótalo como «a verificar» con evidencia.
```
