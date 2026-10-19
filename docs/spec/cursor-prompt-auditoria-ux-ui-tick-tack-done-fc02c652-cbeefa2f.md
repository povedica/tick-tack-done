# Prompt para Cursor: auditoría UX/UI y rendimiento de tick-tack-done (v3)

Contexto. Auditoría hecha el 18-oct-2026 sobre https://todo.reflexionia.com/ (cuenta real de Pablo con datos importados de TickTick: 89 tareas en "All", 206 completadas, 23 en papelera, ~55 etiquetas, ~22 listas) y sobre el código del repo `povedica/tick-tack-done` (commit `41e866d`, rama `main`). Se probó en desktop 1280x713 y en móvil 390x844. No se creó, editó ni borró ninguna tarea real durante la auditoría.

Cómo usar este documento. Cada punto lleva: **Qué es**, **Resultado actual**, **Resultado esperado**, **Cómo arreglarlo** (con rutas de archivo). Están ordenados por prioridad: P0 (rompe el uso), P1 (muy visible), P2 (pulido). Trabaja en ramas/worktrees separados por bloque (rendimiento API, rendimiento web, layout de lista, detalle de tarea, sidebar, pantallas sin estilo, móvil) para evitar conflictos. Después de cada bloque: `pnpm typecheck && pnpm test` y verifica visualmente con Playwright (capturas a 1280px y 390px).

Reglas generales para todo el arreglo:

- Mantén el look TickTick ya definido (acento `#4772FA`, tokens en `apps/web/src/styles/tokens.css`). Usa solo tokens (`var(--...)`), no colores sueltos.
- Una sola fuente de verdad para filas de tarea: reutiliza el mismo componente `TaskRow` en Today, listas, smart lists, etiquetas, filtros, búsqueda y papelera. Hoy hay tres implementaciones (ver P0-5 y P1-3).
- Toda la UI en un solo idioma por defecto (ver P2-4).
- Añade tests de regresión (Vitest para dominio/API, Playwright para layout: `document.documentElement.scrollWidth <= innerWidth` en cada ruta a 1280 y 390).

Evidencias (capturas adjuntas): `01-all-scroll-horizontal.png`, `02-detalle-solapado-desktop.png`, `03-completadas-sin-check.png`, `04-etiqueta-sin-check.png`, `05-ajustes.png`, `06-calendario.png`, `07-movil-detalle.png`, `08-movil-today.png`, `09-movil-drawer.png`, `10-network-pablo.jpg` (la de Pablo).

---

## Resumen de prioridades

| #   | Prioridad | Tema                                                                                                |
| --- | --------- | --------------------------------------------------------------------------------------------------- |
| 1   | P0        | `GET /smart-lists` tarda 1.6-2.5 s y bloquea al resto de peticiones                                 |
| 2   | P0        | Peticiones duplicadas y refetch masivo en el cliente                                                |
| 3   | P0        | Scroll horizontal (scrollWidth 1500-2100 px con ventana de 1280)                                    |
| 4   | P0        | Panel de detalle de tarea solapado con la lista (desktop y móvil)                                   |
| 5   | P0        | Lista "Completed" muestra las tareas como no completadas                                            |
| 6   | P0        | Tareas de etiqueta sin checkbox y etiquetas no clicables                                            |
| 7   | P1        | Icono de arrastrar (grip) visible pero sin función                                                  |
| 8   | P1        | Pie del sidebar: tres botones grandes -> tres iconos en una fila                                    |
| 9   | P1        | Ajustes: maquetación rota (radios al 100% de ancho, enlaces por defecto)                            |
| 10  | P1        | Calendario sin estilo                                                                               |
| 11  | P1        | Pantallas sin estilo: Habits, Filters, Repeat, Matrix, Garden, Review, Reports, Focus, Tokens, Data |
| 12  | P1        | Navegación y layout móvil                                                                           |
| 13  | P1        | Contadores del sidebar incoherentes                                                                 |
| 14  | P2        | Detalles de fila: "Repeat" en todas las filas, fechas, hueco superior                               |
| 15  | P2        | Papelera sin restaurar/borrar definitivo                                                            |
| 16  | P2        | Mezcla de idiomas                                                                                   |
| 17  | P2        | Otros (datos importados, accesibilidad)                                                             |
| 18  | P0        | Etiquetas paginadas a 50: las nuevas no aparecen y se ven como UUID (P0-18)                         |
| 19  | P0        | Contadores y listas no se refrescan tras crear/borrar (P0-19)                                       |
| 20  | P1        | Recurrencia en detalle: "Could not save." (P1-20)                                                   |
| 21  | P1        | Borrar/duplicar sin feedback ni deshacer (P1-21)                                                    |
| 22  | P2        | Parser de captura, papelera y detalles (P2-22)                                                      |
| -   | -         | Casos funcionales probados (tabla C1-C11 antes del orden de trabajo)                                |

---

## P0-1. `GET /api/v1/smart-lists` tarda 1.6-2.5 s y arrastra a las demás peticiones

**Qué es.** Es la petición que alimenta los contadores del sidebar (Today, Tomorrow, All...). Se dispara en cada carga y tras cada mutación.

**Resultado actual (medido).** Con fetch desde la pestaña, en secuencia: `habits` 153 ms, `projects` 136 ms, `tags` 158 ms, pero `smart-lists` **1808 ms** (1 kB de respuesta). En paralelo, `smart-lists` 1621 ms y las otras tres 165-174 ms. En la captura de red de Pablo, cuando coincide con otras peticiones, `habits` y `tasks?...overdue=true` también suben a ~2.1 s: señal de que el proceso Node se queda ocupado mientras calcula los contadores y encola el resto. Latencia base al servidor ~140-150 ms por petición. La respuesta de `habits` va sin compresión (`content-encoding` vacío) y vacía (0 kB).

**Resultado esperado.** `smart-lists` < 150 ms, `tasks?group_by=section` < 300 ms, ninguna petición del arranque > 400 ms.

**Causa en el código.**

1. `apps/api/src/modules/filters/smart-lists.service.ts`, método `list()`: carga **todas** las tareas del usuario con sus `include` (tags, column, project, checklist) mediante `loadViewTasks(this.prisma, { ownerId, parentId: null })` (`apps/api/src/reading/view-tasks.ts`) y cuenta en JS con `matchesSmartList` por cada smart list. Con ~600 tareas son 5 queries Prisma pesadas más filtrado en memoria en el hilo principal.
2. Ese mismo `list()` ejecuta antes `ensure()` dentro de una transacción en cada llamada (`findMany` de smart lists + posibles `create`/`update`).
3. `tasks()` en el mismo servicio (la vista `/smart/:key`) vuelve a cargar todas las tareas con `loadViewTasks` y pagina en memoria (`buildViewPage`).
4. `apps/api/src/auth/api-auth.guard.ts` (~línea 199): `prisma.session.update({ lastUsedAt })` en **cada** petición, más un `findFirst` de usuario. Es una escritura por request.
5. Índices: `Task` solo tiene `(projectId,status,sortOrder)`, `dueDate`, `(seriesId,status)` y el índice FTS (`apps/api/prisma/schema.prisma` ~398-401). Faltan índices por `ownerId`.

**Cómo arreglarlo.**

- Contadores en SQL, no en JS: en `list()` calcula `task_count` con una sola consulta agregada. Opción simple: `whereFromClause(smartListClause(key, input))` ya existe (`apps/api/src/filters/where-from-clause.ts`); lanza `Promise.all` de `prisma.task.count({ where })` por cada key (son ~9) con `select` mínimo, o una única `$queryRaw` con `COUNT(*) FILTER (WHERE ...)` por lista. No uses `loadViewTasks` ni `include` para contar.
- Saca `ensure()` del camino caliente: ejecútalo en el registro/primer login o una vez por proceso (cache en memoria por `ownerId`), y deja `list()` como un `findMany` simple.
- En `tasks()` aplica `where` en base de datos, ordena y `take: limit+1` en la query, y solo hidrata tags/checklist de la página devuelta (como ya hace `TasksService.list()` con `progressMap`).
- Throttle de `lastUsedAt`: solo actualizar si el valor guardado tiene más de 60 s.
- Migración con índices: `@@index([ownerId, status, deletedAt, dueDate])`, `@@index([ownerId, deletedAt, createdAt])`, `@@index([ownerId, parentId, deletedAt])` en `Task`; `@@index([ownerId, deletedAt])` en `Project`/`Tag`.
- Añade `?connection_limit=10&pool_timeout=20` a `DATABASE_URL` de producción (docker-compose) y mide con `EXPLAIN ANALYZE` las tres consultas principales.
- Habilita compresión en Caddy para `/api/*` (ya hay `encode zstd gzip`; confirma que `habits` vacío no es un caso especial y que `Vary: Accept-Encoding` está bien).
- Test de rendimiento: e2e que cree 1.000 tareas y afirme que `GET /smart-lists` responde en < 300 ms.

