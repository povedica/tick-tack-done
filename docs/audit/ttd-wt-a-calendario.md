# Paquete A · Calendario (UI): filtros, hojas móviles, bloques, «+N», periodo y Mes móvil

- **Repo:** povedica/tick-tack-done · **Base:** `main` en `318fbd9` (producción el 23/10/2026)
- **Rama/worktree:** `git worktree add ../ttd-wt-a -b codex/wt-a-calendario main`
- **PR:** `fix(wt-a): calendario — filtros, hojas móviles, bloques, +N y periodo`
- **Prioridad:** P1 · **Tamaño:** L (7 puntos, solo web)
- **Rutas:** `web/` = `apps/web/src/`. Las líneas son de `318fbd9`; si se han movido, busca el símbolo.

## 1. Objetivo y contexto

Dejar el calendario usable en escritorio, tableta y móvil:

- el sidebar de filtros se maqueta bien y hace scroll (también con la rueda);
- la hoja móvil de filtros tiene cabecera fija y «Listo»;
- las hojas inferiores (filtros y fecha) nunca cortan sus acciones;
- los bloques cortos muestran la hora;
- «+N» abre un popover anclado;
- el selector de periodo usa el formato de fecha local;
- el Mes en móvil no trunca píldoras.

**Fuentes:**

1. Feedback de Pablo del 23/10/2026 («falla la maquetación de los filtros del calendario»).
2. Capturas de producción `r105-shots/PROD-r105_calendario-escritorio-1280.webp`, `PROD-r105_filtros-movil-393.webp` y `PROD-r105_mes-movil-393.webp`.
3. Prueba UI de r80 en producción (23/10/2026 21:05–21:27, hora de Madrid; capturas en `r80-ui-shots/`): fallos y parciales de 88, 89, 90 y 93.
4. Lectura del código en `318fbd9`.

**Datos de prueba en producción** (lista `grokbot-ticktackdone`, solo para comprobar manualmente; los e2e usan su fixture):

| Uso                                | id                                                                           | Tarea                     |
| ---------------------------------- | ---------------------------------------------------------------------------- | ------------------------- |
| Solapes de 10:00 a 11:00 del 27/10 | `4ec354f7-e3c7-4fa1-9789-de8404a90233`                                       | UI-r80 día solape A 10-11 |
| Solapes de 10:00 a 11:00 del 27/10 | `37bda3c1-f626-4778-b5cb-def64ce09ad8`                                       | UI-r80 día solape B 10-11 |
| Bloque de 30 min, 28/10            | `796ebb52-65e2-4819-a748-fc3428ed4ddf`                                       | UI-r80 bloque 30 min…     |
| Bloque de 15 min, 28/10            | `4b3c5506-4364-436d-805a-0d8473c59e1b`                                       | UI-r80 bloque 15 min      |
| Bloque de 60 min, 28/10            | `cc919527-b393-465c-b077-a0f59637e6b6`                                       | UI-r80 bloque 60 min      |
| 6 tareas el 29/10                  | `c087805c…`, `bb508114…`, `4f60df4d…`, `7d13e724…`, `0bc5d091…`, `fe0a7441…` | UI-r80 celda 1..6/6       |
| Fecha desde el detalle             | `cab82517-83ac-4823-b082-defa1368b9d4`                                       | UI-r80 título largo…      |

## 2. Reglas de trabajo en paralelo (obligatorias)

Este paquete se trabaja **a la vez que otros 4**, cada uno en su propio worktree. Ninguno depende de que otro se haya fusionado. Para que el merge sea limpio:

1. **Base y rama.**
   - Parte de `main` actualizado: `318fbd9` o posterior; producción está en `318fbd9`.
   - Crea el worktree: `git worktree add ../ttd-wt-a -b codex/wt-a-calendario main`.
   - **Una PR** con un commit por punto: `fix(TTD-AUD-NNN): …` o `feat(TTD-AUD-NNN): …`.
2. **Ficheros.**
   - Solo puedes modificar los de la sección «Ficheros que PUEDE tocar». Puedes crear ficheros nuevos dentro de esas carpetas.
   - Si necesitas tocar un fichero de «NO debe tocar», **para**: busca una alternativa local (envolver, componer, CSS con más especificidad en tu propio fichero) o déjalo anotado en la PR como «pendiente de otro paquete». No lo edites.
3. **Sin dependencias nuevas.** No toques `package.json`, `pnpm-lock.yaml`, `.github/` ni `CHANGELOG.md`. La entrada de changelog va en la descripción de la PR; Pablo la consolida al fusionar.
4. **i18n.**
   - **No edites** `apps/web/src/i18n/es.ts`, `en.ts` ni `extra.ts`: todos los paquetes web chocarían ahí.
   - Crea `apps/web/src/features/calendar/i18n-wt-a.ts` con `const es = {…}` y `const en = {…}` (mismas claves) y un hook `useWtAMessages()`.
   - El hook usa `useLocale` de `apps/web/src/i18n/locale.ts` y elige igual que `messagesFor()` (`es` salvo que el locale empiece por `en`).
   - Añade un spec junto al fichero que compruebe que `es` y `en` tienen las mismas claves.
   - Puedes **leer** las claves existentes con `useMessages()`.
5. **Tokens CSS.**
   - **No edites** `apps/web/src/styles/tokens.css`.
   - Los tokens nuevos van en `apps/web/src/features/calendar/calendar-wt-a.css` (`:root {…}` y `[data-theme='dark'] {…}`), importado desde tu componente.
   - Usa nombres con prefijo de tu zona para no pisar otros tokens.
