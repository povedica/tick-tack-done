---
title: 'tick-tack-done — TTD-AUD-74: creación rápida en el calendario'
---

# tick-tack-done — TTD-AUD-74: creación rápida al hacer clic en un hueco del calendario

- **Aplicación:** https://todo.reflexionia.com
- **Repositorio:** https://github.com/povedica/tick-tack-done (base del análisis: commit `11ca2cb`, 21/10/2026 15:07 hora de Madrid)
- **Fecha:** 21/10/2026 (hora de Madrid)
- **Documento autónomo:** contiene todo lo necesario para implementar este hallazgo sin la especificación general. Los demás hallazgos de la auditoría ya están implementados.
- **Rutas de código:** `web/` = `apps/web/src/`, `api/` = `apps/api/src/`, `domain/` = `packages/domain/src/`. Las líneas citadas son del commit `11ca2cb` y pueden haberse desplazado.
- **Severidad:** Alta · **Área:** Calendario

## 0. Instrucciones para Codex

1. **Objetivo:** en las vistas Día, Semana, Varios días y Mes del calendario, un clic (o un arrastre) en un hueco vacío abre una tarjeta flotante de creación rápida, prellenada con la fecha y la hora del hueco, como en TickTick.
2. **Stack:** monorepo pnpm.
   - `apps/web`: React 19, Vite, react-router 7, TanStack Query, zustand, `tokens.css`, i18n en `es`/`en`.
   - `apps/api`: NestJS, Prisma y Redis.
   - Paquetes compartidos: `packages/domain` (parser de captura rápida `parseQuickAdd`) y `packages/sdk`.
3. **Reglas:**
   - Trabaja en una rama y abre **una PR** con el título `fix(TTD-AUD-74): quick-add popover in calendar`. Si el arrastre de rango en Mes complica la PR, deja esa parte para una segunda PR.
   - Usa solo tokens de `tokens.css` y añade los textos nuevos a los dos idiomas (`es` y `en`).
   - No cambies el contrato de la API. Usa los campos que ya existen: `start_date`, `due_date`, `is_all_day`, `duration_minutes`, `time_zone`, `project_id` y `raw_text`.
   - Añade tests unitarios, de componente y Playwright según la sección «Criterios de aceptación».
   - Al terminar, ejecuta `pnpm -r lint`, `pnpm -r typecheck` y `pnpm -r test`, y los e2e de calendario.
   - Si existe `docs/audit/ESTADO.md`, anota allí el estado de TTD-AUD-74.
4. **Verificación final:** recorre los criterios de aceptación uno a uno e indica en la descripción de la PR cuáles has comprobado y cómo.

## TTD-AUD-74 — Calendario: no hay creación rápida al hacer clic en un hueco vacío (popover flotante tipo TickTick)

- **Severidad:** Alta
- **Pantalla/URL:** `/calendar/day`, `/calendar/week`, `/calendar/multi-day`, `/calendar/month` (y `/calendar/multi-week`)
- **Elemento:** huecos horarios de `HourGrid`, celdas de `DayGrid` (mes), nuevo `QuickAddPopover`
- **Estado:** Abierto
- **Depende de:** nada pendiente. Reutiliza el composer y el `Popover` de TTD-AUD-64 y la lógica de fechas de TTD-AUD-55/56, que ya están implementados (ver «Contexto»).

### Pasos para reproducir

1. Abre `/calendar/week` (y luego `/calendar/day` y `/calendar/month`).
2. Haz un solo clic en un hueco vacío (por ejemplo, el sábado a las 13:35) o en una celda vacía del mes.

### Resultado esperado (comportamiento de TickTick, observado el 21/10/2026 en solo lectura)

- **Apertura:** un solo clic en un hueco vacío abre una **tarjeta flotante** de unos 267×200 px, anclada al punto del clic y recolocada para no salirse de la pantalla:
  - en Semana, junto al borde derecho se abre arriba a la izquierda;
  - en Día, debajo del bloque fantasma;
  - en Mes, al lado de la celda.
- **Día y Semana — bloque fantasma:**
  - aparece en el hueco pulsado, con la hora, ajustado a la franja de 30 min (clic a las 16:35 → 16:30; sábado 13:35 → «Sat, Oct 24, 13:30»);
  - desaparece al descartar.
- **Mes:**
  - la celda se resalta y la fecha es de día completo, sin hora;
  - las fechas pasadas se muestran en rojo («12 days ago, Oct 9»).