---

## P0-2. Peticiones duplicadas y refetch masivo

**Qué es.** El cliente repite `smart-lists`, `projects`, `filters`, `tags` y `tasks?group_by=section` varias veces seguidas (en la captura de Pablo, 3 rondas completas en pocos segundos).

**Resultado actual.** `apps/web/src/main.tsx` crea `new QueryClient()` sin opciones: `staleTime: 0`, refetch al montar y al recuperar foco. `apps/web/src/shell/Sidebar.tsx` (~líneas 63-66) lanza cuatro `useQuery` sin `staleTime`. `apps/web/src/features/tasks/refresh.ts` invalida **diez** claves tras cada mutación (`today-tasks`, `inbox-tasks`, `project-tasks`, `smart-list-tasks`, `filter-tasks`, `smart-lists`, `projects`, `tags`, `search`, `task`), aunque la mayoría no estén montadas o no cambien. `TodayPage.tsx` lanza varias queries de tareas a la vez. Además `StrictMode` (`main.tsx`) duplica efectos en desarrollo y confunde las mediciones locales. Hipótesis (no verificada en producción): la repetición viene de refetch por foco más invalidaciones en cascada; confírmalo con `queryClient.getQueryCache().subscribe` en dev.

**Resultado esperado.** Una sola petición por recurso al arrancar; tras completar una tarea solo se refresca lo necesario y la UI responde al instante (optimistic update).

**Cómo arreglarlo.**

- `new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, gcTime: 5*60_000, refetchOnWindowFocus: false, retry: 1 } } })`. Para `projects`, `tags`, `filters`: `staleTime: 5*60_000`.
- `refreshTaskSurfaces`: invalida solo `['smart-lists']` (contadores) y las listas **activas** (`refetchType: 'active'`), no las diez claves. Para completar/borrar/mover: `onMutate` con actualización optimista de la fila y de los contadores, `onError` con rollback.
- Unifica las claves de tareas en una factoría (`taskKeys.list({scope, filters})`) para no tener `today-tasks`, `inbox-tasks`, `project-tasks`... separadas.
- Combina Today en un único endpoint (`/tasks/today`: vencidas + hoy + próximos) o, como mínimo, pide `overdue` y `due_before` en una sola llamada.
- Prefetch al pasar el ratón por un elemento del sidebar (`onMouseEnter` -> `queryClient.prefetchQuery`).
- Mide con Playwright: contar `request` a `/api/v1/` durante el arranque; fija un máximo (p. ej. 8) como test.

---

## P0-3. Scroll horizontal

**Qué es.** Aparece barra de scroll horizontal en las vistas de lista.

**Resultado actual (medido en desktop 1280).** `document.documentElement.scrollWidth`: Today **2026**, All **1999**, Completed **1500**, ancho de ventana 1280. En Today el título de la tarea ni siquiera se recorta con elipsis y se sale de la pantalla (captura `01`). Con el panel de detalle abierto, `scrollWidth` llega a 2105.

**Resultado esperado.** `scrollWidth === innerWidth` en todas las rutas y tamaños. Títulos largos recortados con `…` (una línea) y los metadatos (etiquetas, lista, fecha) nunca empujan el ancho.

**Causa.**

- `apps/web/src/components/ui.css` ~414: `.task-meta { display:flex; flex:none; flex-wrap:nowrap; ... }`. Con `flex:none` y sin `max-width`, un puñado de etiquetas ensancha la fila.
- `apps/web/src/features/today/today.css` ~60: `.task-row` es `display:flex` con `height:var(--row-h)`, el hijo `li` y el contenedor `.task-group`/`details` no tienen `min-width:0`, así que el `min-width:0` de `.task-title` no sirve.
- En Today las filas (`TodayPage.tsx` ~618) mezclan clases de `ui.css` y `today.css` con orden de carga distinto; la regla de elipsis de `.task-title` (today.css ~196) pierde frente a otras.

**Cómo arreglarlo.**

- `.task-list > li, .task-group, .center, .outlet { min-width: 0; }` y `.center { overflow-x: clip; }` (como red de seguridad, no como solución única).
- Fila: `display:grid; grid-template-columns: auto minmax(0,1fr) auto auto;` (check | título | meta | más). Título: `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`. Meta: `flex: 0 1 auto; max-width: 45%; overflow:hidden;` y mostrar máximo 2 etiquetas + chip "+N" (con tooltip con el resto). Lista y fecha con `flex:none`.
- Elimina la duplicación: deja una sola definición de `.task-row/.task-title/.task-meta` (en `components/ui.css`) y borra las de `today.css`.
- Test Playwright que recorra todas las rutas del sidebar a 1280 y 390 y falle si `scrollWidth > innerWidth`.

---

## P0-4. Panel de detalle de tarea solapado con la UI

**Qué es.** Al hacer clic en una tarea se abre el panel de detalle (`?task=<id>`).

**Resultado actual.**

- Desktop (captura `02`): las filas de la lista se desbordan por debajo del panel (se ven etiquetas, listas y fechas de la lista encima de los campos "Add tag" y "Checklist"). El botón atrás (flecha) queda tapado por un icono. "Add tag" es un `<select>` nativo que pisa los chips. El botón **Delete** es un bloque rojo enorme en la cabecera, junto a Copy link y Duplicate sin jerarquía.
- Móvil/tablet < 1024 px (captura `07`): el panel no es un drawer. Se ve la lista transparentada por detrás y el panel mezclado con ella.

**Resultado esperado.** Panel limpio con fondo sólido, ancho fijo (360-420 px) que no interfiere con la lista; en < 1024 px un bottom sheet o pantalla completa con scrim. Cabecera con iconos discretos; Delete dentro de un menú "···".

**Causa.**

- `apps/web/src/shell/shell.css` ~356-380 (media < 1024px): la regla de panel fijo apunta a `.shell[data-detail='open'] .detail`, pero el componente usa la clase `.detail-panel` (ver `components/ui.css` ~434 y `AppShell.tsx`). El panel se queda en `grid-column:1; grid-row:1`, el mismo sitio que `.center`: por eso se superpone. Es un bug de selector.
- Desktop: `grid-template-columns: ... minmax(0,1fr) var(--detail-w)` (`--detail-w: 36%`) es correcto, pero el centro desborda (ver P0-3) y pinta fuera de su celda.
- `ui.css` ~445: `.detail-panel input:not(.task-check) { width:100%; padding:.75rem; ... }` afecta a todos los inputs del panel (incluidos checkboxes y el título).

**Cómo arreglarlo.**

- Cambia el selector a `.shell[data-detail='open'] > .detail-panel` en la media query y dale `position:fixed; inset:0 0 0 auto; width:min(420px,100%); z-index:40; background:var(--surface); box-shadow:var(--shadow-lg)`. En < 640 px: `inset:0` (pantalla completa) con cabecera sticky y botón cerrar de 44 px.
- Desktop: `--detail-w: clamp(340px, 30vw, 440px)` en vez de `36%`.
- Reorganiza el contenido (`apps/web/src/features/tasks/TaskDetail.tsx`): cabecera = [check de completar + prioridad] [título editable] [··· menú: Copiar enlace, Duplicar, Eliminar]; debajo, fila de metadatos compacta (fecha, lista, prioridad, etiquetas como chips con `x` y un botón "+" que abre un popover en vez del `<select>`), luego descripción, checklist, recordatorios, repetición. Eliminar con confirmación y toast "Deshacer".
- Cierra con `Esc` y clic en scrim (ya existe) y devuelve el foco a la fila.

---

## P0-5. "Completed" muestra las tareas como no completadas

**Qué es.** La lista `/smart/completed` (206 tareas).

**Resultado actual (captura `03`).** Todas las filas aparecen con checkbox vacío con borde de prioridad, texto normal y fecha en rojo (como vencidas). Parece una lista de pendientes.

**Resultado esperado.** Checkbox relleno con check, título tachado y atenuado, fecha en gris con la fecha de **completado** ("Completed Mar 17"), orden por fecha de completado descendente, y clic en el check = reabrir.

**Matiz tras probar:** en Inbox, al marcar una tarea la fila sí se ve marcada y atenuada (estado pendiente en cliente) hasta recargar; en la lista basada en vistas (Completed) nunca se marca.

**Causa.**