6. **Tests e2e.**
   - No edites `playwright.r80.config.ts` ni `e2e/r80.fixture.ts`.
   - Crea `apps/web/playwright.wt-a.config.ts` (copia de `playwright.r80.config.ts`) con:
     - `testMatch: 'wt-a-*.spec.ts'`;
     - puerto **4191**;
     - proyectos de **360×780, 390×844, 768×1024 y 1280×800**, en claro y oscuro, llamados `wt-a-<ancho>-<light|dark>`.
   - Specs en `apps/web/e2e/wt-a-*.spec.ts` y datos en `apps/web/e2e/wt-a.fixture.ts`.
   - **Ojo:** `apps/web/playwright.config.ts` (`testDir: './e2e'`, sin `testMatch`) también recoge tus specs. Deben pasar también con esa config, o saltarse con `test.skip(!testInfo.project.name.startsWith('wt-a'), …)` si dependen de los anchos de tu config. **No edites** `playwright.config.ts`.
7. **API y BD.**
   - Si cambias rutas o DTO de la API, regenera **al final** con `pnpm --filter api build && pnpm --filter api openapi:generate && pnpm --filter @reflexionia/sdk generate`.
   - Haz commit de `apps/api/openapi.json`, `apps/api/src/mcp/api-operations.json` y `packages/sdk/src/generated/schema.d.ts` **en un commit aparte** `chore(api): regenerate openapi`. No los edites a mano.
   - Si al rebasar chocan, quédate con la versión de `main` y vuelve a generarlos.
   - Para los tests de integración usa una BD propia: `DATABASE_URL=…/ttd_wt_a`.
8. **Evidencias:** `test-artifacts/audit/evidencias/wt-a/<ID>_<pantalla>_<antes|despues>_<ancho>_<light|dark>.png`. Pon una tabla por punto en la PR.
9. **Verificación antes de la PR:**
   - `pnpm format:check`, `pnpm lint`, `pnpm typecheck` y `pnpm test`.
   - Los e2e propios: `pnpm --filter web exec playwright test -c playwright.wt-a.config.ts`.
   - `pnpm test:integration` si tocas la API.
   - Recorre cada criterio en la PR: «✅ cómo/ancho» o «❌ por qué».
10. **KISS:** el cambio mínimo que cumpla los criterios. Sin refactors fuera del alcance. Lo que no puedas reproducir, documéntalo en la PR con evidencia («a verificar»).

## 3. Puntos (orden de commits)

| Orden | ID          | Prio | Título                                                                                                  | Tamaño |
| ----- | ----------- | ---- | ------------------------------------------------------------------------------------------------------- | ------ |
| 1     | TTD-AUD-105 | P1   | Sidebar de filtros del calendario: CSS duplicado, sin scroll (tampoco con la rueda) y hueco 769–1023 px | M      |
| 2     | TTD-AUD-106 | P1   | Hoja móvil «Filtrar calendario»: cabecera fija, «Listo», scroll interno, safe-area y casillas reales    | M      |
| 3     | TTD-AUD-132 | P1   | Hoja de fecha en móvil: la fila «Quitar fecha / Hecho» queda cortada                                    | S      |
| 4     | TTD-AUD-131 | P2   | Semana/Día: el bloque de 30 min pierde la hora                                                          | S      |
| 5     | TTD-AUD-130 | P2   | «+N» en Dos semanas y Mes: popover anclado en escritorio                                                | S      |
| 6     | TTD-AUD-133 | P2   | Selector de periodo con formato de fecha local                                                          | S      |
| 7     | TTD-AUD-107 | P2   | Mes en móvil: píldoras truncadas a 2 caracteres                                                         | S      |

### 3.1 Nuevos puntos abiertos por la prueba UI de r80 (23/10/2026)

#### TTD-AUD-130 · P2 · «+N» en Dos semanas y Mes: popover anclado en escritorio

**Observado en producción:** a 1280 px, en `/calendar/two-weeks?date=2026-10-29`, la celda del 29 tiene 6 tareas (`UI-r80 celda 1..6/6`). Al pulsar «+N» se abre un **modal centrado** con overlay. A 390 px se abre una hoja inferior, que está bien. TTD-AUD-88 pedía «al pulsar +N se abre el popover del día».

**Causa:**

- `apps/web/src/features/places/Places.tsx:1469-1473` pinta `button.calendar-overflow` con `onClick={() => onPick?.(key)}`.
- El día elegido lo muestra un componente con `<dialog>` y `showModal()` (`Places.tsx:2110-2135`): siempre es un modal, sin ancla.

**Cambio propuesto (KISS):**

- **≥ 769 px:** pintar el contenido del día dentro de `Popover` (`apps/web/src/components/Popover.tsx`, que ya soporta ancla y viewport visual), anclado al botón «+N».
  - Ancho `min(320px, 100vw - 32px)` y alto máximo `min(60dvh, 480px)`, con scroll interno.
  - Cabecera con la fecha larga («jue, 29 oct») y botón cerrar de 32 px.
  - Se cierra con Esc, al hacer clic fuera, o al abrir una tarea (navega al detalle como hoy).
- **≤ 768 px:** se mantiene la hoja inferior actual.
- El foco va al primer elemento del popover y vuelve al «+N» al cerrar.
- Mismo comportamiento en Mes (mismo botón `calendar-overflow`).

**Criterios de aceptación:**

- [ ] 1280×800 y 768×1024: tras pulsar «+N» en la celda del 29, el popover queda **dentro del viewport**, su borde superior o inferior está a ≤ 8 px del botón y su `x` se solapa con la celda. No existe `dialog[open]` modal (`page.locator('dialog:modal')` → 0).
- [ ] El popover lista las 6 tareas con su título completo (sin `…` si caben en 2 líneas).
- [ ] Esc lo cierra y `document.activeElement` vuelve a ser el botón «+N».
- [ ] 390×844 y 360×780: hoja inferior a todo el ancho (`x = 0`, `width = innerWidth`), como hoy.
- [ ] Claro y oscuro: fondo del popover ≠ fondo de la rejilla; contraste del texto ≥ 4,5:1.