- **Contenido de la tarjeta, de arriba abajo:**
  1. chip de fecha con icono de calendario, prellenado desde el hueco;
  2. bandera de prioridad arriba a la derecha;
  3. título grande «What would you like to do?»;
  4. descripción «Write something or type / for commands»;
  5. chips de etiqueta (con la etiqueta por defecto) y «+»;
  6. abajo a la izquierda, chip de lista («inbox»);
  7. abajo a la derecha, menú «…» (More).
- **Sin conmutador tarea/evento** visible en la tarjeta.
- **Cierre en TickTick:** Escape **no** la cierra; hacer clic fuera la cierra y descarta el borrador.
- **Recomendación para ttd:**
  - Escape cierra;
  - clic fuera descarta el borrador si está vacío y, si no, pide confirmación o lo conserva;
  - Enter guarda.
- **No probado:** vistas Agenda, Año y Varios días, y arrastrar para seleccionar un rango.

### Resultado actual (ttd, mismo día)

- El calendario tiene Día, Semana, Mes, Agenda y Más.
- Hacer clic en celdas o huecos vacíos de Mes, Semana y Día **no hace nada**: ni popover, ni navegación, ni bloque fantasma.
- La única entrada es el botón «+» de la barra, que abre el modal completo de nueva tarea.

### Evidencia

<div class="pair"><figure><img src="evidencias/TTD-AUD-74_d.jpg"><figcaption>ttd — Semana tras hacer clic en un hueco: no pasa nada</figcaption></figure><figure><img src="evidencias/REF-TICKTICK_81_cal_week_popover.jpg"><figcaption>TickTick — Semana: bloque fantasma (sábado 13:30) y tarjeta recolocada arriba a la izquierda</figcaption></figure></div>

<div class="pair"><figure><img src="evidencias/TTD-AUD-74_f.jpg"><figcaption>ttd — Día tras hacer clic: no pasa nada</figcaption></figure><figure><img src="evidencias/REF-TICKTICK_82_cal_day_popover.jpg"><figcaption>TickTick — Día: bloque fantasma 16:30 y tarjeta debajo</figcaption></figure></div>

<div class="pair"><figure><img src="evidencias/TTD-AUD-74_b.jpg"><figcaption>ttd — Mes tras hacer clic en una celda vacía</figcaption></figure><figure><img src="evidencias/REF-TICKTICK_80_cal_month_popover.jpg"><figcaption>TickTick — Mes: celda resaltada, fecha de día completo (pasada, en rojo)</figcaption></figure></div>

<div class="pair"><figure><img src="evidencias/REF-TICKTICK_82b_cal_day_popover_priority_tooltip.jpg"><figcaption>TickTick — bandera de prioridad (tooltip «Priority»)</figcaption></figure><figure><img src="evidencias/REF-TICKTICK_82c_cal_day_popover_more_tooltip.jpg"><figcaption>TickTick — menú «…» (tooltip «More»)</figcaption></figure></div>

- Capturas «antes» en el zip, sin incrustar:
  - ttd: `TTD-AUD-74_a` (Mes), `_c` (Semana), `_e` (Día);
  - TickTick: `REF-TICKTICK_77_cal_month_before`, `_78_cal_week_before`, `_79_cal_day_before`.

### Causa en el código (confianza Alta)

- **Día, Semana y Varios días:**
  - `HourGrid` (`web/features/places/HourGrid.tsx:20-282`) pinta cada día como `<section className="hour-col">` (`:226-230`), con las líneas de hora como `<i>`, sin `onClick`, `onPointerDown` ni ningún manejador de huecos. Solo los bloques de tareas y eventos tienen `onClick` (`:166` y `:262`).
  - La fila «Todo el día» (`.hour-allday-cell`, `:131`) no tiene manejador propio en la celda: el `onClick` de `:166` es de los chips de día completo.
  - `HourGrid` no recibe ninguna callback de creación desde `CalendarPage` (`web/features/places/Places.tsx:678-686`).
- **Mes y Varias semanas:**
  - `DayGrid` (`Places.tsx:769`) pinta `<div className="cal-cell" data-day=…>` (`:930-944`).
  - Solo el número del día es interactivo: el botón `onPick` (`:948-958`), que cambia `picked` y abre el resumen del día, o un `Link`.
  - El resto de la celda no tiene manejador.