- `apps/web/src/features/tasks/TaskList.tsx` (componente de fila, ~líneas 300-340): `<PriorityCheck ... />` no recibe la prop `checked`, así que el input queda no controlado y vacío aunque `row.status === 'completed'`.
- `apps/web/src/features/today/today.css` ~83: `.task-row:has(.task-check:checked) { opacity:.45 }` depende del estado del input, que nunca está marcado.
- `isOverdue(row.dueDate, now)` se evalúa sin mirar el estado, por eso el rojo.
- `rowFromView` (`apps/web/src/features/tasks/model.ts`) pone `repeat:false` y `source:'manual'` fijos.
- El API ya ordena `completed` por `completedAt` (`smart-lists.service.ts`), pero el cliente no muestra esa fecha porque `ViewTaskJson` no incluye `completed_at`.

**Cómo arreglarlo.**

- API: añade `completed_at` (y `repeat_rule`, `source`) a `ViewTaskJson`/`toViewJson` (`apps/api/src/reading/view-tasks.ts`), regenera OpenAPI + SDK (`pnpm openapi && pnpm sdk:build` o el script del repo).
- Web: `RowModel.completedAt`; en la fila `checked={row.status==='completed'}`, clase `is-done` (`text-decoration: line-through; color: var(--ink-3)`), `isOverdue` solo si `status==='active'`; mostrar `completedAt` en la lista Completed. `onComplete` debe alternar (completar/reabrir) según el estado, con actualización optimista y toast "Deshacer".
- Test: render de fila con `status:'completed'` -> input `checked`, título con `line-through`, sin clase `is-overdue`.

---

## P0-6. Tareas de etiqueta sin checkbox; etiquetas no clicables

**Qué es.** Al entrar en una etiqueta desde el sidebar, y al pulsar una etiqueta en una fila.

**Resultado actual (captura `04`).**

- Los enlaces de etiqueta del sidebar van a `/search?q=%23casa`. Es una **búsqueda de texto**, no una lista: muestra "Search", un input y el grupo "Task" con enlaces subrayados azules sin check, sin prioridad, sin fecha, sin lista. Además busca el texto "#casa" literal, así que mezcla tareas que lo llevan en el título con las que tienen la etiqueta real (p. ej. "Comprar chocolate en polvo" aparece sin `#casa` en el título).
- En las filas (Today, All, listas) las etiquetas son `<span class="ui-tag">` no clicables (`TodayPage.tsx` ~637, componente `TagChip`/`ui.tsx` ~49). En el panel de detalle tampoco.
- `SearchPage` (`apps/web/src/features/places/Places.tsx` ~635) pinta cada resultado como `<Link className="task-row"><span className="task-title">`, sin `PriorityCheck`.

**Resultado esperado.** Pulsar una etiqueta (en el sidebar, en una fila o en el detalle) abre `/tag/<tagId>`: una lista con el mismo `TaskRow` que el resto (check, prioridad, fecha, lista), contador, ordenación y agrupación como las demás listas, y un menú "···" para renombrar/recolorear/borrar etiqueta. La búsqueda de texto se queda solo en `/search`, con filas completas (incluido check) también.

**Cómo arreglarlo.**

- Ruta nueva `/tag/:id` en `apps/web/src/app.tsx` reutilizando la vista de lista (`SmartListViewPage`/`ProjectListPage`). El API ya filtra por etiqueta: `TasksService.list()` acepta `tagId` y `includeDescendants` (`tasks.service.ts` ~152-164) y `TagsService` tiene `tagScope`. Si la vista de lista usa el endpoint `views`, añade `tag_id` ahí.
- `Sidebar.tsx`: cambia `href` de `/search?q=#tag` a `/tag/${id}` y marca la etiqueta activa.
- `TagChip` -> `<Link to={`/tag/${id}`} onClick={e=>e.stopPropagation()}>`; que no abra el detalle al pulsar. En el detalle, chip clicable + `x` para quitar.
- `SearchPage`: sustituir el `<Link className="task-row">` por el componente `TaskRow` común para grupos de tipo `task`.
- Etiquetas jerárquicas: si hay padre/hijos, `includeDescendants=true` por defecto.

---

## P1-7. Icono de arrastrar (grip) visible pero sin función

**Qué es.** Al pasar el ratón por una fila aparece `⋮⋮` a la izquierda.

**Resultado actual.** Es un `GripVertical` decorativo (`TaskList.tsx` ~328, `TodayPage.tsx` ~618) sin `draggable`, ni `onDragStart`, ni librería de DnD. Solo el Kanban tiene arrastre nativo (`TaskList.tsx` Kanban `onDragOver/onDrop`). Además queda sobre la zona del check y, en la orden "Manual", no hay forma de reordenar.

**Resultado esperado.** O funciona o no se muestra. Propuesta: que funcione en orden "Manual" (reordenar dentro de la lista y mover entre secciones) y se oculte en otros órdenes.

**Cómo arreglarlo.**

- Añade `@dnd-kit/core` + `@dnd-kit/sortable` (accesible, con teclado y táctil). `SortableContext` por grupo, `useSortable` por fila, el grip como `setActivatorNodeRef`.
- Al soltar: calcular nuevo `sort_order` con `rebalancedSortOrders` de `@reflexionia/domain` (ya existe) y llamar a `PATCH /tasks/:id` o a un endpoint `POST /tasks/reorder`; actualización optimista y rollback.
- Mostrar el grip solo con `sort === 'manual'`; en las demás ordenaciones `display:none`. Cursor `grab`. Si no se implementa en esta iteración, elimina `<GripVertical>` de ambas filas.

---

## P1-8. Pie del sidebar: tres botones -> una fila de tres iconos

**Qué es.** Abajo del sidebar hay tres botones de ancho completo: "Empty" (vaciar papelera), "Theme: Auto" y "Collapse sidebar", más la fila "Trash 23".

**Resultado actual.** Ocupan unos 150 px de alto del sidebar, con borde y texto grande; "Empty" sin contexto (vacía qué) está al lado de "Trash".

**Resultado esperado (petición de Pablo).** Una sola fila de 3 columnas con 3 iconos pequeños y sutiles (sin borde, 28-32 px, color `--ink-3`, hover `--surface-2`), con tooltip y `aria-label`: papelera (vaciar), tema (sol/luna/auto, cicla), contraer (panel). La fila "Trash 23" se mantiene como enlace y el icono de vaciar solo aparece/está activo con papelera no vacía y pide confirmación.

**Cómo arreglarlo.** `apps/web/src/shell/Sidebar.tsx` ~410-460 (`.sidebar-footer`) y `shell.css` ~162-180:

```tsx
<div className="sidebar-footer">
  <button className="icon-btn" aria-label={messages.emptyTrash} title={messages.emptyTrash} ...><Trash2 size={16}/></button>
  <button className="icon-btn" aria-label={`${messages.themeLabel}: ${themeLabel}`} title=...>{/* Sun | Moon | Monitor según preferencia */}</button>
  <button className="icon-btn collapse-button" aria-label={messages.collapseSidebar} title=...><PanelLeftClose size={16}/></button>
</div>
```

```css
.sidebar-footer {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 6px 8px;
  border-top: 1px solid var(--border);
}
.sidebar-footer .icon-btn {
  height: 32px;
  border: 0;
  background: transparent;
  color: var(--ink-3);
  border-radius: 8px;
  display: grid;
  place-items: center;
}
.sidebar-footer .icon-btn:hover {
  background: var(--surface-2);
  color: var(--ink);
}
```

En el drawer móvil el botón de contraer sobra (`display:none` en < 1024px, ya existe).

---

## P1-9. Ajustes: maquetación rota

**Qué es.** `/settings/*` (14 secciones).

**Resultado actual (captura `05`).**

- Los radios (Theme, Density, Accent) se dibujan separados al 100% del ancho: el control a un lado y la etiqueta pegada al borde derecho a ~300 px de distancia.
- Causa: `apps/web/src/components/ui.css` ~445-456 aplica `width:100%; padding:.75rem; border...` a **todos** los `.settings-layout input`, incluidos `radio` y `checkbox`.
- El menú de ajustes son enlaces azules subrayados por defecto, sin estado activo, sobre la columna central; `fieldset/legend` con borde por defecto; sin tarjetas ni agrupación; texto de ayuda suelto ("Theme, density and language apply immediately." + "Theme: auto" duplicado).
- En móvil el menú ocupa 14 líneas encima del contenido.

**Resultado esperado.** Ajustes estilo TickTick: columna izquierda con secciones (icono + nombre, activa resaltada), contenido en tarjetas con filas "etiqueta a la izquierda, control a la derecha"; radios como segmented control (Auto/Light/Dark) y selector de acento con círculos de color; densidad como segmented control. En móvil: lista de secciones como pantalla de entrada y cada sección en pantalla propia con botón atrás.

**Cómo arreglarlo.**