**Tests:** e2e `wt-a-overflow.spec.ts` (1280, 768, 390), con 6 tareas el mismo día en el fixture.

#### TTD-AUD-131 · P2 · Semana/Día: el bloque de 30 min pierde la hora

**Observado:** en `/calendar/week?date=2026-10-28`, `UI-r80 bloque 30 min con un título bastante largo…` (12:00–12:30) muestra solo el título truncado, **sin la hora**. El de 15 min muestra solo el título (correcto según 89) y el de 60 min está bien.

**Causa:**

- `apps/web/src/features/places/HourGrid.tsx:675-720`:
  - el bloque recibe `data-block-size='compact'` cuando mide < 32 px (`:681-682`);
  - el `<Link>` pinta primero el título (`calendarTaskLabel`) y después `<time className="hour-task-time"> · 12:00</time>` (`:711-720`) **en la misma línea**.
- `apps/web/src/features/calendar/calendar.css:1846-1855` aplica a `compact` `white-space:nowrap; text-overflow:ellipsis; overflow:hidden`. La elipsis se come la hora, que va al final.

**Cambio propuesto:**

- En `compact`, el `<Link>` pasa a `display:flex; gap:4px; min-width:0`. El título va en un `<span class="hour-task-title">` con `flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis` y la hora con `flex:none`.
- Así la hora **siempre** se ve («UI-r80 bloque 30… · 12:00»).
- `tiny` (< 18 px) sigue mostrando solo el título.
- Igual para eventos externos (`HourGrid.tsx:745-746`).
- `title` y `aria-label` siguen con el título completo **y** la hora.

**Criterios de aceptación:**

- [ ] 1280×800, Semana 28/10:
  - [ ] en el bloque de 30 min, `.hour-task-time` es visible y su `boundingBox()` queda dentro del bloque (`right ≤ bloque.right`);
  - [ ] el título tiene `scrollWidth > clientWidth` (está truncado) y la hora no.
- [ ] En los bloques de 15, 30 y 60 min se cumple `scrollHeight ≤ clientHeight` en el contenedor de texto **[medible]**.
- [ ] El bloque de 15 min no muestra la hora (tiny); el de 60 min muestra título y hora en dos líneas o en una, sin desbordar.
- [ ] Lo mismo en Día (`/calendar/day?date=2026-10-28`) y en móvil, en 3 días si existe.

**Tests:** unit del helper de tamaño si lo extraes; e2e `wt-a-blocks.spec.ts` con tareas de 15, 30 y 60 min.

#### TTD-AUD-132 · P1 · Hoja de fecha en móvil: la fila «Quitar fecha / Hecho» queda cortada

**Observado:** a 390×844, en el detalle de una tarea → «Fecha límite», la hoja inferior se abre pero la fila de acciones («Quitar fecha» / «Hecho») queda **por debajo del borde** y hay que hacer scroll dentro de la hoja para verla. Desde el composer no se reprodujo.

**Causa (a confirmar reproduciendo):**

- `apps/web/src/components/Popover.tsx:56-70`: en modo hoja, el **panel entero** recibe `overflow:auto` y `maxHeight: min(var(--sheet-max-h-mobile), viewHeight)`.
- El asa (`:268-281`) y las acciones forman parte del mismo flujo con scroll. Así, si el calendario + hora + repetición superan la altura, las acciones quedan al final del scroll.
- Las acciones son `.popover-actions` (`apps/web/src/components/DatePopover.tsx:560-600`), y sus estilos están en `features/today/today.css:640,716` y `features/tasks/composer.css:235`, **ficheros que no son de este paquete**.

**Cambio propuesto (comparte la solución de 106):**

- En `Popover`, modo hoja: el panel pasa a `display:flex; flex-direction:column; overflow:hidden` con tres zonas:
  - cabecera (asa) con `flex:none`;
  - cuerpo con `flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain`;
  - pie opcional con `flex:none`.
- Nueva prop `sheetFooter?: ReactNode` (o `sheetHeader`, como en 106). `DatePopover` pasa sus `popover-actions` como pie **solo en modo hoja**.
- Estilos del pie en `apps/web/src/components/inline-time.css`, con el selector `.date-popover.is-bottom-sheet .sheet-footer`:
  - `padding: var(--sp-2) var(--sp-3) calc(var(--sp-2) + env(safe-area-inset-bottom))`;
  - `border-top: 1px solid var(--border)`;
  - fondo opaco.
- No edites `today.css` ni `composer.css`: si sus reglas interfieren, sobrescríbelas con más especificidad desde `inline-time.css`.
- En escritorio no cambia nada.

**Criterios de aceptación:**

- [ ] 390×844 y 360×780, desde el detalle de `cab82517` y desde el composer:
  - [ ] el botón «Hecho» es visible **sin scroll** (`boundingBox().y + height ≤ innerHeight`);
  - [ ] la fila de acciones queda a ≤ 1 px del borde inferior de la hoja.
- [ ] Con `visualViewport` reducido a 500 px (teclado emulado: `page.setViewportSize({width:390,height:500})`) «Hecho» sigue visible y el cuerpo hace scroll.
- [ ] Hacer scroll en el cuerpo no mueve el asa ni el pie (`boundingBox().y` constante, ±1 px).
- [ ] 1280×800: el popover de fecha está como hoy, entero dentro del viewport en los cuatro bordes.
- [ ] Claro y oscuro, con capturas.

**Tests:** e2e `wt-a-date-sheet.spec.ts` (360, 390 y 390×500) y unit de `Popover` (render en modo hoja con pie).

#### TTD-AUD-133 · P2 · Selector de periodo con formato de fecha local

