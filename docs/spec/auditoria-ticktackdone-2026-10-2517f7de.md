# Auditoría profunda tick-tack-done (UI, móvil, calendario) — 19 oct 2026

**Alcance:** https://todo.reflexionia.com/ probado a mano en escritorio (1440px) y móvil (390x844), con comparativa directa contra TickTick (referencia de comportamiento). Causa raíz localizada en el repo `povedica/tick-tack-done`.
**Commit auditado:** `26a02b2` (main, PR #45 google-calendar-sync). Verificado que el despliegue coincide vía `/api/v1/health`.
**Datos de prueba:** solo tareas "ZZ TEST", borradas al terminar. Ninguna tarea real tocada. TickTick solo consultado, sin editar nada.
**Estado Telegram:** la captura/parseo desde Telegram ya funciona (confirmado por Pablo) y Pomodoro → Telegram verificado OK (ver sección final). No se re-audita.

Cada punto sigue el formato: qué es, resultado actual, resultado esperado, cómo arreglarlo (archivo + cambio). Ordenado por prioridad para ir pasándoselo a Cursor de uno en uno.

---

## P0 — Bugs que rompen el uso diario

### 1. El menú de tres puntos de una tarea nunca se cierra

**Qué es:** el menú contextual de cada tarea (los tres puntos en Hoy / Bandeja / listas).

**Resultado actual:** una vez abierto no se cierra de ninguna forma: ni con Escape, ni pulsando fuera, ni abriendo otro control. Reproducido 3 veces en vivo: el div `.task-context` sigue en el DOM tras Escape, mousedown fuera y clics en otros botones. Solo se cierra eligiendo una acción o recargando.

**Resultado esperado:** como en TickTick: Escape cierra, clic fuera cierra, y abrir otro menú cierra el anterior.

**Cómo arreglarlo:** el menú no usa el componente `Popover` (que ya tiene cierre por Escape y por clic fuera).
- `apps/web/src/features/today/TaskContextMenu.tsx`: devuelve un `<div className="popover popover-menu task-context" role="menu" style={{left, top}}>` pelado, sin listeners.
- `apps/web/src/components/Popover.tsx` (L33, L48): ya implementa `Escape` y `document.addEventListener('mousedown', ...)` con cierre al clicar fuera.

Dos opciones, la primera es la recomendada:
1. Envolver `TaskContextMenu` con `Popover` (anclado por coordenadas x/y) y pasar `onClose`.
2. Si se quiere mantener el div fijo, añadir en `TaskContextMenu` un `useEffect` equivalente al de Popover:

```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
  const onDown = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.task-context')) onClose();
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('mousedown', onDown);
  return () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('mousedown', onDown);
  };
}, [onClose]);
```

Ojo: `TodayPage.tsx` (~L885) hoy solo cierra vía `onClose` desde las acciones del menú; con el parche hay que asegurarse de que `onClose` también limpia el estado que posiciona el menú.

Mismo patrón afecta al panel "Más" de la barra inferior móvil (ver punto 7).

---

### 2. El editor del detalle de tarea corta el texto a mitad de línea

**Qué es:** la caja de contenido/nota dentro del detalle de tarea (el bug de la captura que enviaste, con la frase cortada a media línea).

**Resultado actual:** `apps/web/src/features/tasks/DetailBody.tsx` usa un `<textarea className="detail-content" rows={3}>` (L146-155) que solo crece en `onInput` mediante `fit()` (L377). Al recargar o abrir una tarea que ya tiene texto largo, el textarea queda en 3 filas: el texto se corta a mitad de línea, sin scroll posible (`.detail-content { resize:none; overflow:hidden }` en `apps/web/src/features/today/today.css:1159`). Reproducido en vivo: tras escribir, altura 277px; tras recargar, `clientHeight 96 / scrollHeight 277` → texto oculto. Pasa igual en el detalle a pantalla completa del móvil.

**Resultado esperado:** TickTick usa un editor que crece con el contenido y un panel de detalle con scroll propio a altura completa (medido: contenedor interno con `overflow:auto`, scrollHeight 1721px dentro de un panel de 713px; nada se corta nunca).

**Cómo arreglarlo:**
- En `DetailBody.tsx`, llamar a `fit()` también al montar y cuando cambie el valor:

```tsx
const contentRef = useRef<HTMLTextAreaElement>(null);
useEffect(() => { if (contentRef.current) fit(contentRef.current); }, [task.id, value]);
```

- Alternativa más robusta: quitar el textarea manual y usar un `contentEditable` o un editor tipo CodeMirror como TickTick, pero con el `useEffect` de arriba el bug queda resuelto.
- Además, dar al panel de detalle un contenedor con `overflow-y:auto` y `max-height:100%` para que el contenido largo haga scroll en vez de desaparecer (hoy el propio textarea lo impide al tener `overflow:hidden`).

---

### 3. Móvil: la franja azul y el globo rojo "54" flotan sobre todas las páginas

**Qué es:** en móvil (390x844) la barra azul de iconos de escritorio y su badge rojo de vencidas ("54") aparecen flotando encima del contenido en TODAS las páginas (Hoy, calendario, matriz, foco, countdowns...).

**Resultado actual:** bug de cascada CSS. En `apps/web/src/shell/shell.css`:
- L468 (dentro de `@media (max-width:1023px)`): `.icon-rail { display: none; }`
- L611 (regla base, DESPUÉS en el archivo, misma especificidad): `.icon-rail { display: flex; ... }`

Al ir la regla base después, gana sobre la media query y el rail se pinta en móvil. Verificado en DOM a 390px: `.icon-rail` con `display:flex` y `<span class="rail-badge">54` dentro de `.rail-bell`, tapando contenido.

**Resultado esperado:** en móvil no debe existir la franja azul (la navegación es la bottom bar); ningún badge flotando.

**Cómo arreglarlo:** mover el bloque `@media (max-width:1023px)` al FINAL de `shell.css` (después de la regla base `.icon-rail`), o subir la especificidad en la media query:

```css
@media (max-width: 1023px) {
  .shell .icon-rail { display: none; }
}
```

Una línea arregla el "elemento fantasma con z-index" de todas las páginas móviles.

---

### 4. Reportes: los enlaces de semana no hacen nada

**Qué es:** la página Reportes (`/reports/weekly`) con el botón "Calcular esta semana" y la lista de semanas.

**Resultado actual:** es un botón + una lista `<ul>` de enlaces tipo "2026-10-19" + un párrafo de texto crudo. Confirmado en vivo: al pulsar "2026-10-19" la URL cambia a `/reports/weekly/2026-10-19` pero la página se ve IDÉNTICA. El enlace no aporta nada.

Causa raíz en `apps/web/src/features/product/ProductPages.tsx` L166-201 (`ReportsPage`): la vista solo pinta, para la semana seleccionada, un único párrafo con `current.payload.summary` (que está vacío o es siempre el mismo texto). No hay métricas, gráficos ni detalle por semana.

**Resultado esperado (rediseño, referencia TickTick "Summary"):** cada informe semanal debe mostrar contenido real: tareas completadas vs creadas en la semana, vencidas arrastradas, minutos de foco, hábitos cumplidos, tendencia respecto a la semana anterior. La lista de semanas debería ser un selector lateral o un desplegable, y la semana actual la vista principal con tarjetas y un gráfico sencillo.

**Cómo arreglarlo:**
- Backend: revisar qué guarda `buildWeeklyReport()` en `payload` (si solo hay `summary`, ampliar el payload: `completed`, `created`, `overdue`, `focusMinutes`, `habitsDone`, por día).
- Frontend (`ReportsPage`): renderizar `current.payload` completo en tarjetas (reutilizar `CountCard` de la propia página de Revisión) + una tabla por día. Cuando `week` es `undefined`, mostrar la semana más reciente con su detalle, no solo la lista.

---

### 5. Revisión: solo números, sin forma de actuar

**Qué es:** la página Revisión (`/review/weekly`).

**Resultado actual:** `ReviewPage` en `apps/web/src/features/product/ProductPages.tsx` L203-221 pinta solo 5 tarjetas contador: Propuestas hoy 7, Vencidas 58, Sin fecha 32, Listas en silencio 0, Hábitos en riesgo 2. El texto dice "aplícala cuando quieras" pero no existe ninguna acción que aplicar, ni listas de tareas detrás de cada número, ni enlaces. Además, al cargar se ven 0 durante un instante y luego saltan los números (flash de placeholder).

**Resultado esperado (rediseño):** una revisión estilo "weekly review" de verdad: cada tarjeta clicable que despliega la lista concreta (las 58 vencidas, las 32 sin fecha...), con acciones rápidas por tarea (reprogramar a hoy/mañana, marcar "no haré", completar), y un flujo guiado: vaciar bandeja → revisar vencidas → poner fecha a las sin fecha → elegir las 3 de mañana.

**Cómo arreglarlo:**
- Convertir cada `CountCard` en enlace a la lista filtrada correspondiente (ya existen rutas: `/today?filter=overdue`, `/smart/no-date`, etc.) o desplegar la lista inline debajo de la tarjeta con los mismos componentes de fila de tarea de `TodayPage`.
- Añadir acciones rápidas reutilizando los handlers del menú de tarea (`onDate('today' | 'tomorrow')`, `onWontDo`).
- Evitar el flash de ceros: no renderizar las tarjetas hasta que `query.isSuccess` (o usar los valores anteriores con `placeholderData: keepPreviousData` de react-query).

---

## P1 — Estructura y navegación

### 6. Cuenta atrás: acceso escondido y menú "Más" duplicado y desordenado

**Qué es:** cómo se llega a Cuenta atrás y cómo está montado el submenú "Más/Menos" de la barra lateral.

**Resultado actual:**
- Cuenta atrás NO está en la franja azul de iconos. `apps/web/src/shell/IconRail.tsx` solo tiene: Ajustes(avatar), Hoy, Calendario, Matriz, Foco, Hábitos, Buscar, campana, Ayuda, +, colapsar (L52-93).
- En el submenú "Más" de la sidebar (`apps/web/src/shell/Sidebar.tsx` ~L549-580) aparece Cuenta atrás SOLO si alguna cuenta atrás tiene `showInSidebar` (L125), y el submenú mezcla cosas: duplica entradas que ya están en la franja azul (Calendario, Matriz, Foco, Hábitos, Ajustes), unas con icono y otras sin (Reportes, Revisión, Ajustes), sin orden claro. La etiqueta "Cuenta atrás" además está hardcodeada en español (L574) en vez de usar `messages`.
- En TickTick, Countdown es un icono más de la barra izquierda (verificado: `#countdown` junto a Calendar, Matrix, Focus, Habit) y su página es una parrilla de tarjetas grandes y vistosas.

**Resultado esperado:** Cuenta atrás como icono de la franja azul (como Matriz), siempre accesible. El submenú "Más" solo con lo que NO está en el rail (Jardín, Reportes, Revisión...), todas las entradas con icono y orden coherente.

**Cómo arreglarlo:**
- `IconRail.tsx`: añadir tras Matriz:

```tsx
<NavLink to="/countdowns" aria-label={messages.navCountdowns}>
  <Hourglass size={20} aria-hidden="true" />
</NavLink>
```

(añadir `navCountdowns` a los `messages` de i18n y reutilizar el icono `Hourglass` ya usado en Sidebar).
- `Sidebar.tsx`: quitar del bloque "Más" las entradas duplicadas con el rail (Calendario, Matriz, Foco, Hábitos, Ajustes), dejar Jardín/Reportes/Revisión/Cuenta atrás todas con icono, y mostrar Cuenta atrás siempre (quitar el condicional `showCountdowns` de L125 o invertir su sentido: que `showInSidebar` controle el widget de la sidebar, no el acceso a la página). Cambiar el literal "Cuenta atrás" por `messages.navCountdowns`.
- En la página de countdowns, inspirarse en TickTick: tarjetas grandes con emoji, número grande y fecha; en móvil el título se corta ("Cu...") — dar a la tarjeta `min-height` y permitir 2 líneas de título con `text-overflow` en 2 líneas (`-webkit-line-clamp: 2`).

---

### 7. Barra inferior móvil: se camufla con el fondo, su panel no se cierra y faltan secciones

**Qué es:** la bottom nav del móvil y su hoja "Más".

**Resultado actual:**
1. La barra usa `background: var(--surface)` (`shell.css` ~L559-597), el mismo color del cuerpo de la app: se confunde con el contenido. Pablo lo quiere claramente diferenciada.
2. La hoja "Más" (`apps/web/src/shell/BottomBar.tsx`, `.more-sheet`, L50) solo tiene Buscar, Hábitos, Filtros y Ajustes. NO tiene Matriz, Foco, Cuenta atrás, Jardín, Reportes ni Revisión → en móvil esas secciones son inalcanzables desde la navegación (y con el bug 3 arreglado ya no quedará ni el rail para colarse).
3. La hoja no se cierra al tocar fuera ni con gesto de atrás (mismo patrón del bug 1: no hay listener de outside-click).

**Resultado esperado:** barra con color propio (en TickTick la bottom bar tiene fondo sólido distinto y el icono activo en color de acento); hoja "Más" con TODAS las secciones y cierre al tocar fuera.

**Cómo arreglarlo:**
- `shell.css`: dar a `.bottom-bar` un fondo distinto (p.ej. `var(--surface-2)` o el azul de marca con iconos claros) y un borde superior más marcado:

```css
.bottom-bar { background: var(--surface-2, #1e2430); border-top: 1px solid var(--border); }
```

- `BottomBar.tsx`: añadir a la hoja las rutas que faltan (`/matrix`, `/focus`, `/countdowns`, `/dashboard`, `/reports/weekly`, `/review/weekly`) y el mismo `useEffect` de cierre por fuera/Escape del punto 1 (o reutilizar `components/Popover.tsx`).

---

### 8. Calendario escritorio: solo el mes es usable; día/semana no son calendarios

**Qué es:** las vistas del calendario (`/calendar/:view`: day, week, multi-day, multi-week, month, quarter, year, agenda) en `apps/web/src/features/places/Places.tsx` (`CalendarPage`, ~L526+).

**Resultado actual (todo verificado en vivo con capturas):**
- **Mes:** funciona pero el grid desborda en horizontal: la columna del domingo queda cortada y aparece scrollbar inferior. Los eventos de Google Calendar aparecen como chips de color (bien), pero la celda queda apretada.
- **Día:** no es una vista de calendario: es una lista plana de 2 filas de tareas, sin rejilla horaria y SIN los eventos externos (el evento "Karate Lucas y Lola 18:20-19:40" de ese día no aparece por ningún lado).
- **Semana / Multi-día / Multi-semana:** mismo grid estilo mes cortado en filas, sin eje de horas, columnas recortadas a la derecha y mucho espacio vacío. Sin eventos externos en su franja horaria.
- **Trimestre:** 3 mini-meses apiñados con chips solapados, ilegible.
- **Año:** 12 mini-meses con puntos; aceptable.
- **Agenda:** lista limpia pero solo tareas; los eventos externos no aparecen.
- En TickTick (referencia, capturas tomadas): el mes ocupa todo el ancho con las 7 columnas completas, tareas y eventos mezclados con hora; la semana es una REJILLA HORARIA (13:00-21:00 visible, bloques de color con los eventos de Google: "Ocupado 13:00-15:00", "Karate Lucas y Lola 18:20-19:40", "Batería 19:30-20:30"...) y las tareas con fecha arriba.

**Resultado esperado:** día y semana = rejilla horaria con eventos externos en su bloque y tareas con hora; mes sin overflow; agenda mezclando tareas + eventos.

**Cómo arreglarlo:**
- Mes: quitar el ancho fijo que provoca el overflow (probablemente `grid-template-columns` con `minmax` + gap que suma más del 100% o un `min-width` en el contenedor); usar `grid-template-columns: repeat(7, minmax(0, 1fr))` y `min-width: 0` en las celdas para que los chips hagan ellipsis en vez de ensanchar el grid.
- Día/Semana: crear una vista de rejilla horaria nueva (columnas = días, filas = horas 6:00-24:00). La API de sincronización de Google Calendar (PR #45) ya trae eventos con hora de inicio/fin: pintarlos como bloques posicionados (`top`/`height` calculados de la hora). Las tareas con `due_date` con hora van a su bloque; las de todo el día a una fila superior.
- Agenda: incluir los eventos externos intercalados por hora con las tareas.
- Trimestre: o se quita la vista o se muestran 3 meses sin chips (solo puntos de densidad como la vista año).

---

### 9. Calendario móvil: pestañas en 3 filas y grid desbordado

**Qué es:** la vista calendario en 390px.

**Resultado actual:** el selector de vistas (día/semana/mes/...) se envuelve en 3 filas ocupando media pantalla; el grid de mes desborda en horizontal igual que en escritorio; los chips de las celdas son ilegibles.

**Resultado esperado:** selector de vista en un desplegable o segmented control de una fila (scroll horizontal si hace falta); en móvil, el mes con celdas compactas (puntos en vez de chips) y al tocar un día, lista del día debajo (patrón de TickTick móvil).

**Cómo arreglarlo:** media query en el CSS del calendario: `.cal-views { display:flex; overflow-x:auto; }` con botones de una sola fila; en celdas móvil sustituir chips por puntos de color (`content` por densidad) y añadir un panel inferior con las tareas/eventos del día seleccionado.

---

### 10. Jardín digital: clave técnica visible "next_countdowns" y diseño pobre

**Qué es:** la página Jardín (`/dashboard`).

**Resultado actual:** `DashboardPage` (`ProductPages.tsx` L113-165) pinta tarjetas planas con borde discontinuo. Problemas concretos verificados:
- Se ve la clave cruda del widget **"next_countdowns"** como título de tarjeta: `widgetLabel()` (L63) no tiene traducción para esa clave y devuelve el propio key.
- Estadísticas en crudo: "Creadas 312 · Completadas 214 · Saldo -98", "Foco 132:09" sin formato ni contexto.
- El botón de mostrar/ocultar logros está sin estilos.

**Resultado esperado (rediseño):** el Jardín debería ser la pantalla "bonita" de motivación: planta/jardín que crece con rachas, logros con icono y nombre traducido, widgets con título legible ("Próximas cuentas atrás"), números con formato (2 h 12 min en vez de 132:09).

**Cómo arreglarlo:**
- Inmediato: añadir el caso `next_countdowns` (y revisar el resto de keys) en `widgetLabel()` de `ProductPages.tsx` con su texto traducido en `messages`.
- Rediseño: definir el set de widgets (próximas cuentas atrás, racha de hábitos, foco de la semana, tareas completadas esta semana, logros desbloqueados) con componente de tarjeta con icono + título + valor + tendencia. Formatear minutos con una utilidad tipo `formatDuration` (132:09 → "132 h 9 min" o "5 días 12 h").

---

### 11. Sidebar: "Recordatorios" con campana que lleva a Hoy

**Qué es:** la entrada "Recordatorios" de la barra lateral con icono de campana y badge.

**Resultado actual:** enlaza a `/today` y el badge (54) es el contador de vencidas. No es una página de recordatorios: es un acceso duplicado a Hoy con otro nombre, y la campana sugiere notificaciones.

**Resultado esperado:** o se elimina la entrada, o se renombra a lo que es ("Vencidas") apuntando a una vista de vencidas, o se convierte en una bandeja real de notificaciones/recordatorios próximos.

**Cómo arreglarlo:** en `Sidebar.tsx`, cambiar la etiqueta a "Vencidas" y enlazar a la lista filtrada de vencidas; mantener el badge. La campana del rail (que hoy también enseña vencidas) puede quedar como acceso rápido a lo mismo.

---

## P2 — Menores y verificaciones

### 12. Detalle móvil y otras fricciones móviles

- El detalle de tarea en móvil (pantalla completa) hereda el bug 2 (texto cortado sin scroll).
- Matriz en móvil: los 4 cuadrantes se apilan en listas largas de bullets; mejor tabs por cuadrante o acordeones (se desarrolla en la spec de Eisenhower, documento aparte).
- Cuenta atrás móvil: título de tarjeta cortado ("Cu...") — ver fix en punto 6.

### 13. Pomodoro → Telegram: VERIFICADO OK

`apps/api/src/modules/integrations/focus-telegram.listener.ts` está suscrito a `focusSessionStarted/Finished/Aborted` y envía a Telegram cuando el usuario tiene `focusNotifications` y chatId vinculado. En el dashboard de integraciones figura "telegram: Conectado" y Pablo confirma que llega. Sin acción.

### 14. Nota sobre datos

Durante la auditoría los contadores de la sidebar (Hoy 55→56, Todas 93→95, Bandeja 14→16) se movieron solos. Es la sincronización de Google Calendar del PR #45 creando/actualizando tareas en segundo plano, no un efecto de las pruebas. Conviene vigilar que esa sync no cree duplicados.

---

## Nueva sección: Ajustes → Funciones (activar/desactivar módulos)

**Qué es:** página nueva de ajustes para activar o desactivar funciones: Cuenta atrás, Foco (Pomodoro), Matriz Eisenhower (y a futuro Hábitos, Jardín...).

**Por qué:** hoy todas las secciones están siempre presentes aunque no se usen. TickTick hace exactamente esto: cada módulo (Countdown, Eisenhower, Pomo, Habit) se activa/desactiva desde Ajustes y los activos aparecen como iconos en la barra izquierda.

**Resultado esperado:**
- Ruta nueva `/settings/features` hija de `SettingsLayout` (`apps/web/src/app.tsx` L149-165 ya monta ~15 sub-páginas de ajustes; añadir una más siguiendo el mismo patrón, y su entrada en el nav de `SettingsLayout` en `Places.tsx` ~L1524).
- Switches por función con persistencia por usuario (campo nuevo `features: { countdowns: bool, focus: bool, matrix: bool }` en preferencias del usuario, API de settings existente).
- Efecto de cada toggle: ocultar/mostrar el icono del rail (`IconRail.tsx`), la entrada del "Más" (`Sidebar.tsx`), la hoja móvil (`BottomBar.tsx`) y desactivar la ruta (redirect a /today con aviso) si está apagada. Por defecto todo activado (comportamiento actual).

---

## Resumen de orden sugerido para Cursor

1. Bug 3 (rail/badge en móvil, 1 línea de CSS).
2. Bug 2 (editor que corta texto, un useEffect).
3. Bug 1 (menú que no cierra, reutilizar Popover).
4. Bug 7 (bottom nav: color, cierre, secciones que faltan).
5. Bug 6 (Cuenta atrás al rail + limpieza del menú Más).
6. Bugs 4 y 5 (Reportes y Revisión con contenido real).
7. Bug 10 (Jardín: traducir widget + rediseño).
8. Bugs 8 y 9 (calendario: rejilla horaria + overflow, el más grande).
9. Ajustes → Funciones.
10. Eisenhower por lista (spec aparte).