- Acota el estilo de campos: `.settings-layout input:not([type=radio]):not([type=checkbox])`, `select`, `textarea`.
- `SettingsLayout` (`apps/web/src/features/places/Places.tsx` ~874): `NavLink` con clase `settings-nav__item` y `aria-current` estilizado; agrupa (General: Account, Appearance, Language; Productividad: Capture, Notifications, Smart lists, Calendar; Avanzado: Tokens and MCP, Integrations, Automations, Webhooks, Plugins, Sharing, Data, Shortcuts).
- Componentes reutilizables `SettingsCard`, `SettingsRow({label, hint, control})`, `Segmented`, `Switch`. Aplícalos a `AppearancePage.tsx` (`apps/web/src/features/settings/`) y a las demás páginas de ajustes (`Places.tsx` contiene muchas).
- Quita textos duplicados ("Theme: auto"), usa una descripción por sección.
- Móvil: `.settings-layout{grid-template-columns:1fr}`; muestra nav o contenido según la ruta (`/settings` = nav, `/settings/x` = contenido con atrás).

---

## P1-10. Calendario sin estilo

**Qué es.** `/calendar/month` (y Day, Week, Multi-day, Multi-week, Year, Agenda).

**Resultado actual (captura `06`).** Números de día como enlaces azules subrayados en negrita, cabecera de días gris plano, celdas sin jerarquía, fines de semana con gris pesado, mensaje "There are no external calendars." suelto, barra de herramientas con botones por defecto; las tareas aparecen como un chip lavanda truncado sin color de prioridad. En móvil (390 px) la cuadrícula tiene celdas de ~45 px sin contenido legible y la barra de vistas ocupa dos líneas. No hay vista de lista del día ni arrastre para cambiar fecha.

**Resultado esperado.** Cuadrícula limpia estilo TickTick: número de día sin subrayado, gris para días de otro mes, círculo azul en hoy, chips de tarea con color de prioridad (tachado si completada), "+N más" que abre el día, clic en un día = panel con las tareas de ese día y botón "añadir", navegación con `<`/`>`/"Hoy", selector de vista compacto (segmented) y en móvil vista Agenda por defecto.

**Cómo arreglarlo.** `apps/web/src/features/places/Places.tsx` (~229-345, clases `cal-toolbar`, `cal-views`, `cal-month`, `cal-head`) y su CSS (hoy mínimo). Reset de `a` dentro de `.cal-month`, usar `grid-template-columns: repeat(7, minmax(0,1fr))`, altura mínima de celda con `aspect-ratio` o `min-height: 110px` en desktop, chips con `--prio` (misma variable que `PriorityCheck`), `overflow:hidden` + contador "+N". Mover el mensaje de calendarios externos a un enlace discreto "Conectar calendario" hacia `/settings/calendar`. En < 640 px: `view = agenda` por defecto. Pasar las tareas completadas con estilo atenuado.

---

## P1-11. Pantallas casi sin estilo

**Qué es.** Páginas que usan HTML por defecto o estilos mínimos. Capturas de la auditoría muestran lo siguiente.

| Ruta                          | Problema actual                                                                                                                                                 | Esperado                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/habits`                     | Chips de sugerencia en gris oscuro, formulario de alta de hábito siempre desplegado y enorme (nombre, objetivo, veces, días con checkboxes) encima de la lista  | Lista de hábitos arriba (con racha y check de hoy), alta en modal/sheet con botón "+", sugerencias como chips discretos   |
| `/filters`                    | Formulario por defecto (inputs, selects, botón "Add condition" nativo), "No filters yet" suelto                                                                 | Constructor de filtros por chips/popovers; guardar abre diálogo; lista de filtros guardados                               |
| `/repeat`                     | Etiquetas y campos en línea sin layout ("Frequency[select]Interval"), input a ancho completo, botón nativo, texto en español mezclado ("Cada semana los lunes") | Diálogo/popover de repetición como el de TickTick (frecuencia, intervalo, días como círculos L-M-X-J-V-S-D, fin)          |
| `/matrix`                     | Listas con enlaces azules subrayados dentro de dos cuadrantes; solo se ven 2 de 4 en la primera pantalla                                                        | Cuadrícula 2x2 de tarjetas con `TaskRow` compacto, arrastre entre cuadrantes                                              |
| `/dashboard` (Digital garden) | Tarjetas con borde punteado y un número suelto; en la captura inicial del 18-oct mostraba JSON crudo                                                            | Tarjetas KPI con valor grande, etiqueta, tendencia y mini-gráfico; sin JSON                                               |
| `/review`, `/reports/weekly`  | Tarjetas punteadas, botón "Build this week" azul a todo el ancho, estado vacío sin diseño                                                                       | Resumen con secciones, un CTA discreto y estado vacío con ilustración                                                     |
| `/focus`                      | "—" como temporizador y botón "Start" sueltos                                                                                                                   | Temporizador circular grande, selector de duración, tarea asociada                                                        |
| `/tokens`                     | Rejilla de 24 checkboxes sin agrupar; lista de tokens con botones nativos pegados al texto                                                                      | Scopes agrupados por recurso (lectura/escritura como dos columnas), tabla de tokens con fecha, último uso y botón Revocar |
| `/settings/data`              | Un botón "Export JSON" sin estilo                                                                                                                               | Tarjeta de exportación/importación/backups                                                                                |

**Cómo arreglarlo.** Crea primero un pequeño sistema de UI en `apps/web/src/components/` (`Page`, `PageHeader`, `Card`, `Button` con variantes primary/secondary/ghost/danger, `IconButton`, `Field`, `Segmented`, `Switch`, `EmptyState`, `Dialog`, `Popover`) y un reset global para `a`, `button`, `input`, `select`, `fieldset` en `styles.css`. Después migra pantalla a pantalla. Los textos `The proposal is not applied on its own`, `The session lives on the server...` y similares son texto de desarrollo: reescríbelos como ayuda de usuario (o elimínalos).

---

## P1-12. Navegación y layout móvil

**Qué es.** Comportamiento a 390x844 (Pablo no pudo revisarlo; sí está peor).

**Resultado actual (capturas `07`, `08`, `09`).**

- Las filas de tarea se cortan por la derecha: el título no tiene elipsis y las etiquetas salen de pantalla (Today), o la fila empieza con sangría desigual (el check a x=47 y la línea separadora a x=28 en "All").
- Detalle de tarea: ver P0-4 (sin drawer, fondo transparente, contenido mezclado con la lista).
- La barra inferior solo tiene Today, Lists, "+", Search, Habits. No hay acceso a Calendar ni a Settings. El botón "Lists" no es evidente.
- Drawer del sidebar: funciona, pero muestra el pie de tres botones grandes (P1-8) que tapa lista de listas, y no hay lista de etiquetas visible sin hacer scroll.
- Settings: el menú de 14 enlaces azules ocupa media pantalla antes del contenido (P1-9).
- Calendario: celdas diminutas (P1-10).
- Blanco/sombra vertical en el borde izquierdo de todas las pantallas (el drawer cerrado con `box-shadow` visible a `translateX(-105%)`).

**Resultado esperado.** Móvil de primera clase: lista a ancho completo con fila de 56 px (check 44x44 de área táctil), swipe izquierda/derecha (ya hay `onTouchEnd` para completar, falta swipe-to-delete/schedule), hoja inferior para el detalle, barra inferior Today / Calendar / (+) / Lists / More (More abre Search, Habits, Filters, Settings), drawer con pie de iconos.

**Cómo arreglarlo.**

- `shell.css` media `<=1023px`: arreglar selector `.detail-panel` (P0-4), `.sidebar{box-shadow:none}` cuando está cerrado (`[data-drawer='open']{box-shadow:var(--shadow-lg)}`), `visibility:hidden` al cerrar.
- `BottomBar.tsx`: sustituir Habits por Calendar y añadir "More" con un sheet; mantener el FAB central.
- `.task-row` móvil: `padding-left:44px` y check dentro del flujo (grid) para alinear con la línea separadora; título 2 líneas máx. con `-webkit-line-clamp:2` en lugar de una; etiquetas bajo el título en móvil.
- Tap targets mínimos 44 px (`--tap`) en iconos de cabecera (`···`, ordenar, bombilla).
- Emular también tablet 820x1180 en Playwright.

---

## P1-13. Contadores del sidebar incoherentes

**Qué es.** Números a la derecha de cada smart list.

**Resultado actual.** Today = **0** mientras la página Today muestra 56 vencidas; All = 89 pero Recently added = 295 y Completed = 206 (All excluye completadas y Recently added las incluye, sin indicarlo); Next 7 days = 0 aunque hay tareas el 19-20 oct en el calendario y en papelera. La tarjeta "Overdue" del Garden dice 59, el sidebar y Today dicen 56 (distinto filtro: ¿incluye subtareas? ¿timezone?). Garden "Completed today 210" es igual a "Completed this week 210" (probablemente todas las completadas importadas tienen `completedAt` de hoy; ver P2-17).

**Resultado esperado.** Cada contador coincide con el número de filas de su lista. Today incluye vencidas (como TickTick) o la página las separa con el mismo criterio. Etiquetas claras ("All" = pendientes).

**Cómo arreglarlo.** Una única definición de cada smart list en `@reflexionia/domain` (`smartListClause`) usada por: contador, vista de lista, Garden y Review. Tests que comparen `task_count` con `tasks(...).length` para cada key. Revisa el uso de `time_zone` y `all_day` en `overdueIds` (`tasks.service.ts` ~2010) frente a `matchesClause`.

---

## P2-14. Detalles de fila y cabeceras de lista

- **"Repeat" en todas las filas de Today** (`TodayPage.tsx` ~655: `<Link ... to="/repeat?task=...">{repeatLabel}</Link>` siempre). Mostrar solo el icono `↻` si la tarea es recurrente; configurar la repetición desde el detalle.
- **Fechas**: formato `Jan 10` sin año aunque sea 2027; fechas pasadas lejanas en rojo (Mar 17, Apr 28). Mostrar "Hoy / Mañana / lun 20 / 10 ene 2027" y rojo solo para vencidas activas; tooltip con fecha completa. La fecha del "10/01 Cumple de Adrian" (10 ene 2027) y las tareas cuyo título repite la fecha deberían revisarse tras la importación.
- **Hueco superior en las vistas**: en All/Completed/Trash hay ~100 px en blanco entre el título y la primera fila (cabecera de agrupación vacía). Colapsar cuando `groupBy==='none'`. En All falta además la caja "+ Add task" de Today.
- **Cabecera**: el contador `89` y `···` flotan a la derecha sin etiqueta. Mostrar "89 tareas", y en el menú "···": ordenar, agrupar, mostrar completadas, mostrar detalles.
- **Títulos con markup de captura**: muchas tareas importadas conservan `#etiqueta` en el título y además tienen la etiqueta como chip (duplicado: "Asistenta lunes ... #casa #personal #gestion #10min" + chips casa, 10min, personal, gestion). Aplicar el parser de captura (`packages/domain/src/nlp/parse.ts`) a las tareas importadas para limpiar el título (ver P2-17).