**Observado:** en el calendario, el botón del periodo abre el **date picker de tareas** (el de «Fecha límite», con atajos «Hoy/Mañana…»). TTD-AUD-93 pedía mostrar la fecha según el locale («28/10/2026» o «28 oct 2026») en el `PeriodNavigator`.

**Causa:**

- `apps/web/src/components/period/PeriodNavigator.tsx` (lo usan `Places.tsx:328`, `CalendarControls.tsx:67` y también `features/product/WeekPicker.tsx:37`, del paquete E) reutiliza el `DatePopover` de tareas.
- Revisa qué texto pinta el disparador y qué variante del popover abre.

**Cambio propuesto:**

- `PeriodNavigator` usa una variante **«solo fecha»** del `DatePopover`, sin atajos de tarea, hora, repetición ni recordatorio: solo el minicalendario mensual.
- El botón muestra la fecha del cursor con `Intl.DateTimeFormat(locale, {day:'2-digit', month:'2-digit', year:'numeric'})` → «28/10/2026» en `es-ES`, «28/10/2026» en `en-GB` y «10/28/2026» en `en-US`.
- Accesibilidad: el nombre accesible incluye la fecha larga.
- La variante se añade como prop (`mode='date-only'`) en `DatePopover`, sin romper sus usos actuales.
- Como `WeekPicker` (E) usa el mismo `PeriodNavigator`, **verifica que `/reports/weekly` sigue funcionando**, pero no edites `WeekPicker.tsx`.

**Criterios de aceptación:**

- [ ] En `es-ES`, el botón del periodo en `/calendar/week?date=2026-10-28` muestra `28/10/2026`. Con `locale: 'en-US'` en Playwright muestra `10/28/2026`.
- [ ] El popover del periodo no muestra «Hoy/Mañana/Próxima semana» de tareas ni campos de hora o repetición; elegir el 5 navega a `?date=2026-11-05`.
- [ ] `rg 'type="date"' apps/web/src/features/places apps/web/src/features/calendar apps/web/src/components/period` → 0 resultados.
- [ ] `/reports/weekly` sigue mostrando su selector de semana (e2e de humo, solo lectura).
- [ ] 390×844: el selector se abre como hoja (como 132) con «Hecho» visible.

**Tests:** unit del formateo (es-ES, en-US, en-GB); e2e `wt-a-period.spec.ts`.

### 3.2 Ampliación de TTD-AUD-105 tras la prueba UI

Añade este criterio a los de 105:

- [ ] **Rueda del ratón:** a 1280×800, con 25 listas + 10 etiquetas + 3 filtros + 2 calendarios, `page.mouse.move()` sobre el sidebar y `page.mouse.wheel(0, 800)` → el `scrollTop` del contenedor de fuentes aumenta. Esto se observó roto en producción el 23/10: el scroll por programa sí funcionaba, la rueda no.
- **Causa probable (a verificar):** `.sidebar` tiene `overflow:hidden` (`apps/web/src/shell/shell.css:122-131`) y el contenido del calendario no tiene un hijo con `min-height:0; overflow-y:auto`. O bien hay una capa con `pointer-events` encima. Inspecciona con `document.elementFromPoint` en el centro del sidebar.

### 3.3 Puntos de r105 (especificación original, vigente salvo los ajustes de la sección 2)

> **Ajustes respecto al texto original:**
>
> - Los tokens nuevos **no** van en `styles/tokens.css`, sino en `apps/web/src/features/calendar/calendar-wt-a.css`.
> - Las claves i18n (`calWeekShort`, `calendarFilterDone`, `calendarSourcesCount`) van en `apps/web/src/features/calendar/i18n-wt-a.ts`.
> - Los e2e van en tu config propia.

##### TTD-AUD-105 · P1 · Sidebar de filtros del calendario: CSS duplicado, sin scroll y hueco 769–1023 px

**Estado actual (318fbd9):**

1. **Dos definiciones de `.calendar-sources` con la misma especificidad:**
   - `web/features/calendar/sources.css:1-4` → `padding: var(--sp-2); font-size: var(--fs-sm)`.
   - `web/features/calendar/calendar.css:456-462` → `border:0; padding:0; margin:0; display:grid; gap:10px`.
   - Gana la que el bundle cargue después; en producción ambas van en el mismo `index-*.css`, así que el resultado depende del orden de importación (`CalendarSources.tsx:8` importa `sources.css`; `calendar.css` lo importa `Places`). Cualquier cambio de orden de imports altera padding/gap del sidebar sin tocar estilos.
   - Reglas **muertas** de un marcado anterior con `<fieldset>/<legend>`: `calendar.css:463-467`, `:1022`, `:1041-1048`, `:1321-1328`. El componente actual usa `<details>/<summary>` (`CalendarSources.tsx:67-121`); `summary` solo tiene el estilo mínimo de `sources.css:8-12` (marcador nativo ▶, sin contador ni icono).
2. **Sin contenedor de scroll:** `.sidebar` es `display:flex; flex-direction:column; overflow:hidden; max-height:100dvh` (`web/shell/shell.css:122-131`). En el sidebar normal, el hijo `> nav` tiene `flex:1; min-height:0; overflow-y:auto` (`shell.css:133-139`). **`CalendarSidebar` no tiene ese hijo** (`web/shell/CalendarSidebar.tsx:52-105`): el minicalendario y `.calendar-sources` cuelgan directamente de `.sidebar`, sin `min-height:0` ni `overflow-y:auto`. Con muchas listas/etiquetas/calendarios, lo que no cabe **queda recortado e inaccesible** (en la captura de 1280×800 se ve hasta ~20 listas; Etiquetas, Filtros y Calendarios suscritos quedan por debajo — **a verificar** si se pueden alcanzar).
3. **Hueco de breakpoints:** `AppShell.tsx:181` solo pinta `CalendarSidebar` si `!narrow` (≥ 1024 px); por debajo, el cajón muestra el `Sidebar` general. Pero `sources.css:39-43` oculta `.calendar-filter-menu` (el botón de filtros de la barra) desde **769 px**. Resultado: **entre 769 y 1023 px no hay ninguna forma de filtrar el calendario**. Los e2e (`e2e/r80-calendar-sources.spec.ts`) solo prueban 390 y 1280, por eso no lo detectaron.
4. El grupo «Todo» es un `<details>` con una sola fila (`CalendarSources.tsx:67-84`): se puede plegar, cosa sin sentido.
5. Todas las filas de un grupo repiten el icono del grupo (`List`, `Tag`…) coloreado (`:90-94`); bien, pero el `summary` no indica cuántas fuentes hay activas.