- **Única entrada:** el «+» de la barra (`Places.tsx:553-559`) llama a `openTaskComposer()` (`web/features/capture/notice.ts:79-87`). Esa función solo acepta `text`: no puede prellenar fecha, hora ni duración.
- **Sin fecha ni hora desde la vista:** `quickAddRequest` (`web/features/capture/quick-add.ts:25-56`) solo admite `viewDay: 'today' | 'tomorrow'`, de día completo. No hay forma de pasar un hueco con hora ni una duración.
- **Sin posicionamiento flotante:** no hay librería de posicionamiento (`apps/web/package.json` no incluye `@floating-ui/*`). `Popover` (`web/components/Popover.tsx:13`, cálculo en `:36-38` con ancho fijo 260/320 px) solo se ancla a un elemento, no a un punto, y no se recoloca horizontalmente. Si la corrección de TTD-AUD-64 ya cambió este archivo, parte de su estado actual.
- **Nota relacionada:** `HourGrid` coloca las tareas con hora usando `due_date` como inicio (`:194-197`), sin `start_date`. Cualquier tarea creada con inicio y fin desde un hueco debe verse en su sitio. Hay que alinearlo con la fecha efectiva (`start_date ?? due_date`) que ya usa el resto de la app desde TTD-AUD-01.

### Propuesta de corrección

1. **Componente reutilizable `QuickAddPopover`** (`web/features/capture/components/QuickAddPopover.tsx`):
   - Props: `anchor` (`{ x, y }` o `DOMRect` virtual), `slot` (`{ start: string; end?: string; allDay: boolean; timeZone: string }`), `defaultProjectId`, `onCreated`, `onClose` y `onExpand(draft)`.
   - Posicionamiento con `@floating-ui/react` (`offset(8)`, `flip()`, `shift({ padding: 8 })`, `autoUpdate`), sobre un elemento de referencia virtual en el punto del clic. Así se ve en Semana (arriba a la izquierda junto al borde derecho), Día (debajo) y Mes (al lado de la celda).
   - Contenido (mismos tokens y composición que la tarjeta de «Nueva tarea» de TTD-AUD-64):
     - chip de fecha (abre `DatePopover`, con las pestañas Fecha y Duración) y bandera de prioridad;
     - título «¿Qué quieres hacer?» y descripción;
     - chips de etiquetas e interpretación;
     - pie con chip de lista y «…» (Etiquetas, Adjuntos, Añadir desde plantilla, Convertir en nota, **Más opciones**).
   - **Parser:** reutiliza `quickAddRequest` ampliado con `viewSlot` (ver el punto 3). El texto con `#etiqueta`, `!prioridad`, `^lista` o una fecha explícita **gana** al hueco; el chip de fecha y la vista previa resaltada (`textSegments`) se actualizan en vivo.
   - **Lista por defecto:** la del contexto (filtro de lista activo en la barra del calendario o lista seleccionada) y, si no hay, Bandeja.
2. **Prellenado desde el hueco:**
   - **Día, Semana y Varios días:**
     - `start_date` = hora del clic ajustada **hacia abajo** a 30 min, en la zona del usuario: `snapToSlot(minutes, 30)`, con 16:35 → 16:30;
     - `due_date` = inicio + 30 min, `duration_minutes` = 30, `is_all_day = false`, `time_zone` = zona del usuario.
     - Un clic en la fila «Todo el día» crea una tarea de día completo de ese día.
   - **Mes y Varias semanas:** `due_date` = día (medianoche local de la zona del usuario, **no** UTC), `is_all_day = true` y sin hora.
     - Fechas pasadas: el chip se muestra en `--danger` («hace 12 días, 9 oct»), como en TickTick.
   - El cálculo de instantes usa `zonedWallTime` (ya existe en `web/features/today/groups.ts:306`), nunca `new Date('YYYY-MM-DD')`. Así no se reintroducen los bugs ya corregidos TTD-AUD-55 y TTD-AUD-56: hay que enviar `start_date`, `due_date` **y** `duration_minutes` coherentes.
3. **`quickAddRequest`:** añadir `viewSlot?: { start: string; end: string | null; allDay: boolean }`. Si el texto no trae fecha, el cuerpo lleva `start_date`, `due_date`, `is_all_day`, `duration_minutes` y `time_zone` del hueco. Si trae fecha, se usa la del texto.
4. **Bloque fantasma** (`.hour-ghost`, en `HourGrid`):
   - bloque semitransparente con el borde de acento en el hueco, con la etiqueta de la hora («13:30» o «13:30–14:00»);
   - se mantiene mientras el popover está abierto y se quita al cerrar o crear;
   - en Mes, `.cal-cell.is-drafting` resalta la celda.