## P2-15. Papelera

`/smart/trash` muestra 23 tareas con checkbox de completar, sin "Restaurar" ni "Eliminar definitivamente" por fila, y el botón "Empty" está en el pie del sidebar sin contexto. Esperado: cabecera con botón "Vaciar papelera" (con confirmación), fila con acciones restaurar y borrar definitivo, check oculto. Nota: contiene tareas de prueba anteriores ("Responder a los clientes", "hola", "nueva lista Viaje"...); Pablo puede vaciarla cuando quiera.

## P2-16. Mezcla de idiomas

Interfaz en inglés casi entera ("Add task", "Plan for today", "Overdue", "Smart lists") con restos en español ("Cada semana los lunes" en `/repeat`, nombres de listas) y textos de desarrollo visibles ("A habit is not a task...", "The proposal is not applied on its own", "Preview does not save it"). Pablo escribe en español. Esperado: español por defecto (`apps/web/src/i18n/es.ts`) con selector en Ajustes > Apariencia, y revisar que no haya claves faltantes en `es.ts`/`extra.ts` (compara claves de `en.ts` vs `es.ts` con un test). Elimina o reescribe cualquier texto que describa implementación.

## P2-17. Otros hallazgos

- **Datos importados**: tras importar de TickTick, `completedAt` parece ser la fecha de importación (Garden: Completed today 210, Created 303, Net -93). Si el importador conserva fechas originales (`completedTime`, `createdTime`), corrígelo y re-importa; si no, documenta que las KPI históricas no valen para datos importados.
- **Etiquetas**: el sidebar lista ~55 etiquetas seguidas sin colapsar ni buscar y con contadores en 0 para las no usadas. Colapsar sección, ordenar por uso, ocultar vacías y buscador.
- **Doble scroll** en el sidebar (barra interna del `nav` y barra de página) a 1280x713 (`.sidebar > nav{overflow:auto}`): mostrar scrollbar fina solo al pasar el ratón (`scrollbar-width:thin`).
- **Menú "···" de listas** (acciones de lista) existe en el sidebar (`BUTTON "Actions"` por lista): verifica renombrar, borrar y color con tests e2e (en la auditoría anterior no funcionaba).
- **Accesibilidad**: enlaces sin estilo de foco consistente; revisar contraste del chip de etiqueta (texto oscuro sobre azul claro `#9db3fb`) y del gris `--ink-3` sobre `--sidebar-bg`.
- **Rendimiento percibido**: skeleton de filas ya existe (`.task-skeleton`); úsalo en todas las listas y en el sidebar mientras cargan los contadores, y evita que el contador pase de 0 a su valor (muestra `—` hasta tener datos, no `0`).

---

## P0-18. La lista de etiquetas está paginada a 50 y el cliente nunca pide la página siguiente

- Qué es: `GET /api/v1/tags` devuelve 50 elementos más `next_cursor`. El cliente solo usa la primera página.
- Resultado actual: las etiquetas nuevas (`zztag`, `zztag2`) no aparecen en el sidebar (50 enlaces), ni en el select "Add tag" del detalle (51 opciones sin ellas). Las filas muestran el UUID de la etiqueta como chip (ej. `dc3805fe-a0d3-...`), porque `apps/web/src/features/tasks/model.ts` hace `tags.get(id) ?? id`. Además las etiquetas no visibles no se pueden borrar ni editar desde la UI.
- Esperado: todas las etiquetas visibles siempre; nunca un UUID como texto.
- Cómo arreglarlo: en `Sidebar.tsx` (~63-66) y en el hook de tags usar `useInfiniteQuery` o pedir `limit` alto hasta agotar `next_cursor`; en `model.ts` no mostrar el id: si no se resuelve, ocultar el chip y refetch de tags. Revisar el mismo problema de paginación en el resto de endpoints de listado (proyectos, tareas, hábitos). Test: crear 51 etiquetas y comprobar que aparece la 51.

## P0-19. Contadores del sidebar no se actualizan al crear/borrar/completar

- Resultado actual: tras crear tareas desde el sheet de captura, Today/All/Inbox/Recently added se quedaron en 89/12/295 más de 30 s, mientras la cabecera de la lista sí subía (13, 18). Tras recargar: 95/18/301. Al borrar, la lista no quita la fila hasta recargar (ver caso C9).
- Esperado: contadores y listas coherentes al instante.
- Cómo arreglarlo: `features/tasks/refresh.ts` debe invalidar la clave de `smart-lists` y las listas/vistas activas tras create, delete, duplicate y complete; en delete hacer actualización optimista quitando la fila de la caché. Comprobar que el quick-add del sheet de captura llama a la misma función de refresh.

## P1-20. Detalle de tarea: "Could not save." al poner recurrencia, sin explicación

- Caso: tarea con hora (`mañana a las 10:00`), botón "Every week" en el detalle: aparece "Could not save." y no se guarda (repeat sigue en `None`). En cambio `cada lunes` desde captura sí crea `RRULE:FREQ=WEEKLY;BYDAY=MO`.
- Esperado: guardar `FREQ=WEEKLY` también en tareas con hora, o mostrar el motivo del 400.
- Cómo arreglarlo: mirar `TaskDetail.tsx` (~390-415), que envía `repeat_rule: 'FREQ=WEEKLY'` sin BYDAY, y `canonicalRule` en `apps/api/src/modules/tasks/tasks.service.ts` (~342). Reproducir con la tarea con hora y sin hora, y mostrar el error devuelto por la API en el toast.

## P1-21. Borrado y duplicado sin feedback

- Delete en el detalle: el primer clic cambia el botón a rojo (confirmación implícita sin texto) y el segundo borra; no hay toast ni "Deshacer", y la fila borrada sigue en la lista hasta recargar. Duplicate crea la copia pero no hay aviso ni la abre.
- Esperado: toast "Tarea movida a la papelera · Deshacer", fila fuera al instante, y "Duplicada" con enlace a la copia. Texto claro en el botón de confirmación ("Confirmar borrado").
- Archivos: `TaskDetail.tsx` (acciones Copy link/Duplicate/Delete) y `refresh.ts`.

## P2-22. Parser de captura rápida: inconsistencias