**Comportamiento esperado:**

1. **Una sola fuente de estilos:** todo `.calendar-sources*` en `sources.css`; borrar de `calendar.css` las reglas de los puntos 1 y las de `legend`. Mantener en `calendar.css` solo lo específico de la hoja (`.calendar-filter-content …`) si sigue haciendo falta, sin redefinir `display/padding/gap` del contenedor.
2. **Sidebar con zonas:** `.calendar-sidebar` = minicalendario fijo arriba (`flex: none`) + `.calendar-sources` con `flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; scrollbar-gutter: stable`. El minicalendario nunca se desplaza.
3. **Breakpoints coherentes:** el botón de filtros de la barra se muestra **siempre que no se vea el `CalendarSidebar`**, es decir `< 1024 px` (cambiar `sources.css:39` a `min-width: 1024px`). De 769 a 1023 px abre como popover anclado; ≤ 768 px como hoja (106).
4. **«Todo» fuera de `<details>`:** una fila fija arriba. Su casilla es `checked` si todo está visible, `indeterminate` (propiedad DOM) si hay selección parcial y vacía si no hay nada.
5. **`summary` de cada grupo:** chevron propio (rotación 90°), nombre, y contador «n/m» a la derecha en `--ink-3`; ocultar el marcador nativo (`summary::-webkit-details-marker{display:none}; list-style:none`). Estado plegado/desplegado recordado en `localStorage` (`ttd.calendar.sources.open`).
6. **Columna de semana:** el rótulo `S` está escrito a mano en `web/features/places/Places.tsx:1279` (fuera de i18n). Usar clave i18n `calWeekShort` («Sem» / «Wk»), con `title`/`aria-label` = `calWeekNumber`.

**Criterios de aceptación:**

- [ ] `rg "\.calendar-sources" web/features/calendar/calendar.css` solo devuelve selectores con prefijo `.calendar-filter-content` (o ninguno); no queda ningún selector `legend` en `calendar.css`.
- [ ] 1280×800 con 25 listas + 10 etiquetas + 3 filtros + 2 calendarios: el último calendario suscrito se alcanza con scroll **dentro** del sidebar (`scrollIntoView` + `toBeVisible`), y el minicalendario mantiene su `boundingBox().y` antes y después del scroll (±1 px).
- [ ] 1280×800: filas de fuente de **32 px** [medible] (como en TTD-AUD-93); `summary` de 32 px con contador «n/m».
- [ ] **768×1024 y 900×800:** existe un botón visible de filtros en la barra del calendario (`.calendar-filter-menu > button` con `boundingBox().width > 0`); a 1280 no se ve.
- [ ] Desmarcar «Listas → casa» deja «Todo» en `indeterminate` (`await row.evaluate(e => e.indeterminate)` = true).
- [ ] La cabecera de la columna de semana del mes es «Sem» en `es` y «Wk» en `en`.
- [ ] Criterio global de scroll horizontal a 360/390/768/1280.

##### TTD-AUD-106 · P1 · Hoja móvil «Filtrar calendario»: cabecera fija, «Listo», scroll interno, safe-area y casillas reales

**Estado actual:**

- `web/components/Popover.tsx:56-70`: en modo hoja (≤ 768 px) el **panel entero** recibe `overflow:auto` y `maxHeight: min(var(--sheet-max-h-mobile), viewHeight)`; `--sheet-max-h-mobile = min(88dvh, 720px)` (`styles/tokens.css:529`). El asa (`.sheet-handle`, `Popover.tsx:268-281`) se desplaza con el contenido y desaparece al hacer scroll.
- No hay título visible, ni botón de cerrar/«Listo»: solo se cierra con el asa (arrastre > 64 px), tocando el fondo o con Escape (captura `PROD-r105_filtros-movil-393.webp`: ~88 % de la altura, lista larga de listas y ningún control de cierre).
- No hay `padding-bottom: env(safe-area-inset-bottom)`: en iPhone la última fila queda bajo el indicador de inicio (**a verificar en dispositivo**). Solo `.date-popover.is-bottom-sheet` tiene estilos de hoja (`components/inline-time.css:56-80`); `.calendar-filter-popover` solo define una variable de ancho (`calendar.css:1242-1244`).
- **Casillas que parecen radios:** `sources.css:27-38` hace `appearance:none` + `border-radius: var(--radius-full)` + relleno `--accent` con anillo interior. Es un `input type=checkbox` (multiselección), pero se ve como un **radio** (captura: todas las filas con círculo azul). TickTick usa casilla redondeada con ✓ en filtros multiselección.
- Todos los grupos abiertos por defecto (`<details open>` en `CalendarSources.tsx:86`): con 20+ listas, Etiquetas/Filtros/Calendarios quedan muy abajo.

**Comportamiento esperado (TickTick):**

