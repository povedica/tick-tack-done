# Prompt para Cursor: llevar la UI de tick-tack-done al look de TickTick

Pega esto en Cursor trabajando sobre una rama nueva `feat/ui-look-ticktick` desde `feat/ui-shell`.

Todos los valores de abajo son REALES, medidos en la app web de TickTick (tema `blue-gradient-theme`) el 2026-10-18: computed styles del DOM y su CSS compilado. No son aproximaciones.

---

## Contexto

Repo `tick-tack-done`, monorepo pnpm. Web en `apps/web` con CSS plano y custom properties: tokens en `apps/web/src/styles/tokens.css`, shell en `apps/web/src/shell/shell.css`, Hoy en `apps/web/src/features/today/today.css`, base en `apps/web/src/styles.css`. Spec de UI: `docs/spec/tick-tack-done-ui-spec-v1.0.md`.

El usuario comparó su pantalla "Hoy" con TickTick y quiere el look de TickTick. El look actual (crema + serif + índigo) eran las decisiones UI-D2 y UI-D3 del spec.

## 0. Registra el cambio en el spec

Edita `docs/spec/tick-tack-done-ui-spec-v1.0.md`, sección 1:

- UI-D2 pasa a: look tipo TickTick medido sobre la app real (valores de este documento), manteniendo nombre propio "tick-tack-done".
- UI-D3 pasa a: sans del sistema en TODA la UI, títulos incluidos.
- UI-D5 (oscuro) pasa a la paleta oscura medida (sección 2).
- Sube el documento a v1.1 con fecha 2026-10-18.

## 1. Tipografía

- Familia única: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` (es la pila exacta de TickTick). Elimina `font-family: var(--font-serif)` de: `styles.css` (`h1`), `shell.css` (`.brand-name`, `.today-header h1, .page-header h1`, `.plan summary`, `.waiting h2`) y `today.css` (`.task-group summary, .task-group-label`). `--font-serif` puede quedar para notas, pero ningún título de UI lo usa.
- Cuerpo UI: 14px, peso 400, color `#191919`. Es la base de TickTick; ajusta `--fs-base` a `0.875rem` y revisa la escala alrededor.
- Título de página ("Hoy"): 20px, peso 600, sin serif, sin fecha grande: la fecha va en `--ink-2` a 13px debajo.
- Metadatos (fechas, listas, contadores): 12px.

## 2. Color (tokens en `apps/web/src/styles/tokens.css`)

Tema claro, valores medidos de TickTick:

```css
/* Marca */
--accent: #4772fa; /* primary TickTick */
--accent-hover: #6c8efb;
--accent-active: #3e60cd;
--accent-soft: rgba(71, 114, 250, 0.12); /* píldora activa y fila seleccionada */
--focus-ring: #4772fa;

/* Superficies */
--bg: #ffffff; /* contenido */
--sidebar-bg: #f2f5fe; /* sidebar azul muy claro */
--rail-bg: #4772fa; /* rail de iconos, iconos blancos */
--surface: #ffffff;
--surface-2: rgba(25, 25, 25, 0.04); /* hover de fila */
--surface-3: rgba(25, 25, 25, 0.03); /* fondo del quick-add */
--border: rgba(25, 25, 25, 0.05); /* separador de filas */
--border-strong: #d9dce3;

/* Tinta (TickTick usa negro con opacidades) */
--ink: #191919;
--ink-2: rgba(25, 25, 25, 0.6);
--ink-3: rgba(25, 25, 25, 0.4); /* lista, contadores atenuados */
--ink-faint: rgba(25, 25, 25, 0.3); /* cabeceras de sección de sidebar */
--ink-inverse: #ffffff;

/* Prioridades (checkbox y bandera) */
--prio-high: #e13e39;
--prio-medium: #faa80c;
--prio-low: #4772fa;
--prio-none: #b3b3b3;

/* Semánticos */
--danger: #e03131; /* fechas vencidas */
```

Tema oscuro (`night-dark-theme` de TickTick): fondo `#242424`, sidebar `#1c1c1c`, rail `#242424`, tarjetas `#222222`, texto `#ffffff`, hover `rgba(255,255,255,0.04)` aprox, mismo acento `#4772fa`. Las opacidades de tinta se invierten (blanco con alpha).

## 3. Layout y sidebar (escritorio)

Medido: rail 50px + sidebar 240px + contenido + detalle 36%.

- `.sidebar`: `background: var(--sidebar-bg)`, ancho 240px (`--sidebar-w: 15rem`).
- Items de navegación: altura 36px, margen inferior 2px, icono 20px + texto 14px (line-height 20px), padding 0 12px, radio 10px.
- Item ACTIVO: `background: var(--accent-soft)` (la marca al 12%), texto e icono en `--ink` (no cambian de color), `data-selected` para el estado. Corrige `.nav-link.is-active`: ahora mismo usa otro fondo y otro color de texto.
- Contadores: 12px, `--ink`, a la derecha; al hover se ocultan y aparece un icono "···" de 16px en `--ink-3`. (El contador solo se atenúa en items de sección; en los smart lists va en tinta normal.)
- Cabeceras de sección (Listas, Filtros, Etiquetas): 12px, peso 700, color `--ink-faint`, sin mayúsculas forzadas.
- Botón "Nueva tarea": TickTick NO tiene botón grande en la sidebar. Elimínalo de ahí; la captura vive como quick-add inline sobre la lista (punto 5) y en el rail como icono `+`.
- Rail de iconos (izquierda del todo): 50px, fondo `--rail-bg`, iconos blancos 20px con el activo en píldora blanca translúcida, avatar arriba. Si el coste de navegación es alto, déjalo para un segundo pase, pero el look lo gana mucho. Ya existe `--sidebar-rail`; reutilízalo.

