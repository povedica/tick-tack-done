---
title: "tick-tack-done — TTD-AUD-105 a 110: filtros del calendario y kanban móvil"
---

# tick-tack-done — TTD-AUD-105 a 110: filtros del calendario (sidebar y hoja móvil), mes móvil y kanban (móvil y escritorio)

- **Aplicación:** https://todo.reflexionia.com · **Repo:** povedica/tick-tack-done
- **Base del análisis:** `main` en **`318fbd9`** (merge de la PR #76, 23/10/2026 17:54, hora de Madrid). Incluye la PR #75 (`b841602`, TTD-AUD-80..104).
- **Producción** (comprobado el 23/10 a las 20:53, hora de Madrid): `GET /api/v1/health` → `commit 318fbd96…`, `version 0.2.0`, `built_at 2026-10-23T16:04:49Z` (18:04 hora de Madrid), `mcp_version 0.2.0+318fbd9`. Web: `index-tekMvRlG.js` / `index-C0eWdYmA.css`, `last-modified` 18:00 hora de Madrid. **Producción = `main`.**
- **Fuentes:**
  1. Feedback de Pablo del 23/10: «falla la maquetación de los filtros del calendario (sidebar con filtros)»; «el kanban en móvil requiere más acabado: columnas más intuitivas, navegables y con un fondo distinto del blanco».
  2. Capturas reales de producción del 23/10 (carpeta `r105-shots/`):
     - `PROD-r105_calendario-escritorio-1280.webp` — sidebar con minicalendario + «Todo» + ~20 listas; columna de semana rotulada «S».
     - `PROD-r105_filtros-movil-393.webp` — hoja «Filtrar calendario» a 393×852.
     - `PROD-r105_mes-movil-393.webp` — vista Mes a 393 px.
     - `PROD-r105_kanban-movil-a.webp`, `PROD-r105_kanban-movil-b.webp` — lista «casa» `?view=kanban` a 393 px.
     - `PROD-r105_kanban-escritorio.webp` — kanban a escritorio.
  3. Lectura del código en `318fbd9` y del CSS servido en producción (`index-C0eWdYmA.css`).
  4. Referencia de UX: TickTick (kanban móvil y filtros del calendario).
- **Rutas:** `web/` = `apps/web/src/`. Líneas de `318fbd9`; si se mueven, busca el símbolo.
- **Puntos de corte:** escritorio ≥ 1024 px; móvil ≤ 768 px; **769–1023 px** es la franja «tableta» (ver 105.3). `useNarrow()` = `(max-width: 1023px)` (`web/shell/AppShell.tsx:353`).
- **«A verificar»:** lo que no he podido reproducir. Codex lo reproduce antes de corregirlo; si no lo reproduce, lo anota en la PR con evidencia.
- **No verificado por mí:** no he renderizado la app localmente (la instalación de Playwright se interrumpió); las conclusiones de layout salen del código, del CSS de producción y de las capturas de arriba.

## 0. Instrucciones para Codex

1. **Una PR**: `fix(TTD-AUD-105..110): calendar filters and mobile kanban`, un commit por punto (`fix(TTD-AUD-NN): …`). Orden: 105 → 106 → 108 → 109 → 107 → 110.
2. **KISS:** solo CSS + cambios pequeños de marcado. Sin librerías nuevas (nada de dnd-kit ni carruseles de terceros). Reutiliza `Popover`, `TaskComposer`, `ui-badge`, tokens.
3. **Tokens** solo en `web/styles/tokens.css` (`:root` y `[data-theme='dark']`). **i18n** en `es.ts`, `en.ts`, `extra.ts`. **Accesibilidad:** 44 px de zona táctil en móvil (`--tap`), foco visible, roles correctos.
4. **Evidencias:** capturas antes/después a **360×780, 390×844, 768×1024 y 1280×800**, claro y oscuro, en `test-artifacts/audit/evidencias/r105/<ID>_<pantalla>_<antes|despues>_<ancho>_<light|dark>.png` (la carpeta `docs/` ya no existe desde `d227839`). Tabla por punto en la PR.
5. **Tests:** Playwright con `playwright.r80.config.ts` ampliado con proyectos de **360, 390, 768 y 1280** (hoy solo hay 390 y 1280). Reutiliza `e2e/r80.fixture.ts` añadiendo datos de prueba: 25 listas, 10 etiquetas, 3 filtros, 2 calendarios suscritos; y una lista con columnas y ~8 tareas para el kanban.
6. **Criterio global (todas las pantallas tocadas, a 360/390/768/1280):** `document.documentElement.scrollWidth === window.innerWidth` (sin scroll horizontal de página). El único scroll horizontal permitido es el **interior** del carrusel `.kanban` / `.today-layout.is-kanban`.
7. `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test` y los e2e afectados en verde. Recorre los criterios en la PR: «✅ cómo/ancho» o «❌ por qué».

## 1. Resumen del diagnóstico

| Síntoma (Pablo / capturas) | Causa en código |
|---|---|
| Sidebar de filtros del calendario «mal maquetado» | Dos hojas de estilo compiten por `.calendar-sources` y el sidebar no tiene contenedor con scroll (detalle en 105). |
| Hoja móvil «Filtrar calendario» enorme, sin cerrar/aplicar, filas con «radio» | `Popover` en modo hoja hace scroll de todo el panel, sin cabecera ni safe-area; la casilla se pinta circular (106). |
| Sin filtros entre 769 y 1023 px | JS oculta el sidebar del calendario por debajo de 1024 px y el CSS oculta el botón de filtros por encima de 768 px (105.3). |
| Kanban: columnas blancas sobre blanco | Una regla posterior pone `background: transparent` y `border: 0` a la columna (108/109). |
| Kanban móvil poco navegable | Sin `scroll-snap`, sin indicador de columnas, columnas de 300 px fijos, cabecera no fija (108). |
| Mover tarjetas entre columnas en móvil | Solo HTML5 drag & drop (`draggable`), que no es fiable con el dedo (110). |

---

#### TTD-AUD-105 · P1 · Sidebar de filtros del calendario: CSS duplicado, sin scroll y hueco 769–1023 px

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

---

#### TTD-AUD-106 · P1 · Hoja móvil «Filtrar calendario»: cabecera fija, «Listo», scroll interno, safe-area y casillas reales

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

---

#### TTD-AUD-107 · P2 · Mes en móvil: chips truncados a 2 caracteres

**Estado actual:** captura `PROD-r105_mes-movil-393.webp`. Cada celda muestra puntos y, debajo, una píldora roja (evento externo con icono de calendario) truncada a 1–2 caracteres («1…», «0…»). El código mezcla puntos y chips en `web/features/places/Places.tsx:1395-1450` (`dots ? … : chips.filter(…)`); a 393 px la celda mide ~45 px de ancho, insuficiente para icono + texto.
- **A verificar:** en la misma captura aparece un círculo gris parcialmente fuera de pantalla a la izquierda de la barra del calendario (x≈0). Identificar el elemento (¿`FocusTitle`? ¿indicador de foco?) y corregirlo.

**Comportamiento esperado (TickTick móvil, Mes):**
- ≤ 768 px: en la celda, **solo puntos de color** (máx. 4 + «+n»), sin píldoras con texto; los eventos externos de varios días como una barra fina de 3 px sin texto.
- Tocar un día abre la agenda de ese día bajo la rejilla (o navega a `/calendar/day?date=…`, lo que ya exista y sea más simple).

**Criterios de aceptación:**
- [ ] 360 y 390: ninguna celda del mes contiene texto truncado con `…` (`scrollWidth > clientWidth` = false para todos los chips de texto; o no hay chips de texto).
- [ ] Tocar un día con 3 elementos muestra esos 3 títulos completos.
- [ ] El círculo gris de la barra no aparece, o queda documentado qué es y está dentro del viewport.

---

#### TTD-AUD-108 · P1 · Kanban móvil: carrusel de columnas con snap, fondo de columna, cabecera fija e indicador

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

---

#### TTD-AUD-109 · P2 · Kanban escritorio y modo oscuro: separación visual de columnas

**Estado actual:** captura `PROD-r105_kanban-escritorio.webp`: columnas blancas sobre blanco, separadas solo por espacio. Misma causa que 108 (override de `ui.css:3018-3023` y `today.css:1429-1432`). Las tarjetas tienen `:hover` con `--accent-soft` (`ui.css:3063-3066`), correcto.

**Comportamiento esperado:** columnas de `--kanban-col-w` (288 px), fondo `--kanban-col-bg`, `gap: var(--sp-3)`, cabecera fija dentro de la columna, scroll vertical por columna, scroll horizontal solo en `.kanban` (con `scroll-snap-type: x proximity`). En oscuro, columna `#1a1a1a` y tarjeta `#2a2a2a`.
- `.kanban-col.is-over` (`ui.css:411-413`) usa `--warning` (naranja): cambiar a `outline: 2px dashed var(--accent)` + `background: var(--accent-soft)`, como Hoy (`today.css:1577-1581`).

**Criterios de aceptación:**
- [ ] 1280×800 claro y oscuro: fondo de columna ≠ fondo de página ≠ fondo de tarjeta.
- [ ] Contraste del texto de cabecera sobre `--kanban-col-bg` ≥ 4,5:1 en ambos temas.
- [ ] Al arrastrar una tarjeta sobre otra columna, la columna destino muestra el contorno de acento discontinuo.
- [ ] Lista y Hoy en kanban usan las mismas variables (test de componente o de estilos computados).

---

#### TTD-AUD-110 · P2 · Mover tarjetas entre columnas en táctil

**Estado actual:** el kanban usa HTML5 drag & drop (`draggable` + `onDragStart`/`onDrop`, `TaskList.tsx:524-555`, `:602-605`; Hoy en `today/TaskGroup.tsx:175-196`). Con el dedo no es fiable (depende del navegador y en la práctica no funciona de forma consistente en móviles). No hay alternativa sin arrastre.

**Comportamiento esperado (KISS, en dos pasos):**
1. **Obligatorio:** en el menú «⋯» de la tarjeta (o con pulsación larga de 400 ms), acción **«Mover a…»** que abre una hoja con las columnas (nombre + contador) y mueve con el mismo `PATCH` que el drop (`column_id`, o `dateBucketPatch` en el kanban por fechas). Respeta `wip_exceeded` (`TaskList.tsx:546-549`).
2. **Opcional (si cabe sin librerías):** arrastre con Pointer Events tras pulsación larga, con **autoscroll horizontal** cuando el dedo está a < 48 px del borde del carrusel (velocidad proporcional) y snap al soltar. Si no se hace en esta PR, dejarlo anotado como pendiente.

**Criterios de aceptación:**
- [ ] 390×844 (`hasTouch: true`): «Mover a… → Hoy» mueve la tarjeta y el contador de ambas columnas se actualiza sin recargar.
- [ ] Con WIP superado, se muestra `wipExceeded` y la tarjeta no se mueve.
- [ ] Accesible por teclado en escritorio (el menú es un `menu` con `menuitem`).
- [ ] Si se implementa el arrastre: a 390 px, arrastrar una tarjeta al borde derecho desplaza el carrusel a la columna siguiente en < 1 s.

---

## 2. Tokens nuevos

| Token | Claro | Oscuro |
|---|---|---|
| `--kanban-col-bg` | `#f3f4f6` | `#1a1a1a` |
| `--kanban-card-bg` | `var(--surface)` | `#2a2a2a` |
| `--kanban-col-w` | `288px` | = |
| `--kanban-col-w-mobile` | `calc(100vw - 2 * var(--sp-4) - 32px)` | = |
| `--kanban-tabs-h` | `40px` | = |

## 3. i18n nuevas (es / en)

| Clave | es | en |
|---|---|---|
| `calWeekShort` | Sem | Wk |
| `calendarFilterDone` | Listo | Done |
| `calendarSourcesCount` | {on}/{total} | {on}/{total} |
| `kanbanColumnsNav` | Columnas | Columns |
| `kanbanMoveTo` | Mover a… | Move to… |

## 4. Fuera de alcance

- Rediseño de la vista Mes de escritorio, del composer o del detalle.
- Librerías de drag & drop.
- Cambios de API: el movimiento de 110 usa los endpoints existentes.

---

#### TTD-AUD-111 · P2 · MCP: herramienta dedicada de subida de adjuntos y errores de Drive más claros

**Comprobado el 23/10 a las 20:59–21:00 (hora de Madrid), sobre la tarea de prueba «Prueba adjuntos 23-oct» (lista grokbot-ticktackdone), con Drive conectado (yoyyosemite@gmail.com):**
- Subir por MCP **funciona**, pero solo con la herramienta genérica `api_request` (`POST /api/v1/tasks/{id}/attachments` con `files[{field:'file', filename, base64}]`). Responde 201 con `source:"mcp"`, `drive_state:"ok"` y `web_view_link` de Drive. Una `.html` se rechaza con `unsupported_media_type`. `remove_task_attachment` con `trash_in_drive:true` → `{"removed":true}`, y el fichero ya no se puede volver a vincular.
- **No hay ninguna herramienta MCP específica de subida.** Un agente tiene que descubrir `api_catalog` → `api_request` y montar el multipart a mano.
- `link_drive_file` con un id que la app no puede ver (con el permiso `drive.file`, solo ve ficheros creados por ttd o elegidos en el Picker) devuelve `drive_file_not_found: The file is no longer in Drive`. Ese mensaje es engañoso: el fichero puede existir y simplemente no estar autorizado (`api/drive/drive-client.ts:67-68`, que traduce cualquier 404).
- La llamada interna del MCP tiene un límite de 30 s (`api/mcp/mcp-api.ts:61`). Con 25 MiB y subida a Drive en trozos de 7,75 MiB podría cortarse (**a verificar**).

**Comportamiento esperado:**
1. Nueva herramienta `upload_task_attachment {task_id, filename, base64, content_type?}`. Internamente reutiliza `DriveAttachmentsService.stream` (sin pasar por HTTP de loopback) y devuelve el mismo `DriveAttachmentResponseDto`. Mismos límites: 25 MiB, 50 por tarea, tipos de `acceptedMime`.
2. Error distinto, `drive_file_not_accessible` (404, con el mensaje «El fichero no existe o ttd no tiene permiso: elígelo con el Picker»), cuando Drive responde 404 a `files.get` en `link`. Se mantiene `drive_file_not_found` para los ficheros en la papelera.
3. Límite de la subida del MCP igual al de la API (≥ 120 s) o sin pasar por loopback (punto 1).
4. Quitar la dependencia `multer` si solo queda el `import { MulterError }` de `api/http/api-exception.filter.ts:10`.

**Criterios de aceptación:**
- [ ] `tools/list` incluye `upload_task_attachment`; test en `mcp.service.spec.ts` y en `test/mcp.e2e-spec.ts` (con un Drive simulado): .txt → 201 con `source:"mcp"`; .html → 415; > 25 MiB → 413.
- [ ] Un test garantiza que ningún camino de subida escribe en disco: se simula `node:fs` y se comprueba que no se llama a `writeFile`/`createWriteStream`.
- [ ] `link_drive_file` con un id no autorizado → `drive_file_not_accessible`; con un fichero en la papelera → `drive_file_not_found`.
- [ ] Subida de 24 MiB por MCP completada sin timeout (e2e con Drive simulado y latencia artificial).

#### TTD-AUD-125 · P1 · Telegram por usuario: el vínculo heredado del bot global deja un estado incoherente y no se puede gestionar

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

   | Campo | Endpoint | Cálculo | Valor actual |
   |---|---|---|---|
   | `configured` | `GET /integrations/telegram` | existe `TelegramBotConfiguration` (`telegram-settings.service.ts:24`) | `false` |
   | `source` | `GET /integrations/telegram` | `none` o `settings` (`telegram-settings.service.ts:25`) | `none` |
   | `webhook_state` | `GET /integrations/telegram` | `telegram-settings.service.ts:29-30` | `unconfigured` |
   | `status` | `GET /integrations/telegram` | `link?.status ?? 'not_linked'`: viene del `TelegramLink` heredado (`integrations.controller.ts:178`) | `connected` |
   | `linked_at` | `GET /integrations/telegram` | `integrations.controller.ts:177` | `2026-10-18T17:03Z` |
   | `linked` | `GET /integrations/telegram` | `status.configured && link !== null` (`integrations.controller.ts:183`) | `false` |
   | `linked` | ajustes de notificaciones | `!!telegram`, **solo mira `TelegramLink`, no el bot** (`notifications/notifications.service.ts:33,59-60`) | «vinculado» |

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

   | Estado | Acciones |
   |---|---|
   | `none` | «Conectar bot» (token) |
   | `token_saved` / `error` | «Reintentar webhook», «Reemplazar token», «Quitar bot» |
   | `webhook_ok` | QR/enlace de emparejamiento, «Reemplazar», «Quitar bot» |
   | `linked` | «Probar», «Desvincular chat», «Reemplazar», «Quitar bot» |

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