1. **Estructura de la hoja** (solo para `calendar-filter-popover`, sin romper otras hojas): `display:flex; flex-direction:column; overflow:hidden` en el panel; dentro:
   - cabecera **fija** (asa + título «Filtrar calendario» + botón «Listo» a la derecha, 44 px de alto);
   - cuerpo con `flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain`;
   - `padding-bottom: calc(var(--sp-3) + env(safe-area-inset-bottom))`.
   - Implementación KISS: prop opcional `sheetHeader?: ReactNode` en `Popover` o envolver el contenido de `CalendarMenu` en `.sheet-header` + `.sheet-body`; mover `overflow:auto` del estilo inline al `.sheet-body` cuando haya cabecera.
2. **«Listo»** cierra la hoja (los cambios ya se aplican al momento, como hoy).
3. **Casilla cuadrada** de 18 px, `border-radius: var(--radius-sm)`, con ✓ (SVG o `::after`) al marcar, en sidebar y hoja. Nada de círculos para multiselección.
4. En la hoja (≤ 768 px), grupos **plegados por defecto salvo «Listas»**, cada `summary` con contador «n/m» (mismo componente que 105.5).
5. Altura máxima de la hoja: `min(88dvh, 720px)` se mantiene; la cabecera nunca sale de la vista.

**Criterios de aceptación:**

- [ ] 360×780 y 390×844: con 25 listas, tras hacer scroll al final del cuerpo, la cabecera (título + «Listo») sigue visible con `boundingBox().y` igual al de antes (±1 px).
- [ ] «Listo» tiene ≥ 44×44 px [medible] y cierra la hoja; el foco vuelve al botón de filtros.
- [ ] La última fila queda por encima de `innerHeight - env(safe-area-inset-bottom)` (en Playwright: su `bottom` ≤ `innerHeight` del viewport y el cuerpo tiene `padding-bottom` ≥ `--sp-3`).
- [ ] La casilla marcada tiene `border-radius` < 50 % de su ancho (no es un círculo) y muestra ✓; contraste ≥ 3:1 frente al fondo en claro y oscuro.
- [ ] A 768×1024 se ve como hoja; a 900 px como popover anclado (ver 105.3).
- [ ] Criterio global de scroll horizontal.

##### TTD-AUD-107 · P2 · Mes en móvil: chips truncados a 2 caracteres

**Estado actual:** captura `PROD-r105_mes-movil-393.webp`. Cada celda muestra puntos y, debajo, una píldora roja (evento externo con icono de calendario) truncada a 1–2 caracteres («1…», «0…»). El código mezcla puntos y chips en `web/features/places/Places.tsx:1395-1450` (`dots ? … : chips.filter(…)`); a 393 px la celda mide ~45 px de ancho, insuficiente para icono + texto.

- **A verificar:** en la misma captura aparece un círculo gris parcialmente fuera de pantalla a la izquierda de la barra del calendario (x≈0). Identificar el elemento (¿`FocusTitle`? ¿indicador de foco?) y corregirlo.

**Comportamiento esperado (TickTick móvil, Mes):**

- ≤ 768 px: en la celda, **solo puntos de color** (máx. 4 + «+n»), sin píldoras con texto; los eventos externos de varios días como una barra fina de 3 px sin texto.
- Tocar un día abre la agenda de ese día bajo la rejilla (o navega a `/calendar/day?date=…`, lo que ya exista y sea más simple).

**Criterios de aceptación:**

- [ ] 360 y 390: ninguna celda del mes contiene texto truncado con `…` (`scrollWidth > clientWidth` = false para todos los chips de texto; o no hay chips de texto).
- [ ] Tocar un día con 3 elementos muestra esos 3 títulos completos.
- [ ] El círculo gris de la barra no aparece, o queda documentado qué es y está dentro del viewport.

## 4. Ficheros que PUEDE tocar (propiedad exclusiva de A)

**Componentes:**

- `apps/web/src/features/calendar/**`: `CalendarSources.tsx`, `CalendarFilterRow.tsx`, `CalendarControls.tsx`, `DayWeekStrip.tsx`, `ExternalEvent.tsx`, `calendar.css`, `sources.css`, `use-calendar-sources.ts`, etc.
- `apps/web/src/features/places/**`: `Places.tsx`, `HourGrid.tsx`, `month.ts`, `event-span.ts`, `hour.ts`, etc.
- `apps/web/src/shell/CalendarSidebar.tsx`.
- `apps/web/src/shell/shell.css`: solo reglas de `.sidebar`/`.calendar-sidebar` que afecten al calendario. Nadie más lo toca.
- `apps/web/src/shell/AppShell.tsx`: solo si 105.3 lo exige (el breakpoint del sidebar del calendario). Nadie más lo toca.
- `apps/web/src/components/Popover.tsx`, `apps/web/src/components/DatePopover.tsx` y `apps/web/src/components/inline-time.css`.
- `apps/web/src/components/period/**`: `PeriodNavigator.tsx`, `TodayMark.tsx`, `useCalendarToday.ts`.

**Ficheros nuevos:**

- `apps/web/src/features/calendar/calendar-wt-a.css` (tokens y estilos nuevos);
- `apps/web/src/features/calendar/i18n-wt-a.ts` + `i18n-wt-a.spec.ts`;
- `apps/web/playwright.wt-a.config.ts` (puerto 4191), `apps/web/e2e/wt-a-*.spec.ts` y `apps/web/e2e/wt-a.fixture.ts`;
- specs unitarios junto a los ficheros anteriores.

## 5. Ficheros que NO debe tocar (son de otro paquete o compartidos)