- `p1` (inglés) da prioridad Baja, pero `!1` da Alta. Unificar: p1 = más alta (como TickTick: `!1`=alta, `!3`=baja; si `p1` se admite debe ser alta).
- El inglés `every weekday at 9am` no se interpreta (el título conserva todo el texto, sin fecha ni repetición), mientras `cada lunes`, `mañana a las 10:00` y `tomorrow 5pm` sí. Añadir `every ...` al parser o documentar que solo vale español.
- El aviso verde "Task created / Tag zztag was created" empuja la lista hacia abajo y trunca el título en el primer token. Mostrarlo como toast flotante.
- Durante la carga el sidebar enseña Trash 0, "No tags" y contadores a 0: usar skeleton.
- La lista Inbox muestra "Bandeja de entrada" y el sidebar "Inbox": unificar idioma.
- Papelera: no existe ruta directa (`/trash` redirige a Today; la real es `/smart/trash`) y las filas de la papelera no tienen acción de restaurar ni de borrar definitivamente por elemento; solo "Empty" para todo.

## Casos funcionales probados (entorno real, datos "ZZ TEST")

Todos creados desde el sheet de captura (botón New task) en Inbox.

| #   | Entrada                                      | Esperado                                               | Resultado                                                                                  | Bug                                          |
| --- | -------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------- |
| C1  | `ZZ TEST 1 simple`                           | Tarea en Inbox                                         | OK                                                                                         | Contadores del sidebar no suben (P0-19)      |
| C2  | `... #zztag !1`                              | Prioridad alta + etiqueta nueva                        | OK, `!1` se quita del título                                                               | Etiqueta nueva no aparece en sidebar (P0-18) |
| C3  | `... mañana a las 10:00 #zztag`              | 19/10 10:00                                            | OK (08:00Z)                                                                                | Chip muestra UUID (P0-18)                    |
| C4  | `... tomorrow 5pm p1 #zztag2 #zztag`         | Fecha 17:00, 2 tags, prioridad alta                    | Fecha OK, 2 tags OK, prioridad BAJA                                                        | P2-22                                        |
| C5  | `... cada lunes` y completar                 | Repite semanal; al completar nace la siguiente (26/10) | OK. La siguiente se crea, pero la fila completada se queda tachada en Inbox hasta recargar | Lista no se refresca (P0-19)                 |
| C6  | `... every weekday at 9am`                   | Fecha + repetición                                     | Sin fecha ni repetición                                                                    | P2-22                                        |
| C7  | Detalle: editar título largo                 | Guarda y hace wrap                                     | Guarda OK; el panel solapa la lista a 1280 px                                              | P0-4                                         |
| C8  | Detalle: añadir checklist `ZZ sub 1`         | Subtarea en 0/1                                        | OK, pero el checkbox queda encima del texto                                                | Maquetación del checklist                    |
| C9  | Detalle: Duplicate, luego Delete (x8 tareas) | Copia visible; borrado quita la fila                   | Copia creada sin aviso; la fila borrada sigue hasta recargar                               | P1-21, P0-19                                 |
| C10 | Detalle: "Every week" en tarea con hora      | Se guarda                                              | "Could not save."                                                                          | P1-20                                        |
| C11 | Abrir `/trash`                               | Papelera                                               | Redirige a Today; la ruta real es `/smart/trash`; sin restaurar por elemento               | P2-22                                        |

Casos que no me dio tiempo a probar: reminders, mover entre listas, crear/renombrar listas, crear etiqueta desde el sidebar, convertir a nota, Kanban, atajos de teclado, "Process all".

## Datos de prueba (parte 1)

Las 8 tareas "ZZ TEST" de la primera ronda están en la papelera. El estado final tras la parte 2 (etiquetas borradas, lista y filtro eliminados, 10 ítems ZZ en papelera) está en la sección "Datos de prueba (estado final tras la parte 2)" al final del documento.

## Orden de trabajo recomendado

1. **Rendimiento API** (P0-1) y **cliente** (P0-2): medir antes/después con la misma secuencia de fetch (habits, projects, smart-lists, tags, tasks) y adjuntar tiempos.
2. **Layout de fila + scroll + detalle** (P0-3, P0-4, P0-5, P0-6): un solo `TaskRow`, un solo CSS, tests de `scrollWidth`.
3. **Sidebar** (P1-8, P1-13) y **móvil** (P1-12).
4. **Sistema de UI base** y pantallas sin estilo (P1-9, P1-10, P1-11).
5. **Pulido** (P1-7, P2-\*).

Criterios de aceptación globales:

- `scrollWidth <= innerWidth` en todas las rutas a 1280, 820 y 390 px.
- Arranque en frío: <= 8 peticiones a `/api/v1/`, ninguna > 400 ms con los datos actuales (~600 tareas).
- Completed muestra checks rellenos y tachado; Tag, Search, Today, All, Lists usan el mismo `TaskRow` con check.
- Detalle de tarea no solapa nada a ningún ancho.
- Pie del sidebar: una fila de 3 iconos.
- Todo el texto de UI en español por defecto y sin textos de desarrollo.

---

# Parte 2: pruebas funcionales ampliadas (18-oct-2026, noche)

Segunda ronda sobre el mismo despliegue, centrada en lo no probado en la parte 1: recordatorios, mover entre listas, crear/renombrar/borrar listas, kanban, timeline, atajos de teclado, "Process all", tema oscuro, hábitos, sub/notas, etiquetas, Focus, Matrix, calendario-día, exportar datos, PWA, integraciones, sharing, webhooks, automatizaciones, filtros y móvil. Mismas reglas: solo datos "ZZ TEST", sin tocar tareas reales. NOTA: hay indicios de que el build desplegado no coincide con `main` (`41e866d`): en producción Focus muestra botones "Start/Pause" mientras el repo dice "Start/Reset", y el texto en inglés del botón de exportación en `main` es literalmente `n` (ver P1-30). Verifica qué commit está desplegado.

## Resumen de prioridades (parte 2)

| #   | Prioridad | Tema                                                                                          |
| --- | --------- | --------------------------------------------------------------------------------------------- |
| 23  | P0        | "Add reminder" no crea nada y no muestra error (P0-23)                                        |
| 24  | P0        | Focus no funciona y afirma algo falso (sesión en servidor) (P0-24)                            |
| 25  | P1        | Kanban: sin refresco tras soltar, sin drop en "No section", alert nativo (P1-25)              |
| 26  | P1        | Timeline: "Place today" sin refresco, "Unscheduled" duplicado, sin eje real (P1-26)           |
| 27  | P1        | "Process all": "Set date" fija mañana sin preguntar; contadores sin refrescar (P1-27)         |
| 28  | P1        | Etiquetas sin gestión: renombrar/borrar/fusionar existe en API pero no hay UI (P1-28)         |
| 29  | P1        | Ajustes: Automations y Webhooks sin botón de crear; Sharing vacío; Data sin restaurar (P1-29) |
| 30  | P1        | Calendario día muestra la fecha ISO cruda; Integrations sin configurar (P1-30)                |
| 31  | P2        | Notas borradas no aparecen en la papelera (zombis irrecuperables) (P2-31)                     |
| 32  | P2        | Atajos: N abre página en vez de sheet; ayuda incompleta (P2-32)                               |
| 33  | P2        | Hábitos: archivar sin confirmación ni lista de archivados; días activos por defecto (P2-33)   |
| 34  | P2        | Filtros: contador incoherente (164 vs All 91); borrar sin confirmación (P2-34)                |

## P0-23. "Add reminder" no crea nada y no muestra error

**Qué es.** Los dos botones "Add reminder" del detalle de tarea (icono campana en la cabecera y botón de la sección Reminders).

**Resultado actual (probado).** Clic y no pasa nada visible. `GET /api/v1/tasks/<id>/reminders` sigue devolviendo `[]` tras varios clics. Ningún mensaje de error al usuario.

**Causa en el código.** `apps/web/src/features/tasks/TaskDetail.tsx` (~líneas 158-167 y ~370-380) envía `trigger: '-PT30M'`. El API exige el formato iCalendar con prefijo: la regex `DURATION` de `packages/domain/src/reminders/trigger.ts` (~línea 16) es `/^TRIGGER(?:;([^:]*))?:(-)?P...$/`, así que `parseTrigger('-PT30M')` devuelve `{ok:false}` y `assertReminder` (`apps/api/src/modules/tasks/tasks.service.ts` ~1292) lanza 400 "trigger is invalid". El cliente hace `void api.createReminder(...).then(...)` sin `.catch`: la promesa rechazada se traga el error (unhandled rejection) y el usuario no ve nada.

**Resultado esperado.** El recordatorio se crea y aparece en la lista al instante; el usuario elige cuándo (30 min antes, 1 h antes, 1 día antes, fecha/hora exacta, al llegar/salir) y canal; un error de la API se muestra en un toast.