5. **Arrastrar para seleccionar un rango (Día y Semana):**
   - `pointerdown` en un hueco vacío más un desplazamiento de 6 px o más inicia la selección; el fantasma crece en pasos de 30 min y `pointerup` abre el popover con inicio, fin y duración;
   - un clic simple usa 30 min;
   - un rango que cruza la medianoche dentro de Semana se limita al día de inicio (o se marca para más adelante).
   - En Mes, arrastrar varias celdas produce un rango de días completos con `start_date` y `due_date` (opcional; puede quedar para una segunda PR).
6. **Manejadores:**
   - En `HourGrid`, `onPointerDown`/`onClick` en `.hour-col` y en `.hour-allday-cell`, ignorando los clics que vienen de `.hour-block`, de enlaces o de botones (`event.target.closest(...)`).
   - Conversión `y → minutos`: `(offsetY / HOUR_PX) * 60 + GRID_START_HOUR * 60`, usando `getBoundingClientRect()` de la columna (ya tiene `position: relative`).
   - En `DayGrid`, `onClick` en `.cal-cell`, ignorando el botón del número del día, los chips y «+N más».
   - Nueva prop `onCreateAt(slot, anchor)` en `HourGrid` y `DayGrid`; `CalendarPage` tiene el estado `draft` y renderiza un único `QuickAddPopover`.
7. **Teclado:**
   - Enter guarda (Mayús+Enter añade una línea en la descripción); Escape cierra y descarta;
   - Tab recorre título, descripción, fecha, prioridad, lista, etiquetas, «…» y «Añadir»;
   - al cerrar, el foco vuelve a la celda o el hueco.
   - Las celdas del mes y los huecos horarios deben poder enfocarse (`tabindex="0"`, `role="gridcell"`/`button`, con `aria-label` «Crear tarea el sábado 24 de octubre a las 13:30»). Enter o Espacio abren el popover.
8. **Clic fuera:** si el borrador está vacío, se descarta; si tiene texto, se conserva (el popover se mantiene) o se pide confirmación. No se pierde texto en silencio, a diferencia de TickTick.
9. **«Más opciones»:** abre el modal completo de nueva tarea (TTD-AUD-64) con **todos** los campos del borrador: título, descripción, fecha, hora, duración, prioridad, lista, etiquetas y adjuntos. Para ello, `openTaskComposer` acepta un `draft` en lugar de solo `text` (`useCaptureOpen.show(draft)`).
10. **Móvil (639 px o menos):** tocar un hueco o un día abre el mismo formulario como **hoja inferior** (sin popover anclado), con el fantasma visible encima. Mantener pulsado y arrastrar selecciona un rango en Día y Semana. La hoja respeta `safe-area-inset-bottom`.
11. **Accesibilidad:**
    - el popover es `role="dialog"` con `aria-modal="false"`, `aria-labelledby` y trampa de foco ligera;
    - anuncio con `aria-live` al crear («Tarea creada: … sábado 24 oct, 13:30»);
    - contraste del fantasma con tokens (`--accent-soft` y borde `--accent`).
12. **Estilos:** solo tokens de `tokens.css`. Nuevos tokens si hace falta: `--ghost-bg`, `--ghost-border` y `--popover-w: 17rem`.

### Criterios de aceptación

- **Semana:** un clic simple en el sábado a las 13:35 muestra el fantasma «13:30» y abre la tarjeta con el chip «sáb 24 oct, 13:30». Al escribir «Comprar pan» y pulsar Enter se crea la tarea:
  - `start_date` = 24/10 13:30 en Europe/Madrid (11:30Z) y `due_date` = 14:00 en Madrid;
  - `duration_minutes` = 30, `is_all_day = false`;
  - aparece en ese hueco sin recargar.