| Fichero o carpeta                                                                                                        | Propietario                                             |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `apps/web/src/features/tasks/**` (`TaskList.tsx`, `TaskDetail.tsx`, `composer.css`…)                                     | B (`TaskList`), E (`TaskDetail`); `composer.css`, nadie |
| `apps/web/src/features/today/**` (`today.css`, `TaskGroup.tsx`, `TodayPage.tsx`, `board.ts`)                             | B                                                       |
| `apps/web/src/components/ui.css`                                                                                         | B                                                       |
| `apps/web/src/features/settings/**`, `apps/web/src/api.ts`                                                               | C / E                                                   |
| `apps/web/src/features/product/**` (`WeekPicker.tsx`, `WeeklyPages.tsx`…), `features/focus/**`, `features/statistics/**` | E                                                       |
| `apps/web/src/i18n/es.ts`, `en.ts`, `extra.ts`, `apps/web/src/styles/tokens.css`                                         | compartidos: nadie los edita                            |
| `apps/api/**`, `packages/**`, `prisma/**`                                                                                | C / D / E                                               |
| `package.json`, `pnpm-lock.yaml`, `CHANGELOG.md`, `.github/**`, `playwright.r80.config.ts`, `e2e/r80.fixture.ts`         | nadie                                                   |

## 6. Cómo evitar conflictos (específico de A)

- **`Popover.tsx` y `DatePopover.tsx` son de A.** Otros paquetes los **usan** sin editarlos; por ejemplo, B puede usar `Popover` para «Mover a…».
  - Las props nuevas (`sheetHeader`, `sheetFooter`, `mode='date-only'`) deben ser **opcionales y retrocompatibles**: sin ellas, el render es idéntico al actual.
  - Añade un unit que lo compruebe (snapshot del DOM sin props nuevas).
- **`PeriodNavigator` lo usa también `WeekPicker` (E).** No cambies su API pública (props) de forma incompatible.
- Estilos de `.popover-actions` en hoja: sobrescríbelos desde `inline-time.css` con `.date-popover.is-bottom-sheet …`. No edites `today.css` ni `composer.css`.
- Sin cambios de API: este paquete no regenera OpenAPI.

## 7. Tests a añadir

| Tipo          | Fichero                                                | Qué cubre                                                                               |
| ------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Unit (vitest) | `features/calendar/source-selection.spec.ts` (ampliar) | estado `indeterminate` de «Todo», contador n/m                                          |
| Unit          | `components/Popover.spec.tsx` (nuevo)                  | hoja con cabecera y pie fijos; sin props nuevas el DOM no cambia                        |
| Unit          | `components/period/PeriodNavigator.spec.tsx` (nuevo)   | formato es-ES, en-US y en-GB; `mode='date-only'` sin atajos                             |
| Unit          | `features/places/hour.spec.ts` (ampliar)               | `compact`/`tiny` y presencia de la hora                                                 |
| Unit          | `features/calendar/i18n-wt-a.spec.ts`                  | mismas claves en es y en                                                                |
| e2e           | `e2e/wt-a-sidebar.spec.ts`                             | 105: scroll con rueda y por programa; minicalendario fijo; botón de filtros a 768 y 900 |
| e2e           | `e2e/wt-a-filter-sheet.spec.ts`                        | 106: cabecera fija, «Listo» de 44 px, safe-area, casilla cuadrada                       |
| e2e           | `e2e/wt-a-date-sheet.spec.ts`                          | 132                                                                                     |
| e2e           | `e2e/wt-a-blocks.spec.ts`                              | 131                                                                                     |
| e2e           | `e2e/wt-a-overflow.spec.ts`                            | 130                                                                                     |
| e2e           | `e2e/wt-a-period.spec.ts`                              | 133                                                                                     |
| e2e           | `e2e/wt-a-month-mobile.spec.ts`                        | 107                                                                                     |
| e2e global    | en cada spec                                           | `document.documentElement.scrollWidth === innerWidth` a 360/390/768/1280                |

**Fixture `wt-a.fixture.ts`:**

- 25 listas, 10 etiquetas, 3 filtros y 2 calendarios suscritos;
- 2 tareas de 10:00 a 11:00 el mismo día;
- bloques de 15, 30 y 60 min;
- 6 tareas el mismo día;
- 3 eventos externos en un día del mes.

## 8. Checklist de verificación manual (producción o preview, tras desplegar)

| #   | URL                                                       | Ancho                                  | Qué comprobar                                                                                                                                                          |
| --- | --------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/calendar/week?date=2026-10-28`                          | 1280                                   | Sidebar: minicalendario fijo; la rueda baja hasta «Calendarios suscritos»; filas de 32 px; «Todo» indeterminado al desmarcar una lista; contador n/m; columna «Sem».   |
| 2   | `/calendar/week`                                          | 900 y 768                              | Hay botón de filtros en la barra; a 900 abre un popover y a 768 una hoja.                                                                                              |
| 3   | `/calendar/month`                                         | 390 y 360                              | Hoja «Filtrar calendario» con título y «Listo» fijos; el cuerpo hace scroll; casillas cuadradas con ✓; grupos plegados salvo Listas; nada bajo el indicador de inicio. |
| 4   | Detalle de `cab82517` → «Fecha límite»                    | 390                                    | «Quitar fecha» y «Hecho» visibles sin scroll. Cerrar sin guardar.                                                                                                      |
| 5   | `/calendar/week?date=2026-10-28`                          | 1280                                   | `796ebb52` muestra «…· 12:00»; `4b3c5506` solo el título; `cc919527` completo.                                                                                         |
| 6   | `/calendar/two-weeks?date=2026-10-29` y `/calendar/month` | 1280 / 390                             | «+N» → popover anclado / hoja inferior.                                                                                                                                |
| 7   | `/calendar/week`                                          | 1280 / 390                             | Botón del periodo «28/10/2026»; el popover es solo un calendario.                                                                                                      |
| 8   | `/calendar/month`                                         | 390                                    | Sin píldoras «1…»; solo puntos; tocar un día muestra sus elementos; sin círculo gris en x≈0.                                                                           |
| 9   | Todas las anteriores                                      | 360 / 390 / 768 / 1280, claro y oscuro | Sin scroll horizontal de página.                                                                                                                                       |
| 10  | `/reports/weekly`                                         | 1280                                   | El selector de semana (E) sigue funcionando (no lo rompe `PeriodNavigator`).                                                                                           |

## 9. Prompt para Codex (también en `ttd-wt-a-calendario-prompt.txt`)

```text
Trabaja en el repo povedica/tick-tack-done.
Crea un worktree propio desde main actualizado (318fbd9 o posterior):
  git worktree add ../ttd-wt-a -b codex/wt-a-calendario main