**Cómo arreglarlo.**

- Envía `trigger: 'TRIGGER:-PT30M'` (con prefijo) o amplía `parseTrigger` para aceptar la forma corta. Alinea el ejemplo del DTO (`tasks.dto.ts` ya enseña `TRIGGER:-PT5M`).
- Añade `.catch` con toast que muestre el mensaje del API en los dos botones (y repasa el resto de `void api.*.then(...)` sin catch de `TaskDetail.tsx`).
- Sustituye el valor fijo por un pequeño popover de opciones (relativo a vencimiento: -PT30M, -PT1H, -P1D; absoluto con fecha/hora; canal push/email).
- Test e2e: crear recordatorio desde el detalle y afirmar que aparece en la lista sin recargar.

## P0-24. Focus no funciona y promete algo que no hace

**Qué es.** La página `/focus` (Pomodoro).

**Resultado actual (probado en producción).** El reloj muestra "25:00" y los botones "Start" y "Pause"; pulsar Start (clic real y sintético) no arranca nada: el reloj no baja y el botón no cambia. El texto dice "The session lives on the server. Closing the tab does not drop it.", pero en `main` la página es un `useState` local (`apps/web/src/features/places/Places.tsx` ~587-627, `FocusPage`): no llama a ningún endpoint, así que cerrar la pestaña sí lo pierde todo. Además el despliegue muestra "Start/Pause" y el repo "Start/Reset": el build desplegado no es `main` (ver nota de cabecera).

**Resultado esperado.** Sesión real contra el API (que ya existe: `POST /api/v1/focus/sessions`, `sessions/:id/finish`, `sessions/:id/abort`, `GET /focus/stats`, `GET /focus/settings`, `apps/api/src/modules/focus/focus.controller.ts`), con duración configurable, tarea asociada opcional, aviso al terminar y estadísticas. Si no va a funcionar aún, quita la página del menú.

**Cómo arreglarlo.** Reescribe `FocusPage` contra `focus.controller`: crear sesión al pulsar Start (con `task_id` opcional), hidratar el estado al cargar (`GET /focus/sessions?status=active`), Pause/Resume/Finish/Abort según el estado del servidor, y mostrar racha/stats de `/focus/stats`. Corrige el texto de ayuda. Test e2e: Start -> recargar la página -> el temporizador sigue.

## P1-25. Kanban: sin refresco tras soltar, sin vuelta a "No section", `window.alert`

**Qué es.** La vista Kanban de una lista (Actions -> Kanban). Se probó creando la sección "ZZ Sección" y arrastrando una tarea.

**Resultado actual (probado).** El arrastre hace `PATCH /tasks/:id` y la columna destino **no se actualiza hasta recargar la página** (`TaskList.tsx` ~418: `api.patchTask(...)` sin invalidar queries). No se puede devolver una tarjeta a "No section" (`if (id.length === 0 || column.id === 'none') return;`). El límite WIP muestra `window.alert` nativo (`messages.wipExceeded`); otros errores se tragan en silencio. Las tarjetas son una caja con borde sin estilo de tarjeta (sin sombra, sin fecha/etiquetas), el input "Add a section to use the kanban." se corta y el textbox "Column limit" queda suelto al final sin contexto.

**Resultado esperado.** Al soltar, la tarjeta aparece en la columna destino al instante (optimista), se puede soltar en "No section" (`column_id: null`), indicador visual de destino durante el arrastre, errores en toast, tarjetas con el mismo contenido que una fila (prioridad, fecha, etiquetas), WIP limit en la cabecera de la columna (`3/5` ya existe, falta estilo).

**Cómo arreglarlo.** En el `onDrop` de `TaskList.tsx`: `patchTask(id, { column_id: column.id === 'none' ? null : column.id })` y después invalidar la query de la lista (o actualización optimista con `queryClient.setQueryData`); elimina la guarda de `'none'`. Sustituye `window.alert` por un toast. CSS de `.kanban article` como tarjeta (fondo `--surface`, `--shadow-sm`, radio, padding) y `.kanban-col.is-over` para el destino.

## P1-26. Timeline: "Place today" sin refresco y "Unscheduled" duplicado

**Qué es.** La vista Timeline de una lista.

**Resultado actual (probado).** "Place today" pone la fecha de hoy (`patchTask` con `due_date` y `start_date`) pero la tarea sigue bajo "Unscheduled" hasta recargar (mismo bug de refresco que Kanban). Si no hay tareas planificadas, "Unscheduled" aparece dos veces (la cabecera del `aside` y el estado vacío del panel, `TaskList.tsx` ~520 y ~553). No hay eje temporal: las tareas planificadas son botones apilados sin posición por fecha y el zoom day/week/month no cambia nada visible.

**Resultado esperado.** Refresco inmediato, una sola cabecera, barras posicionadas en un eje de fechas real y arrastre desde "Sin programar" a un día. Si no va a ser un timeline de verdad en esta iteración, quita la vista del menú.

## P1-27. "Process all": "Set date" fija mañana sin preguntar

**Qué es.** El modo "Process all" del Inbox (tarjeta con Set date / Move to list / Done / Delete / Skip).

**Resultado actual (probado).** "Set date" llama a `snoozeTask(id, 'tomorrow')` directamente (`apps/web/src/features/places/Places.tsx` ~86): fija mañana sin date picker y sin aviso de qué hizo. "Delete" no pide confirmación. Tras cada acción, `step()` solo invalida `['inbox-tasks']` (~línea 136): los contadores del sidebar no se actualizan. El orden de procesado es por `created_at` descendente (las más nuevas primero), cuestionable.

**Resultado esperado.** "Set date" abre un selector (Hoy, Mañana, Esta semana, Elegir fecha), cada acción muestra toast con deshacer, los contadores se refrescan (usa `refreshTaskSurfaces`), y Delete pide confirmación o es deshacible.

## P1-28. Etiquetas: no hay forma de gestionarlas desde la UI

**Qué es.** Renombrar, recolorear, borrar o fusionar etiquetas.

**Resultado actual (probado).** No existe ninguna UI: el sidebar solo enlaza a `/search?q=%23tag` (ver P0-6) y el detalle solo añade/quita. El API sí lo tiene todo: `PATCH /api/v1/tags/:id`, `DELETE /api/v1/tags/:id` y `POST /api/v1/tags/merge` (`apps/api/src/modules/tags/tags.controller.ts`). Para limpiar las etiquetas de prueba (`zztag*`) tuve que llamar al API a mano con el token CSRF; un usuario normal no puede hacerlo.

**Resultado esperado.** Menú "···" en cada etiqueta del sidebar (renombrar, color, fusionar con otra, borrar con confirmación) y cabecera editable en la futura página `/tag/:id` (P0-6).

**Cómo arreglarlo.** Reutiliza el patrón del menú de listas de `Sidebar.tsx` (que ya tiene Rename/Color/Archive/Delete y funciona bien) para las etiquetas, llamando a los endpoints existentes. Borrado con confirmación "Las tareas conservan el texto pero pierden la etiqueta" y actualización optimista.

## P1-29. Automations y Webhooks sin forma de crearlos; Sharing vacío; Data sin restaurar

**Qué es.** `/settings/automations`, `/settings/webhooks`, `/settings/sharing`, `/settings/data`, `/settings/integrations`.

**Resultado actual (probado).**

- Automations: solo "There are no automations yet.", sin botón de crear. El API existe: `GET/POST /api/v1/automations`, `POST /automations/:id/run`.
- Webhooks: solo "There are no webhooks yet.", sin botón de crear. El API existe: `GET/POST /api/v1/webhooks`, `:id/ping`, `deliveries/:id/retry`.
- Sharing: una página casi vacía ("Share").
- Integrations: muestra "Telegram: Online", "Drive: Online", "Google: Offline" con "Connect Google", pero sin forma de configurar, probar o desconectar las que están "Online".
- Data: "Export JSON" funciona (el endpoint `GET /api/v1/export/json` devuelve 200 con ~500 KB), y el texto habla de backups y de restaurar, pero no hay control de restauración visible. En `main`, `ProductPages.tsx` usa la clave i18n `n` cuyo texto en inglés es literalmente `'n'` (`apps/web/src/i18n/extra.ts` ~353); en producción se lee "Export JSON", otra señal de que el despliegue no es `main`.

**Resultado esperado.** Si la función no está lista, quita la página del menú de ajustes. Si está: formulario de crear automatización (cuando -> entonces) y de webhook (URL, eventos, secreto), lista de compartidos con revocar, botones desconectar/probar en cada integración, y en Data: exportar (ya), importar con validación y estado de backups con descarga.