- **Día:** un clic a las 16:35 → «16:30». La tarjeta no se sale de la pantalla en los cuatro bordes (prueba en las esquinas).
- **Mes:** un clic en una celda vacía crea una tarea de día completo de ese día; un día pasado muestra el chip en rojo.
- **Parser:** con «Llamar a Ana #trabajo !alta ^casa mañana 10:00» en un hueco del jueves se crea con etiqueta trabajo, prioridad alta, lista casa y fecha de mañana a las 10:00: el texto gana al hueco.
- **Lista de contexto:** con una lista filtrada en el calendario, la tarea se crea en esa lista.
- **Rango:** arrastrar de 09:00 a 10:30 en Semana crea una tarea con inicio 09:00, fin 10:30 y 90 min.
- **Teclado:** Escape cierra sin crear y quita el fantasma; Enter crea; Tab recorre todos los controles; el foco vuelve a la celda.
- **Clic fuera:** con el borrador vacío no deja rastro; con texto no lo pierde sin avisar.
- **«Más opciones»:** abre el modal completo con los mismos valores.
- **Móvil (390×844, emulación):** tocar un hueco abre la hoja inferior con la fecha y hora correctas.
- **Tests:**
  - unitarios en `domain`/`web` para `snapToSlot`, `slotFromPoint` (y → minutos), `slotToTaskBody` (hora/día completo, zona, DST, el 25/10/2026 con cambio de hora en Madrid) y `quickAddRequest` con `viewSlot` (texto con fecha frente a sin fecha);
  - de componente para `QuickAddPopover` (render, Enter, Escape, foco y «Más opciones»);
  - **Playwright** (`apps/web/e2e/calendar-quick-add.spec.ts`): clic en un hueco de Semana, Día y Mes; arrastrar un rango; borde derecho (flip); viewport móvil (hoja). El API se intercepta para comprobar los cuerpos enviados.

### Relación con otros hallazgos (solo contexto)

- **TTD-AUD-64 (modal «Nueva tarea», ya implementado):** reutiliza su núcleo de composer (título, chips, parser y pie con lista y «…»). Si no está factorizado, extrae `ComposerCore` y úsalo en el modal y en `QuickAddPopover`, sin cambiar el comportamiento del modal. El modal es el destino de «Más opciones».
- **TTD-AUD-55 y TTD-AUD-56 (fechas sin hora guardadas como 00:00 UTC y duración sobrescrita; ya corregidos):** esta función crea muchas tareas con hora y duración. Verifica que no hay regresión: los instantes se envían con zona, nunca como `YYYY-MM-DD` interpretado como UTC, y la duración explícita no se recalcula a partir de inicio y fin.
- **TTD-AUD-01 (fecha efectiva, ya corregido):** `HourGrid` debe colocar la tarea según `start_date ?? due_date` y su duración.
- **TTD-AUD-61 y TTD-AUD-71 (barra lateral del calendario y móvil):** los filtros de lista del calendario dan la lista de contexto. En móvil, este flujo complementa el resumen del día.

**Referencia TickTick:** capturas REF-TICKTICK_77 a _82c, observadas el 21/10/2026.

## Prompt para Codex (listo para pegar)

```text
Implementa el hallazgo TTD-AUD-74 de tick-tack-done siguiendo docs/audit/ttd-codex-calendario-quick-add.md (copia en docs/audit/evidencias/ las capturas del zip si aún no están).

Resumen: en el calendario (Día, Semana, Varios días y Mes), un clic en un hueco vacío no hace nada. Hay que añadir creación rápida tipo TickTick:
- QuickAddPopover reutilizable, anclado al punto del clic con flip/shift (@floating-ui/react);
- bloque fantasma ajustado a 30 min y duración por defecto de 30 min en Día/Semana, y día completo en Mes;
- arrastrar para seleccionar un rango en Día/Semana;
- parser de captura rápida (#etiqueta !prioridad ^lista y fechas; el texto gana al hueco) y lista por defecto del contexto;
- Enter guarda, Escape cierra, Tab recorre los controles, «Más opciones» abre el modal completo con los campos;
- en móvil, hoja inferior;
- accesibilidad completa.

Archivos principales: apps/web/src/features/places/HourGrid.tsx, apps/web/src/features/places/Places.tsx (DayGrid y CalendarPage), apps/web/src/features/capture/quick-add.ts, apps/web/src/features/capture/notice.ts y apps/web/src/components/Popover.tsx.

TTD-AUD-55/56 (fechas y duración) y TTD-AUD-64 (modal de nueva tarea) ya están implementados: reutilízalos y comprueba que no hay regresión (instantes con zona Europe/Madrid, duración explícita respetada).

Abre una sola PR «fix(TTD-AUD-74): quick-add popover in calendar», con tests unitarios, de componente y Playwright (apps/web/e2e/calendar-quick-add.spec.ts), y verifica en la PR cada criterio de aceptación del documento. No cambies el contrato de la API.
```