Copia en el repo docs/audit/ttd-wt-a-calendario.md (este documento). Si docs/ no existe, usa test-artifacts/audit/.
Léelo entero: es autónomo y es la única fuente de requisitos.

Objetivo: calendario UI (filtros, hojas móviles, bloques cortos, +N, periodo y Mes móvil).
Puntos: TTD-AUD-105, 106, 132, 131, 130, 133, 107.

Reglas clave:
- Este paquete se desarrolla EN PARALELO con otros 4 paquetes (A–E) en otros worktrees.
- Modifica SOLO los ficheros de «Ficheros que PUEDE tocar».
- NO edites los de «NO debe tocar», ni i18n/es.ts, en.ts o extra.ts, ni styles/tokens.css, package.json, pnpm-lock.yaml, CHANGELOG.md o .github/.
- i18n en tu fichero propio. Tokens CSS en tu fichero propio. Playwright con tu config y tu puerto.
- OpenAPI/SDK solo regenerados, en un commit aparte.
- Una PR «fix(wt-a): calendario UI (filtros, hojas móviles, bloques cortos, +N, periodo y Mes móvil)», con un commit por punto en el orden de la sección 3.
- Tests unitarios, de integración y e2e según el documento. Capturas antes/después a 360/390/768/1280, claro y oscuro, donde aplique.
- pnpm format:check, lint, typecheck, test, los e2e propios (y test:integration si tocas la API), todo en verde.
- En la PR, recorre cada criterio de aceptación con ✅/❌ y evidencia.
- KISS. No inventes datos: lo que no reproduzcas, anótalo como «a verificar» con evidencia.
```

## Refinamiento local · Modal del día centrado · 26/10/2026

Pablo sustituye expresamente la posición anclada prevista en TTD-AUD-130 por una ventana centrada en escritorio al abrir una celda o «+N más». Se mantiene la hoja inferior en móvil. Mes y año («Octubre 2026») comparten una única cabecera con el cierre circular; el día y la semana siguen identificados en el contenido, sin repetir el mes. Anchura de hasta 640 px y altura limitada al viewport, cierre por Escape o fondo y devolución del foco al disparador. Se reutiliza `Popover` con una opción `centered` que no altera sus otros usos. Referencia RF-1101 y TTD-AUD-130. Verificación con fixture sintética en escritorio y móvil, claro y oscuro; sin cambios de API ni datos.

### Refinamiento del detalle diario del mes — 26/10/2026

Petición de Pablo, exclusivamente UI web, referencias RF-1101 y TTD-AUD-130/107. `DayDetails` sustituye la agenda reutilizada en el popup por una composición propia, sin modificar la vista Agenda ni los datos persistidos: cabecera en una línea («jueves 29 octubre»), cierre discreto de 32 px, Escape y devolución del foco. Superficie neutra con borde/sombra, sin el fondo tintado anterior. Se mantiene centrado en escritorio y hoja inferior en móvil.

Dos grupos: «Todo el día» y «Con hora». Checkbox alineado al mismo eje en ambos; columna de hora fija solo en el segundo, orden cronológico. Las tareas conservan el indicador de prioridad estándar `CalendarTaskMark`. Título principal y metadatos secundarios con lista pequeña y `TagChip` gris reducido. Los hashtags del título se extraen únicamente al renderizar y se deduplican con las etiquetas asociadas; no se reescriben los títulos ni se crean etiquetas. Los eventos externos usan icono de calendario y no muestran checkbox; los de medianoche aparecen sin «00:00» en Todo el día.

Cabecera y pie fijos; scroll exclusivamente en el listado. El pie «Añadir tarea a este día» crea con Enter mediante el endpoint público existente, lista contextual o bandeja de entrada, fecha seleccionada y zona del perfil; conserva el texto ante un error e idempotencia por intento. No usa IA ni envía `raw_text`. El mes admite como máximo tres chips visibles por celda, incluyendo barras de eventos, y muestra el resto mediante «+N más»; los puntos de móvil se limitan también a tres.

Pruebas visuales sintéticas nuevas con 1, 6 y 20 elementos: cabecera, limpieza de hashtags, tags reales, prioridad, orden, distinción de eventos, alineación, scroll interno, Enter y cierre con Escape. Capturas `test-artifacts/audit/evidencias/wt-a/day_detail_{1,6,20}_wt-a-*.png` en 360 claro, 390 oscuro, 768 claro y 1280 claro, revisadas visualmente. La prueba de overflow sustituye su antigua exigencia de fondo tintado por el borde de separación, conforme a la petición actual. Tipos/lint web y 256 unitarios correctos. No se modifica la API ni se realizan pruebas sobre los datos de trabajo.

Validación final ampliada: capturas también en 1280 oscuro; límite de tres chips comprobado tras la carga de datos. Lint y tipos del monorepo correctos; 890 unitarios correctos (dominio 341, SDK 11, API 282, web 256). Medianoche se detecta con la hora numérica de la zona del perfil, independiente del idioma.

Refinamiento posterior de Pablo: se recupera la composición visual de Agenda dentro del popup, con número de día/semana en un lateral, hora antes del checkbox, tipografía de fila normal y marca vertical con el color de la lista. Se mantienen tags, grupos, pie para añadir y scroll interno. Verificación con 1/6/20 elementos en escritorio claro y móvil oscuro. Esta petición actual sustituye la composición anterior de tarjeta con título destacado en cada fila.