## 4. Filas de tarea (`today.css`, `TodayPage.tsx`)

Medidas reales de TickTick:

- Altura de fila 40px, line-height 40px; padding izquierdo de fila 18px, derecho 20px. Ajusta `--row-h` a `2.5rem` (la cómoda actual de 3rem se ve ancha; la compacta puede bajar a 32px).
- Separador entre filas: 1px, `var(--border)`, con margen izquierdo de 58px y derecho de 30px (empieza alineado con el texto, no con el checkbox). Se oculta en hover.
- Hover de fila: fondo `var(--surface-2)` con radio 10px ocupando la fila; aparecen el asa de arrastre (12px, a la izquierda) y el "···" (a la derecha). Sin transiciones bruscas (ver punto 8).
- Fila seleccionada (detalle abierto): fondo `var(--accent-soft)`.
- Checkbox: NO nativo. SVG de 17x17 a 16px del borde izquierdo: cuadrado redondeado con borde del color de prioridad (`--prio-*`), relleno transparente; al hover muestra variante con check; al completar, check animado y fila atenuada. Sustituye el `<input type=checkbox>` actual (el `accent-color` no llega a este look). El título queda a 40px del borde.
- Título: 14px, `--ink`, una línea con ellipsis.
- Chips de etiqueta: píldora de 18px de alto, radio full, padding 0 6px, texto 12px `rgba(0,0,0,0.85)`, fondo = color de la etiqueta al 50% de opacidad. Max 88px con ellipsis. Van tras el título, separados 4px.
- Nombre de lista: 12px, `--ink-3`, max 72px con ellipsis, antes de la fecha.
- Fecha: 12px en `--ink-2`; vencida en `--danger` (`#e03131`). Sin color de acento: la fecha no es un enlace. (Hoy `.task-date` usa `--accent-ink`, cámbialo.)

## 5. Cabecera de Hoy y quick-add

- Cabecera: "Hoy" 20px/600 con icono de menú a la izquierda; a la derecha iconos de 20px (bombilla de sugerencias, agrupar/ordenar, "···") en `--ink`, con hover sutil. Mantén tu selector de agrupar, pero como icono, no como `<select>` etiquetado grande.
- Quick-add inline: caja de 39px, fondo `var(--surface-3)`, radio 10px, placeholder "+ Añadir tarea" en `--ink-3`, sin borde visible hasta el foco. Es el patrón de captura principal de TickTick; ponlo bajo la cabecera en todas las vistas de lista.
- Cabeceras de grupo ("Alta 7", "Sin prioridad 2"): altura 28px, 14px, nombre en peso 600 `--ink` y contador pegado en `--ink-3`, plegables, padding 0 12px. (Ahora van en serif y tamaño grande.)

## 6. Panel de detalle (cuando lo construyas)

Medido: 36% del ancho, borde izquierdo `var(--border)`; header de 48px con barra de progreso de 2px bajo él, checkbox 17px, iconos de recordatorio y bandera de prioridad; cuerpo con título editable y descripción ("Escribe algo o / para comandos" en `--ink-3`); footer de 48px con la lista de la tarea e iconos. Cierra con Esc y con flecha atrás. Sirve como referencia para `TaskDetail` (spec §10).

## 7. Menús

Menú "···" de vista: tarjeta blanca, radio 12px, sombra suave; arriba un segmentado de vista (lista / kanban / timeline); items de 14px con icono de 16px a la izquierda ("Ocultar completadas", "Mostrar detalles", "Opciones de vista", "Imprimir"). Reutilízalo como modelo para tu `Menu` del spec 5.10.

## 8. Animaciones

TickTick usa transiciones de 150ms `cubic-bezier(0.4,0,0.2,1)` en color/fondo/opacidad, y 200ms en filas. Ajusta `--dur-fast: 150ms` y `--ease: cubic-bezier(0.4,0,0.2,1)`. Sin rebotes ni escalas; todo es fade/tinte.

## Lo que NO cambia

- Nada de marca, logo ni textos de TickTick: solo lenguaje visual. Nombre propio "tick-tack-done" (UI-D11).
- No toques lógica: rutas, stores, API, agrupación, undo, i18n es/en, densidad cómoda/compacta.
- Accesibilidad: contraste AA con la nueva paleta (ojo al `--ink-3` sobre `--sidebar-bg`: sube a 0.5 de opacidad si no llega), foco visible con `--focus-ring`, táctil 44px en móvil (allí la fila puede crecer a 48px).

## Criterios de aceptación visual

Compara una captura de `/today` con la referencia de TickTick:

1. Cero crema y cero serif en la UI; todo sans 14px sobre blanco.
2. Sidebar `#f2f5fe`, item activo píldora `rgba(71,114,250,0.12)` con texto `#191919`, contadores a la derecha, secciones en gris tenue.
3. Filas de 40px con separador fino alineado al texto, hover gris 4% redondeado, checkbox 17px con color de prioridad, chips pastel, lista y fecha grises a la derecha, vencidas `#e03131`.
4. Quick-add inline gris 3% bajo la cabecera; sin botón primario grande en la sidebar.
5. Cabecera "Hoy" 20px/600 con iconos de acción a la derecha; grupos tipo "Alta 7" plegables.
6. Tema oscuro con la paleta medida (no un invertido cálido).
7. `pnpm --filter @reflexionia/web build` y tests en verde; CI pasa.
