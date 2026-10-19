# Pulido UX/UI de la pantalla "Hoy" (Mañana y demás vistas heredan lo mismo)

Fecha: 2026-10-19. Revisión sobre https://todo.reflexionia.com/ (commit de main revisado: 57fe6fc) y repo `povedica/tick-tack-done`.
Referencia de comportamiento: la vista Hoy de una app de tareas madura, con agrupación por prioridad. Los valores se dan como **decisiones de diseño propias**, sin citar origen.
Reglas para Cursor: no tocar lógica de dominio ni API salvo donde se indica. Todos los textos en `i18n/es.ts` y `i18n/en.ts`. Verificar con `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

Capturas de referencia (adjuntas por WhatsApp): `REF-1` lista de referencia con hora y grupo Hábito, `REF-2` panel de detalle + selector de fecha, `TTD-1` Hoy actual, `TTD-2` panel de detalle actual, `TTD-3` filas actuales con "Hoy" sin hora.

---

## Resumen de hallazgos (prioridad)

| # | Prioridad | Problema | Causa en código |
|---|---|---|---|
| 1 | P0 | Tarea con hora no muestra la hora en la lista (solo "Hoy") | `TodayPage.tsx` `TaskGroup` renderiza `formatDueDate` y nunca la hora |
| 2 | P0 | "Vencidas" sale antes que "Alta" | `TodayPage.tsx` pinta `parts.overdue` siempre antes de `sections` |
| 3 | P0 | Panel de detalle básico (selects nativos, botones de texto, "Borrar" rojo arriba) | `TaskDetail.tsx` + `ui.css` `.detail-panel` |
| 4 | P0 | "Hábitos de hoy" vacío: solo un `h2` sin nada | `TodayPage.tsx` sección `habitsToday` |
| 5 | P1 | Quick-add sin feedback del parseo (fecha/hora/prioridad) | `quick-add.ts` parsea pero no hay chip en UI |
| 6 | P1 | Filas: columna meta limitada al 42%, el título se corta pronto, "Bandeja" se trunca a "B" con el panel abierto | `today.css` `.task-row grid-template-columns` |
| 7 | P1 | Sin animación al completar; toast abajo-izquierda tapa el pie del sidebar; hay 2 estilos de toast distintos | `completion.ts`, `toast.css`, `ui.css .action-toast` |
| 8 | P1 | Cabecera de grupo sin colapso visible ni espaciado superior ("Alta" pegada a la fila anterior) | `TaskGroup` usa `<details>` sin chevron propio |
| 9 | P2 | "Plan de hoy" ocupa una tarjeta fija aunque esté vacío | `TodayPage.tsx` `<details className="plan">` |
| 10 | P2 | Estado "Actividad": "Tú · created · hace 1 minuto" (inglés crudo) | `TaskDetail.tsx` ~L517 `entry.action` |
| 11 | P2 | Botones sueltos "Convertir en nota" y "Mañana" al final del panel; "No se repite" duplicado | `TaskDetail.tsx` ~L522 |
| 12 | P2 | En móvil la última fila queda tapada por la barra inferior | falta `padding-bottom` en `.today` |

---

## 1. Hora de la tarea no aparece (P0)

**Qué es:** si creas "Reunión hoy 18:00" la tarea se guarda con `19 oct 2026, 18:00` (el detalle lo muestra), pero en la lista solo sale "Hoy".
**Comportamiento esperado:** la hora aparece a la derecha, en color acento, con icono de campana si tiene recordatorio. Las tareas sin hora no muestran nada. Si es de otro día, "12 sep" y la hora si la hay.
**Actual:** `formatDueDate` solo devuelve día; `TaskGroup` no tiene hora (ver `TTD-3`).
**Cómo arreglarlo:**
- `features/today/groups.ts`: añadir `hasTime(dueDate, timeZone)` (hora local distinta de 00:00 y marca `all_day` si la API la expone; si no, definir "sin hora" = 00:00 exacto) y `formatDueTime(dueDate, timeZone, locale)` con `Intl.DateTimeFormat(locale, {hour:'2-digit', minute:'2-digit', timeZone, hour12:false})`.
- `TodayTask` debe incluir `allDay: boolean` y `hasReminder: boolean` (mapear en `board.ts` `toTodayTask`).
- `TodayPage.tsx` `TaskGroup`: después del nombre de lista, si hay hora, `<time className="task-time">18:00</time>`; con recordatorio añadir icono `AlarmClock` de lucide (12px).
- En la vista del día (no vencidas) mostrar **solo la hora** en lugar de "Hoy" (el grupo ya dice que es hoy). En vencidas: "19 mar" + hora.
- Orden dentro de cada grupo: primero las que tienen hora (ascendente), luego las de todo el día. `partitionToday` ya ordena por `dueDate`; cambiar el comparador para que "sin hora" vaya después.
- CSS en `today.css`: `.task-time { color: var(--accent); font-variant-numeric: tabular-nums; }`; `.task-date.is-overdue` se mantiene rojo.
**Test:** `groups.spec.ts` casos con hora, sin hora, zona horaria Europe/Madrid y cambio de día.

## 2. Orden de secciones: Vencidas antes que Alta (P0)

**Esperado (decisión de producto):** con agrupación por prioridad, las vencidas **no** forman un bloque aparte: se reparten dentro de su grupo de prioridad (Alta, Media, Baja, Ninguna), con la fecha en rojo. El bloque "Vencidas" solo existe cuando la agrupación es por fecha, y allí va primero.
**Actual:** `TodayPage.tsx` pinta siempre `parts.overdue` (54 tareas) antes de `sections` (ver `TTD-1`), así que Alta queda enterrada.
**Cómo arreglarlo:**
- `TodayPage.tsx`: si `group === 'priority' | 'tag' | 'list'`, usar `groupTasks([...parts.overdue, ...parts.today], group)` y no renderizar el bloque Vencidas aparte. Si `group === 'due'`, mantener Vencidas primero y luego Hoy.
- Dentro de cada grupo, orden por fecha ascendente (las más antiguas primero) y las de hoy después; estas últimas con hora ordenadas por hora.
- `groupTasks` ya soporta lista completa; añadir test en `groups.spec.ts`: "las vencidas de prioridad alta aparecen en el grupo Alta".
- Ofrecer en el menú de orden (icono ArrowUpDown) la opción "Agrupar por: Prioridad | Fecha | Etiqueta | Lista | Sin agrupar" y "Ordenar por: Fecha | Prioridad | Título" y "Orden: más antiguas primero / más recientes". Persistir en `localStorage` (ya existe `GROUP_KEY`).
- Añadir al final un grupo **Hábitos** (ver punto 4).
- Cabecera de grupo: texto 14px peso 600, contador gris 13px, chevron a la izquierda (`ChevronDown`, gira al colapsar), margen superior 16px. Colapsar con clic; persistir estado de colapso por grupo en `localStorage`.

## 3. Panel de detalle (P0): rediseño

**Actual (`TTD-2`):** es una columna de formulario: botones de texto "Copiar enlace / Duplicar / Iniciar foco", botón rojo "Borrar" arriba, `Fecha` como input, `Añadir etiqueta` como `<select>` nativo, `Contenido` con textarea, "Checklist", "Recordatorios" con `<select>`, "Repetición" con tres botones, "Adjuntos", "Actividad" en inglés.
**Esperado (`REF-2`):** cabecera con checkbox, chip de fecha clicable, bandera de prioridad; título grande editable; descripción; chips de etiqueta con "+"; pie con lista y acciones; todo lo demás en popovers y menú "⋯".

### Wireframe propuesto (desktop, panel de 380px)

```
┌───────────────────────────────────────────┐
│ [☐]  | [📅 Hoy, 19 oct, 18:00 ▾]     [⚑] │  cabecera 56px, borde inferior
├───────────────────────────────────────────┤
│ ZZ TEST reunión                       [≡] │  título 20px/600, sin borde, auto-alto
│ Escribe algo o / para comandos            │  descripción 14px, ink-3 placeholder
│                                           │
│ ▢ Subtarea 1                              │  checklist inline (checkbox + texto)
│ + Añadir subtarea                         │
│                                           │
│ [cumple ×] [casa ×] [+]                   │  chips etiqueta + botón "+"
│                                           │
│ 🔔 Recordatorio: 30 min antes        [×]  │  solo si existe
│ 🔁 Repite: cada semana               [×]  │  solo si existe
│ 📎 2 adjuntos                             │  solo si existen
├───────────────────────────────────────────┤
│ 📥 Bandeja ▾                 [Aa] [💬] [⋯]│  pie 48px: lista, formato, comentarios, más
└───────────────────────────────────────────┘
```

### Especificación por control
- **Cabecera:** `PriorityCheck` (checkbox con color de prioridad) + separador vertical de 1px + `DueChip` + espacio + botón bandera. El chip de fecha se pinta rojo si está vencida ("hace 3 meses, 18 jul"), acento si es hoy/futura, gris si no hay fecha ("Fecha").
- **Selector de fecha (popover 260px):** pestañas "Fecha | Duración"; fila de 4 atajos con icono (Hoy, Mañana, +7 días, Sin fecha); calendario mensual con día seleccionado en círculo acento y flechas de mes; filas "Hora", "Recordatorio" y "Repetir" con chevron que abren sub-popovers; botones "Borrar" (secundario) y "OK" (primario). Crear `components/DatePopover.tsx` (reutilizable en quick-add y menú contextual) y sustituir el input de `Fecha`.
- **Prioridad:** popover con 4 filas (bandera de color + texto + check en la activa): Alta, Media, Baja, Ninguna. Sustituye al `<select class="sr-only">` actual (`TaskDetail.tsx` ~L185).
- **Título:** `textarea` auto-resize, sin borde, 20px/600; Enter confirma, Shift+Enter nueva línea.
- **Etiquetas:** chips con color de la etiqueta y `×` al hover; botón circular `+` abre un popover con buscador y lista con casillas (sustituye al `<select>` "Añadir etiqueta", que hoy lista 60 etiquetas sin filtro).
- **Recordatorios y repetición:** ya no son secciones permanentes. Se muestran como filas solo si existen; se añaden desde el popover de fecha. Eliminar el `<select>` "30 min antes" que aparece sin recordatorio, y el texto duplicado "No se repite".
- **Pie:** selector de lista como botón con icono y popover de listas (no `<select>` nativo); a la derecha iconos `Type` (formato), `MessageSquare` (comentarios) y `MoreHorizontal`.
- **Menú "⋯" (popover vertical, 220px):** Añadir subtarea, Vincular tarea padre, Fijar, Descartar, Etiquetas, Subir adjunto, Iniciar foco, Actividad de la tarea, Guardar como plantilla, Duplicar, Copiar enlace, Convertir en nota, Exportar, Imprimir, y **Borrar** al final (rojo, con separador). Quitar el botón "Borrar" rojo de la cabecera y los botones de texto sueltos, y "Mañana".
- **Actividad:** mover a un panel secundario (opción del menú). Mapear `entry.action` a texto español con `i18n` (`created` → "creó la tarea", `completed`, `moved`, `updated`).
- **Espaciado y tipografía:** padding horizontal 20px, separación vertical entre bloques 16px, radio de popovers 12px, sombra `0 8px 24px rgba(0,0,0,.12)`, texto 14px, secundarios 13px `--ink-3`.
- **Guardado:** autoguardado al perder foco con indicador discreto "Guardado" (ya existe `saved`); no mostrarlo como línea suelta arriba (`.page-toolbar`).
- **Responsive:** ≥1200px panel fijo a la derecha; 700-1199px modal lateral con fondo atenuado (ya funciona); <700px pantalla completa con flecha atrás.
**Archivos:** `features/tasks/TaskDetail.tsx` (749 líneas: dividir en `DetailHeader`, `DetailBody`, `DetailFooter`, `DetailMenu`), `components/ui.css` (`.detail-panel`, L794-845), `shell/shell.css` (`.detail`, L247-260; hay duplicado en `styles.css` L398: unificar en un solo bloque), nuevos `components/DatePopover.tsx`, `components/PriorityMenu.tsx`, `components/TagPicker.tsx`, `components/Popover.tsx` (base con cierre en Esc y clic fuera).

## 4. Hábitos de hoy sin hábitos (P0)

**Actual:** solo aparece el título "Hábitos de hoy" y debajo nada (`TTD-1`, final de la lista).
**Esperado:** si hay hábitos, mostrarlos como un grupo más al final ("Hábitos", contador, filas con icono del hábito, progreso `0/1` y hora si tiene). Si no hay, mostrar una tarjeta tranquila.

### Wireframe del estado vacío
```
┌──────────────────────────────────────────────┐
│  🌱                                          │
│  Hoy no tienes hábitos                       │  16px/600
│  Sin prisa. Un hábito pequeño puede ser      │  14px ink-2
│  el primero: beber agua, leer 10 minutos     │
│  o dar un paseo.                             │
│                                              │
│  [ Beber agua ] [ Leer ] [ Pasear ]          │  chips de sugerencia (de HABIT_SUGGESTIONS)
│  [ + Crear un hábito ]   (botón primario)    │
│  Ahora no  (enlace, oculta 7 días)           │
└──────────────────────────────────────────────┘
```
**Cómo arreglarlo:**
- Nuevo componente `features/habits/components/HabitsEmpty.tsx`; usar `HABIT_SUGGESTIONS` de `features/habits/suggestions.ts` para los chips (crean el hábito con un clic, con toast "Hábito creado" y deshacer).
- `TodayPage.tsx`: render condicional: `habits.isPending` → 2 esqueletos; vacío → `<HabitsEmpty />`; con datos → grupo "Hábitos" con `habit-check` circular y barra de progreso.
- Estilo: tarjeta `--surface-2`, radio 12px, padding 20px, sin borde fuerte, icono 28px; botón principal `--accent`.
- Textos nuevos en i18n: `habitsEmptyTitle` ("Hoy no tienes hábitos"), `habitsEmptyBody` ("Sin prisa. Un hábito pequeño puede ser el primero."), `habitsEmptyCta` ("Crear un hábito"), `habitsEmptyDismiss` ("Ahora no").
- Persistir "Ahora no" en `localStorage` (`tick-tack-done.habits.dismissed`, 7 días).

## 5. Quick-add (P1)

**Esperado:** placeholder `Añadir tarea a "Bandeja"` (nombra la lista destino); al escribir, resaltar en el propio texto lo que se interpreta (fecha, hora, prioridad, #etiqueta, lista) y mostrar un chip a la derecha con el resultado ("Hoy, 18:00"). Enter crea y mantiene el foco; Esc limpia; las herramientas (fecha, prioridad, lista) se ven al enfocar.
**Actual:** `<input>` plano; `quickAddRequest` parsea ("hoy 18:00 !alta" funciona: la tarea quedó con prioridad Alta, fecha de hoy 18:00 y título limpio) pero el usuario no ve el parseo hasta después. Solo se ve un icono de calendario y un chevron (`QuickAddTools.tsx`, 80 líneas).
**Cómo arreglarlo:**
- `TodayPage.tsx` `addTask`: calcular `quickAddRequest` en cada cambio (memo) y pasar `preview` a `QuickAddTools` para pintar chips: fecha/hora (acento), prioridad (color), etiquetas (color de etiqueta).
- Resaltado en línea: sustituir el `<input>` por un `contenteditable` o capa espejo (`<div aria-hidden>` detrás del input con `<mark>` por token). Alternativa más simple y suficiente: solo chips.
- Popovers de fecha y prioridad: reutilizar `DatePopover` y `PriorityMenu` (punto 3).
- Placeholder dinámico con nombre de la lista actual; si la vista es Hoy, el destino es Bandeja y la fecha por defecto es hoy.
- Accesibilidad: `aria-describedby` con el resumen del parseo.

## 6. Fila de tarea (anatomía y layout) (P1)

**Actual:** `.task-row` en `today.css` L67 es `grid: auto minmax(0,1fr) minmax(0,42%) auto`, altura `--row-h` (40px), 8px de padding. Con el panel abierto la columna meta se reduce y "Bandeja" se corta en "B" (`TTD-3`). Hay reglas `.task-row`/`.task-meta` duplicadas en `ui.css` L754-790.
**Esperado:**
- Orden de elementos: [grip al hover] [checkbox con color de prioridad] [título] [chips de etiqueta] [nombre de lista] [icono recordatorio/repetición/descripción] [hora o fecha] [⋯ al hover].
- Título con elipsis, prioridad máxima de espacio; meta con `flex: 0 0 auto` y el título se encoge, no al revés.
- Etiquetas: máximo 2 chips y `+N`; nombre de lista gris 12px con máximo 14ch y elipsis.
- Iconos pequeños (14px, gris) para: descripción, checklist `1/3`, repetición, adjuntos, comentarios.
- Hover: fondo `--surface-2`, grip a la izquierda, `⋯` a la derecha; seleccionado: `--accent-soft`.
- Tareas de calendario externo (si existen): icono de calendario y origen en gris.
**Cómo arreglarlo:** eliminar duplicados de `ui.css` (dejar una sola definición en `today.css`), cambiar a `display:flex` con `min-width:0` en título y `flex-shrink:0` en meta, añadir iconos desde lucide en `TaskGroup`. Añadir contador de subtareas y marca de descripción (requiere `checklistTotal/checklistDone`/`hasContent` en `TodayTask`).

## 7. Completar, deshacer y toasts (P1)

- **Esperado:** al marcar, el checkbox se rellena con una animación corta (150-200ms, check con trazo), el título se tacha, la fila se desvanece y colapsa en 250ms; toast "Tarea completada · Deshacer" abajo-centro, 4s, apilable.
- **Actual:** la fila desaparece al instante (sin animación) y el toast "Completada: …" aparece abajo-izquierda **encima del pie del sidebar** (tapa "Papelera"). Además hay otro estilo de toast (oscuro, abajo-derecha, "Tarea movida a la papelera · Deshacer"): dos componentes distintos (`UndoToast.tsx` + `toast.css` vs `action-toast` en `ui.css` L713).
- **Fix:** unificar en un único `Toast` (oscuro, abajo-centro, 4s, acción a la derecha). Animar en `PriorityCheck.tsx` (CSS keyframes en `ui.css`) y retrasar `hidden` 250ms en `TodayPage.complete`. Respetar `prefers-reduced-motion`. Ctrl/Cmd+Z ya deshace: mostrar el atajo en el toast.

## 8. Cabeceras de grupo y espaciado (P1)

`TaskGroup` usa `<details>` con `<summary>` sin chevron; "Alta" queda pegada a la última fila anterior (`TTD-3`). Fix: `margin-top: 16px` en `.task-group`, chevron lucide que rota con `[open]`, contador a la derecha del título, cabecera pegajosa (`position: sticky; top: 0`) con fondo `--bg`.

## 9. Plan de hoy (P2)
Hoy es una tarjeta con borde y texto fijo "Cuando haya una propuesta…". Si no hay plan: colapsar a una sola línea discreta con enlace "Planificar mi día" (lleva a `/review`). Si hay plan: tarjeta con 3-5 tareas sugeridas, botón "Aceptar plan".

## 10. Atajos, selección múltiple, menú contextual y drag & drop (revisar)
- **Atajos existentes** (`shell/shortcuts.ts`): `N`, `?`, `Ctrl/Cmd+K`, `/`, `G T`… Faltan sobre la lista: `↑/↓` mover foco entre filas, `Enter` abrir detalle, `Espacio` completar, `P` prioridad, `D` fecha, `Supr` borrar, `X` seleccionar, `Shift+clic` rango, `Ctrl/Cmd+clic` selección múltiple (barra de acciones en lote: ya hay `.task-row.is-batch` en `ui.css` L759, comprobar que se activa en Hoy).
- **Menú contextual:** clic derecho sobre fila → Fecha (atajos con iconos), Prioridad (4 banderas), Añadir subtarea, Fijar, Mover a…, Etiquetas, Iniciar foco, Duplicar, Copiar enlace, Convertir en nota, Borrar. Hoy no existe.
- **Drag & drop:** `task-grip` solo en orden manual. Permitir arrastrar entre grupos de prioridad (cambia prioridad) y a la barra lateral (mueve de lista o cambia fecha en Hoy/Mañana).
- No verificado en esta pasada: atajos reales de la referencia y su comportamiento exacto; validar con prueba manual tras implementar.

## 11. Estados de carga, vacío, error y rendimiento
- Carga: ya hay `task-skeleton` (3 filas). Añadir esqueleto también para cabecera de grupo y para hábitos.
- Vacío total (`todayEmpty` en `es.ts` L110): "Despejado. Captura lo próximo con N o revisa tu Inbox." Mejorar con ilustración sencilla, título "Día despejado", cuerpo corto y botón "Añadir tarea".
- Error: `todayFailed` con botón Reintentar (existe).
- Rendimiento observado: primera pintura con esqueleto ~3s en el navegador remoto; la carga hace dos consultas paginadas (`loadTodayTasks`, `board.ts`). Con 54 vencidas no hay virtualización; considerar `@tanstack/react-virtual` si superan ~200 filas.

## 12. Responsive y tema
- **Móvil (390px):** lista correcta con filas de 2 líneas y barra inferior (Hoy, Calendario, +, Listas, Más). Problemas: la última fila queda tapada por la barra (añadir `padding-bottom: calc(64px + env(safe-area-inset-bottom))` a `.today`); el detalle abre pantalla completa pero con los mismos controles nativos (aplicar punto 3); el título de 20px se corta en la cabecera del panel.
- **Tablet/960px:** el panel de detalle se abre como modal lateral con fondo atenuado: correcto.
- **Tema oscuro:** existen tokens en `styles/tokens.css` (L109-112). No se auditó visualmente en esta pasada: revisar contraste de chips de etiqueta (fondo pastel con texto oscuro) y de `--accent-soft` en oscuro.

---

## Orden de implementación (checklist)
1. [ ] Punto 2: orden de grupos (cambio pequeño, alto impacto) + tests en `groups.spec.ts`.
2. [ ] Punto 1: hora visible y orden por hora + tests.
3. [ ] Punto 4: estado vacío de hábitos + grupo Hábitos.
4. [ ] Punto 6 y 8: layout de fila y cabecera de grupo (limpiar CSS duplicado).
5. [ ] Punto 3: componentes `Popover`, `DatePopover`, `PriorityMenu`, `TagPicker` y rediseño del panel.
6. [ ] Punto 5: preview de parseo en quick-add.
7. [ ] Punto 7: animación de completar y toast único.
8. [ ] Punto 10: atajos, contextual, selección múltiple.
9. [ ] Puntos 9, 11, 12: plan de hoy, vacíos, móvil.

## Verificación
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- Manual (datos con prefijo `ZZ TEST`, borrar al terminar): crear "ZZ TEST reunión hoy 18:00 !alta" → debe verse en el grupo Alta con "18:00"; con 54 vencidas, el primer grupo visible es Alta; Hábitos sin datos muestra la tarjeta; el panel de detalle no usa `<select>` nativos (`rg "<select" apps/web/src/features/tasks/TaskDetail.tsx` solo en campos ocultos accesibles).
- Visual: comparar capturas antes/después a 1280px, 960px y 390px.