## P1-30. Calendario día: fecha ISO cruda; Integrations sin gestionar

**Qué es.** `/calendar/day` (clic en un día del mes).

**Resultado actual (probado).** La tarea se muestra como texto "ZZ TEST 5 · 2026-10-18T22:00:00.000Z": fecha ISO cruda, sin formato, y la tarea no es una fila interactiva (sin check, sin abrir detalle). No hay vista de horas ni botón de añadir en ese día.

**Resultado esperado.** La vista día usa `TaskRow`, con la hora formateada según la zona del usuario ("08:00"), agrupada por horas, y un "+ Add task" que pre-rellena ese día.

## P2-31. Las notas borradas no aparecen en la papelera

**Qué es.** "Convert to note" en el detalle convierte la tarea en nota; al borrarla va a la papelera, pero la vista papelera no la muestra.

**Resultado actual (probado).** Convertí "ZZ TEST mover 1" a nota y la borré: `GET /tasks/<id>` da 404 (está borrada) pero la papelera no la lista. Causa: `apps/web/src/features/views/components/ViewPages.tsx` ~147 filtra las filas por `row.kind === 'task'` salvo en vistas de nota, y la papelera no tiene variante de notas. La nota queda zombi: ocupa sitio y no se puede restaurar ni borrar definitivamente desde la UI. Además "Convert to note" no da feedback ni navega a la nota.

**Resultado esperado.** La papelera muestra tareas y notas (con pestaña o etiqueta "nota"), "Convert to note" avisa y abre la nota, y existe "Convert to task" (sí existe en el detalle, probado: el botón cambia a "Convert to task").

## P2-32. Atajos de teclado: funcionan, con matices

**Resultado actual (probado).** `?` abre la ayuda, `N` va a `/quick-add`, `Ctrl/Cmd+K` abre la paleta (busca y navega a listas), `G`+letra navega (T/I/C/M/S y también A/B/N/R/W), `Esc` cierra, `.` invalida queries, `[` contrae el sidebar. Matices: `N` navega a la **página** `/quick-add` en vez de abrir el sheet de captura que usa el botón "New task" (`CaptureHotkey` en `app.tsx` ~193 vs CaptureSheet); la ayuda y `/settings/shortcuts` no documentan `G A`, `G B`, `G N`, `G R`, `G W` ni `[` (`GlobalKeys.tsx` mapa `GO`, `shortcuts.ts` `isSidebarShortcut`).

**Resultado esperado.** `N` abre el mismo sheet que el botón; la tabla de atajos lista todos los que existen (generada desde una única fuente, no a mano en dos sitios: `Places.tsx` `ShortcutSettings` y `ShortcutHelp.tsx`).

## P2-33. Hábitos: archivar sin confirmación ni lista de archivados

**Resultado actual (probado).** Crear hábito OK, check-in OK (contador 1/1, racha y porcentajes al instante). Archivar lo quita de la lista al instante pero sin confirmación, sin deshacer y sin ninguna vista de hábitos archivados para recuperarlo. El grupo "Active days" del alta no marca ningún día por defecto (¿hábito sin días = todos los días? hay que comprobarlo; debería venir todo marcado). El formulario de alta sigue siempre desplegado (ver P1-11).

## P2-34. Filtros: contador incoherente y borrado sin confirmación

**Resultado actual (probado).** Crear filtro OK (aparece en el sidebar con contador), la página del filtro usa `TaskRow` con check (bien), Pin y Delete funcionan. Pero: un filtro guardado sin condiciones válidas muestra contador **164** mientras "All" muestra **91**: no está claro qué cuenta (¿subtareas? ¿notas? ¿archivadas?). Delete no pide confirmación ni da deshacer. El combo de valor de la condición es un control nativo extraño (un `<input>` que se comporta como desplegable). El texto "A filter is a view with a counter. Preview does not save it." es nota de desarrollo (ver P2-16).

## P2-35. Tema oscuro y PWA: correctos

- Tema: el ciclo Auto -> Light -> Dark funciona desde el botón del sidebar y se aplica `data-theme` al instante; el modo oscuro se ve consistente en Today (captura). Sin problemas detectados.
- PWA: `/manifest.webmanifest` correcto (standalone, iconos 192/512, `start_url` `/today`, theme `#4772fa`) y service worker registrado con scope raíz. No se ha probado el modo offline real. Nota: `/manifest.json` devuelve HTML (404), solo existe `.webmanifest`; es válido pero conviene redirigir.

## Casos funcionales probados (parte 2, datos "ZZ TEST")

| #   | Caso                                                    | Resultado                                                                                                          | Bug                                     |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| C12 | Process all -> "Set date"                               | Fija mañana sin preguntar ni avisar                                                                                | P1-27                                   |
| C13 | Crear lista, renombrar, color, borrar                   | Todo OK; borrar pide confirmación ("Tasks in X will go to the trash")                                              | Cabecera "List" genérica mientras carga |
| C14 | Kanban: crear sección, arrastrar tarea                  | Sección OK; el drop hace PATCH pero no refresca hasta recargar; no se puede volver a "No section"                  | P1-25                                   |
| C15 | Timeline -> "Place today"                               | Aplica la fecha pero no refresca hasta recargar                                                                    | P1-26                                   |
| C16 | Mover tarea a otra lista desde el detalle (select List) | OK, sin toast                                                                                                      | Falta feedback                          |
| C17 | Convertir a nota y borrar                               | Convierte sin feedback; la nota borrada no aparece en la papelera                                                  | P2-31                                   |
| C18 | "Add reminder" (x3 clics)                               | No crea nada, sin error visible; GET confirma `[]`                                                                 | P0-23                                   |
| C19 | Hábito: crear, check-in, archivar                       | Crear y check-in OK (1/1, racha 1); archivar sin confirmación ni deshacer                                          | P2-33                                   |
| C20 | "New tag" en sidebar                                    | Crea la etiqueta (zztag3), pero no aparece en el sidebar (paginación P0-18) y no se puede borrar desde la UI       | P1-28, P0-18                            |
| C21 | Atajos ?, N, Ctrl+K, G T, Esc, .                        | Funcionan; N abre página en vez de sheet; ayuda incompleta                                                         | P2-32                                   |
| C22 | Tema oscuro (Auto/Light/Dark)                           | OK, consistente                                                                                                    | -                                       |
| C23 | Filtro: crear, preview, página, borrar                  | Todo OK; contador 164 vs All 91 incoherente; borrar sin confirmación                                               | P2-34                                   |
| C24 | Focus: Start                                            | No arranca en producción; la "sesión en servidor" no existe en el cliente                                          | P0-24                                   |
| C25 | Calendario: clic en un día                              | Vista día con fecha ISO cruda y sin TaskRow                                                                        | P1-30                                   |
| C26 | Export JSON (`GET /api/v1/export/json`)                 | 200, ~500 KB con todo el contenido                                                                                 | Falta importar/restaurar en UI (P1-29)  |
| C27 | Matrix en móvil 390px                                   | Sin scroll horizontal; una columna, tarjetas con enlaces crudos (mismo P1-11); barra inferior sin Calendar (P1-12) | -                                       |

Sin probar aún: compartir listas entre usuarios (single-user), notificaciones push reales (recordatorios no se pueden crear: P0-23), modo offline real, importador TickTick (ya usado por Pablo), automatizaciones y webhooks end-to-end (no hay UI), archivar lista (solo borrar probado), búsqueda avanzada.

## Datos de prueba (estado final tras la parte 2)

Limpiados por completo:

- Hábito "ZZ TEST hábito": archivado.
- Filtro "ZZ TEST filtro": borrado.
- Lista "ZZ TEST lista renombrada" (y su sección kanban "ZZ Sección"): borrada con confirmación.
- Etiquetas `zztag`, `zztag2`, `zztag3`: borradas vía API (`DELETE /api/v1/tags/:id`, 204). No hay UI para ello (P1-28).

Quedan en la papelera (10 ítems "ZZ TEST"): ZZ TEST 1, 2, 3 (x2: la editada y su duplicada), 4, 5 (x3: la recurrente completada y dos ocurrencias), 6, y "ZZ TEST mover 1" convertida a nota (invisible en la papelera por P2-31). No se pueden borrar definitivamente de forma individual: el API solo tiene `DELETE /tasks/trash` (vaciar todo) y `POST /tasks/trash/:id/restore`. No vacío la papelera para no tocar las 23 tareas reales que Pablo ya tenía. Cuando exista borrado por elemento (P2-15), eliminarlas; la nota zombi requiere además arreglar P2-31 o borrarla por base de datos.

Ninguna tarea real de Pablo fue creada, editada, completada ni borrada en esta ronda.
