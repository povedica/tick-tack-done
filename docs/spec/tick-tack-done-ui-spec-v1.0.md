# Especificación de UI: tick-tack-done

- **Versión del documento:** 1.1
- **Fecha:** 18 de octubre de 2026
- **Estado:** Propuesta inicial completa, lista para implementar por fases
- **Audiencia:** agente de desarrollo (Cursor) / equipo de ingeniería
- **Documento base:** especificación de producto v1.1 (`docs/spec/ticktick-clone-spec-v1.1.md`); esta UI spec no la sustituye: detalla **cómo se ve y se comporta** lo que la v1.1 define
- **Alcance técnico:** PWA web (`apps/web`, React 19 + TypeScript + Vite, react-router 7, TanStack Query, Zustand, Workbox). Único cliente de fase 1, cuidado en móvil y escritorio (D1).

---

## 0. Cómo leer este documento

Cada pantalla se describe con la misma plantilla:

1. **Propósito** y ruta.
2. **Layout** (qué va en cada panel/zona).
3. **Componentes** y estados (vacío, carga, error, offline).
4. **Interacciones** (clic, teclado, gestos, drag & drop).
5. **Criterios de aceptación** numerados `UI-xx`, cada uno mapeado a los RF-xx de la spec v1.1.

Convenciones:

- **MVP / V1 / V2**: la misma fase que en la spec v1.1, sección 19 (espejada en `docs/roadmap.md`). Las pantallas V1/V2 se especifican ya para que la arquitectura no tenga que rehacerse, pero se etiquetan.
- **RF-xx**: requisito funcional de la spec v1.1. **UI-xx**: criterio de aceptación visual/interactivo de este documento, testeable con Playwright.
- Lo que ya existe en código (rama `feat/core-tasks`, tag `phase-1.4`) se marca **[EXISTE]** y se respeta: esta spec lo formaliza y lo extiende, no lo reescribe.

---

## 1. Decisiones de diseño tomadas por defecto (marcadas para que Pablo las confirme o cambie)

Estas decisiones no estaban en la spec v1.1. Se han elegido defaults sensatos y **están señalados**: Pablo puede cambiarlas editando esta sección.

| # | Decisión | Default elegido | Justificación |
|---|----------|-----------------|---------------|
| UI-D1 | Idioma de la UI | **Español por defecto, i18n es/en desde el MVP** | El usuario es hispanohablante; el código ya tiene `i18n/es.ts` y `i18n/en.ts` **[EXISTE]**. La spec exige i18n es+en (sección 16). `navigator.language` decide el arranque, con selector en ajustes que lo sobrescribe. |
| UI-D2 | Estilo visual | **Look tipo TickTick medido sobre la app real** (tema `blue-gradient-theme`, 2026-10-18): fondo `#ffffff`, sidebar `#f2f5fe`, rail `#4772fa`, acento `#4772fa`, tinta `#191919`. El nombre visible sigue siendo «tick-tack-done». | Valores medidos del DOM de TickTick. La identidad propia queda en el nombre, no en una paleta crema. |
| UI-D3 | Tipografía UI vs contenido | **Sans del sistema en toda la UI, títulos incluidos** (`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`). La serif solo puede usarse en el cuerpo de las notas. | Es la pila exacta de TickTick. Un título serif rompe la densidad de las listas. |
| UI-D4 | Tema claro/oscuro | **Auto por defecto** (sigue `prefers-color-scheme`), con selector Claro/Oscuro/Auto en ajustes | La spec lo prevé en `User.theme` (5.17) y RF-1903. |
| UI-D5 | Modo oscuro | **Paleta oscura medida** (`night-dark-theme`): fondo `#242424`, sidebar `#1c1c1c`, rail `#242424`, tarjetas `#222222`, texto `#ffffff`, hover `rgba(255,255,255,0.04)`, acento `#4772fa`. Las opacidades de tinta se invierten (blanco con alpha). | Es el oscuro real de TickTick, no un invertido cálido. `--ink-3` sube a 0.65 para contraste AA sobre la sidebar. |
| UI-D6 | Densidad | **Cómoda por defecto**, opción Compacta en ajustes | TickTick ofrece densidad; la compacta ayuda con listas de 100+ tareas. |
| UI-D7 | Navegación móvil | **Barra inferior** con 4 destinos + FAB central de captura | Estándar PWA; el pulgar llega a todo. |
| UI-D8 | Framework de CSS | **CSS plano con custom properties** (tokens en sección 3), sin Tailwind ni CSS-in-JS | Coherente con `styles.css` actual; un archivo de tokens + hojas por feature. Sin nueva dependencia. |
| UI-D9 | Iconos | **lucide-react** (MIT, tree-shakeable) + emoji nativo para listas/etiquetas | Set consistente, ligero, sin diseñar iconos propios. |
| UI-D10 | Primer arranque | **Sin wizard de onboarding**: la app abre en `/today` con estados vacíos que enseñan solos | La captura debe costar un segundo desde el minuto cero; un wizard lo retrasa. |
| UI-D11 | Nombre visible de la app | **"tick-tack-done"** en minúsculas, tagline opcional "tu jardín de tareas" | Es el nombre del repo y del dominio futuro (`todo.reflexionia.com`). |

---

## 2. Principios de UI

1. **Capturar cuesta un segundo** (RF-101): el FAB y la tecla `N` abren la captura desde cualquier pantalla, sin navegación previa, y la captura nunca pide más que un título.
2. **La URL es el estado**: cada vista, filtro, lista y tarea abierta tiene URL propia y compartible (spec §7). Pegar un enlace en otro dispositivo abre exactamente lo mismo, incluida la tarea seleccionada.
3. **Offline visible, no oculto**: la app funciona sin red (RF-13010) y lo dice con un indicador discreto pero claro; nunca deja una acción "en el limbo" sin feedback.
4. **Optimista con red**: completar, reordenar y mover tareas se siente instantáneo (optimistic update con rollback en error), pero los errores siempre se muestran y ofrecen reintento.
5. **Una sola verdad por dato**: contadores, badges y estados vienen del backend (filtros evaluados en servidor, RF-904); el cliente no reimplementa lógica de negocio (vive en `packages/domain`).
6. **Todo tiene teclado**: cada acción de ratón tiene atajo o foco equivalente (WCAG 2.1 AA, RF-1902).
7. **Los estados vacíos enseñan**: cada pantalla vacía dice qué es, por qué está vacía y cuál es el primer paso, con un CTA real (no arte decorativo).
8. **Nada de sorpresas destructivas**: borrar pasa por papelera con undo de 10 s (RF-210); las acciones irreversibles (vaciar papelera, revocar token, borrar cuenta) piden confirmación explícita con el nombre de lo que se va a perder.
9. **Paridad TickTick donde ayuda, identidad propia donde suma**: la disposición general (3 paneles, smart lists, kanban, hábitos) replica el modelo mental de TickTick; el estilo visual y las extensiones (dashboard, reporte, revisiones) son propios.
10. **Responsive de verdad**: móvil primero en componentes; escritorio aprovecha el ancho con 3 paneles; ninguna función clave depende de hover.

---

## 3. Sistema de diseño (tokens)

Tokens como CSS custom properties en `:root` y `[data-theme="dark"]`. El tema se fija con `document.documentElement.dataset.theme` (`light|dark`) resolviendo `auto` en cliente; la preferencia persiste en `localStorage` y se sincroniza a `User.theme` (5.17) cuando hay sesión.

### 3.1 Color

```css
:root {
  /* Superficies (claro) */
  --bg:            #f6f4ef;  /* fondo de app [EXISTE] */
  --surface:       #ffffff;  /* tarjetas, hojas, paneles */
  --surface-2:     #faf9f6;  /* hover de filas, zonas sutiles */
  --surface-3:     #f0ede6;  /* fondos activos/selección suave */
  --border:        #e7e5e4;  /* stone-200 */
  --border-strong: #d6d3d1;  /* stone-300, inputs [EXISTE] */

  /* Tinta */
  --ink:        #1c1917;  /* texto principal [EXISTE] */
  --ink-2:      #44403c;  /* stone-700, texto secundario */
  --ink-3:      #78716c;  /* stone-500, metadatos, placeholders */
  --ink-inverse:#fafaf9;

  /* Acento e identidad */
  --accent:        #4f46e5;  /* índigo [EXISTE] */
  --accent-hover:  #4338ca;
  --accent-soft:   #eef2ff;  /* fondos de selección acentuada */
  --accent-ink:    #3730a3;  /* texto sobre accent-soft */

  /* Semánticos */
  --danger:      #dc2626;  --danger-soft: #fef2f2;
  --warning:     #d97706;  --warning-soft: #fffbeb;
  --success:     #16a34a;  --success-soft: #f0fdf4;
  --info:        #0284c7;  --info-soft:    #f0f9ff;

  /* Prioridades (bandera de tarea, RF-502) */
  --prio-high:   #dc2626;
  --prio-medium: #d97706;
  --prio-low:    #2563eb;
  --prio-none:   #a8a29e;

  /* Foco */
  --focus-ring: #4f46e5;
}

[data-theme="dark"] {
  --bg:            #1c1917;
  --surface:       #292524;
  --surface-2:     #232120;
  --surface-3:     #33302e;
  --border:        #44403c;
  --border-strong: #57534e;

  --ink:        #f5f5f4;
  --ink-2:      #d6d3d1;
  --ink-3:      #a8a29e;
  --ink-inverse:#1c1917;

  --accent:        #818cf8;
  --accent-hover:  #a5b4fc;
  --accent-soft:   #312e81;
  --accent-ink:    #c7d2fe;

  --danger:#f87171; --danger-soft:#450a0a;
  --warning:#fbbf24; --warning-soft:#451a03;
  --success:#4ade80; --success-soft:#052e16;
  --info:#38bdf8; --info-soft:#082f49;

  --prio-high:#f87171; --prio-medium:#fbbf24;
  --prio-low:#60a5fa;  --prio-none:#57534e;

  --focus-ring: #a5b4fc;
}
```

Colores de listas/etiquetas: paleta fija de 20 colores (12 saturados + 8 pastel), con contraste de texto calculado en tema claro y oscuro. La paleta se documenta en el componente `ColorPicker` (6.9).

### 3.2 Tipografía

```css
:root {
  --font-serif: 'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif; /* [EXISTE] */
  --font-sans:  system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;
  --font-mono:  ui-monospace,'SF Mono',SFMono-Regular,Menlo,monospace;

  --fs-xs:   0.75rem;   /* 12 metadatos */
  --fs-sm:   0.8125rem; /* 13 secundario */
  --fs-base: 0.9375rem; /* 15 cuerpo UI (sans) */
  --fs-md:   1rem;      /* 16 cuerpo lectura */
  --fs-lg:   1.25rem;   /* 20 título de panel */
  --fs-xl:   1.5rem;    /* 24 título de página móvil */
  --fs-2xl:  1.75rem;   /* 28 título de página escritorio [EXISTE h1] */

  --lh-tight: 1.25;
  --lh-base:  1.5; /* [EXISTE] */
}
```

Reglas: títulos de página (`h1`) y contenido largo de notas/tareas en `--font-serif`; toda la UI operativa (botones, listas, inputs, tablas, kanban, calendario) en `--font-sans`; fechas ISO, tokens y código en `--font-mono`.

### 3.3 Espaciado, radios, sombras, motion

```css
:root {
  --sp-1: 0.25rem; --sp-2: 0.5rem;  --sp-3: 0.75rem;
  --sp-4: 1rem;    --sp-5: 1.25rem; --sp-6: 1.5rem;
  --sp-8: 2rem;    --sp-10: 2.5rem; --sp-12: 3rem;

  --radius-sm: 0.375rem; --radius-md: 0.5rem;
  --radius-lg: 0.75rem;  /* inputs [EXISTE] */ --radius-xl: 1rem;
  --radius-full: 9999px;

  --shadow-sm: 0 1px 2px rgb(28 25 23 / 0.06);
  --shadow-md: 0 4px 12px rgb(28 25 23 / 0.10);  /* menús, popovers */
  --shadow-lg: 0 12px 32px rgb(28 25 23 / 0.16); /* hojas, modales */

  --dur-fast: 120ms; --dur-base: 180ms; --dur-slow: 300ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);

  --sidebar-w: 17rem;   /* 272 px */
  --detail-w:  24rem;   /* 384 px */
  --content-max: 46rem; /* columna de lectura en vistas de lista */
  --bottombar-h: 3.5rem;
  --tap: 2.75rem;       /* 44 px objetivo táctil mínimo */
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
```

Sombras en tema oscuro con opacidad ×1.5. Los modales/hojas entran con `--dur-slow` y salen con `--dur-fast`; los toasts no animan posición (solo opacidad) para no marear.

### 3.4 Densidad

`data-density="comfortable|compact"` en `<html>`: cómoda = fila de tarea de 44-52 px; compacta = 32-36 px, metadatos en una línea, checkbox de 18 px. La densidad se guarda en ajustes (RF-1903) y aplica a listas, kanban y calendario.

---

## 4. Arquitectura de información y navegación

### 4.1 Mapa de rutas

Las rutas `[EXISTE]` ya están en `app.tsx`; el resto se añaden en su fase. Todo lo que aparece en la barra lateral tiene URL estable y compartible.

| Ruta | Pantalla | Fase |
|------|----------|------|
| `/` | Redirect a `/today` | MVP **[EXISTE]** |
| `/today` | Hoy + revisión diaria | MVP **[EXISTE base]** |
| `/quick-add` | Captura rápida (ruta para share target y deep links) | MVP **[EXISTE]** |
| `/inbox` | Bandeja de entrada | MVP |
| `/list/{id}` | Lista (vistas lista/kanban/timeline según `view_mode`) | MVP (vista lista) / V1 (kanban, timeline) |
| `/list/{id}/note/{taskId}` | Nota abierta dentro de lista de notas | V1 |
| `/filter/{id}` | Filtro personalizado | MVP |
| `/smart/{key}` | Smart list de sistema: `tomorrow`, `next7`, `all`, `no-date`, `recent`, `completed`, `trash`, `assigned` (V2) | MVP (salvo `assigned`) |
| `/task/{id}` | Tarea abierta (abre su lista contenedora con el detalle) | MVP |
| `/habits` | Hábitos | MVP |
| `/habits/{id}` | Detalle y estadísticas de hábito | MVP |
| `/calendar/{view}` | Calendario: `day`, `week`, `multi-day`, `multi-week`, `month`, `year`, `agenda` | V1 |
| `/matrix` | Matriz de Eisenhower | V1 |
| `/focus` | Pomodoro / Focus | V2 |
| `/dashboard` | Jardín digital (KPIs) | V1 |
| `/reports/weekly` | Histórico de reportes semanales | V1 |
| `/reports/weekly/{semana}` | Reporte semanal concreto (`2026-W42`) | V1 |
| `/review/weekly` | Revisión semanal guiada | V1 |
| `/search` | Resultados de búsqueda (`?q=`) | MVP (la paleta abre aquí al confirmar) |
| `/settings/...` | Ajustes (árbol completo en §20) | MVP→V2 por secciones |
| `/login`, `/register`, `/forgot-password` | Cuenta (solo si multiusuario se activa; en instancia personal de Pablo puede haber sesión única precreada) | MVP |

Convenciones de query params compartidos: `?view=list|kanban|timeline` (sobrescribe el `view_mode` de la lista sin guardarlo), `?sort=`, `?group=`, `?q=` (búsqueda contextual de la vista), `?task={id}` (detalle abierto dentro de una vista). Cambiar vista/orden/grupo actualiza la URL (replace, no push) para que compartir el enlace reproduzca la vista.

### 4.2 Layout de escritorio (≥1024 px)

Tres paneles como TickTick:

```
┌────────────┬──────────────────────────────────┬──────────────────┐
│  SIDEBAR   │            PANEL CENTRAL          │  PANEL DETALLE   │
│  272 px    │  vista activa (flex 1, max 736    │  384 px          │
│            │  px de columna de lectura en      │  (se oculta si   │
│            │  listas; full-width en kanban/    │  no hay selección│
│            │  timeline/calendario/matriz)      │  ni ?task=)      │
└────────────┴──────────────────────────────────┴──────────────────┘
```

- Sidebar colapsable a rail de iconos de 56 px (botón `‹` al pie o atajo `[`); estado persistido en `localStorage`.
- Panel de detalle cierra con `Esc`, con `×` o al hacer clic fuera en overlay móvil; su contenido es el mismo componente `TaskDetail` en escritorio (panel) y móvil (hoja).
- El ancho del detalle es arrastrable entre 320 y 480 px.

### 4.3 Layout de tablet (640-1023 px)

Sidebar como drawer temporal (overlay con scrim), panel central a ancho completo, detalle como panel derecho overlay de 384 px con scrim.

### 4.4 Layout de móvil (<640 px)

- **Barra inferior** (`--bottombar-h`): 4 destinos + botón central de captura:
  `Hoy` · `Listas` (abre drawer con la sidebar completa) · **`＋` FAB** · `Buscar` (abre paleta en modo búsqueda) · `Hábitos`.
  En V1 el quinto destino pasa a ser `Más` (Calendario, Dashboard, Reportes, Ajustes).
- **Detalle de tarea** como hoja inferior (bottom sheet) con dos posiciones: media (60 %) y completa; arrastre hacia abajo para cerrar.
- **Gestos**: swipe derecho sobre una tarea = completar; swipe izquierdo = acciones rápidas (fecha, mover, borrar). Pull-to-refresh fuerza sync. Swipe desde el borde izquierdo abre el drawer.
- La captura siempre es hoja a pantalla casi completa (teclado visible sin saltos).

### 4.5 Barra lateral (contenido y orden)

De arriba abajo, con secciones reordenables por arrastre y contadores opcionales (RF-305, RF-901):

1. **Cabecera**: avatar/nombre → menú (ajustes, tema, cerrar sesión) + icono de sync/offline.
2. **Smart lists activas** (RF-901): Hoy, Mañana, Próximos 7 días, Todas, Bandeja, Sin fecha, Añadidas recientemente, Completadas. Cada una con badge de contador; activar/ordenar desde Ajustes → Smart lists. **Papelera** al final, con acción "Vaciar" (confirmación con conteo, irreversible tras 30 días de purga automática).
3. **Filtros fijados** (RF-903): icono/color, contador, menú contextual (editar, duplicar, fijar, borrar).
4. **Carpetas y listas** (RF-302): carpetas plegables (`▸`), listas con punto de color + emoji. Menú contextual de lista: abrir, renombrar, color/icono, vista por defecto, nueva sección, archivar, exportar CSV/iCal (V1), borrar. `＋ Nueva lista` al pie de la sección (crea en Inbox-style inline: input inline con color por defecto aleatorio).
5. **Etiquetas** (RF-403): árbol colapsable por padre; badge de contador; clic filtra como vista de primera clase (`/filter/-tag-{id}` interno o vista dedicada `?tag=`); menú: renombrar (cascada segura, referencias por ID), color, fusionar, borrar.
6. **Accesos V1**: Calendario, Matriz, Dashboard, Reportes, Revisión semanal; V2: Focus.

Estados de la sidebar: carga inicial con skeleton de 6 filas; error con reintento; offline muestra datos cacheados + indicador.

### 4.6 Criterios de aceptación de navegación

- **UI-101** (→ spec §7): todas las rutas del mapa resuelven sin 404 en recarga directa (PWA con fallback de history API).
- **UI-102** (→ RF-903): filtros y smart lists aparecen en sidebar con contador real del backend y abren su vista al clic.
- **UI-103**: en móvil, los 5 destinos de la barra inferior son alcanzables con el pulgar (zona táctil ≥44 px) y el FAB abre captura en <300 ms.
- **UI-104**: la URL refleja vista, orden, grupo y tarea abierta; recargar o pegar el enlace reproduce el estado exacto.
- **UI-105**: `Esc` cierra, en orden: paleta → menú contextual abierto → detalle → drawer móvil.

---

## 5. Componentes base

Inventario de componentes compartidos en `apps/web/src/components/`. Cada uno lista sus estados obligatorios. Regla: ningún componente de pantalla implementa su propio spinner/toast/modal; todos usan estos.

### 5.1 `Button`

Variantes: `primary` (acento, texto inverse), `secondary` (surface con borde), `ghost` (sin fondo), `danger` (danger), `icon` (cuadrado 32/40 px, solo icono, `aria-label` obligatorio). Tamaños: `sm` (28 px), `md` (36 px), `lg` (44 px). Estados: normal, hover, focus-visible (anillo 2 px `--focus-ring` offset 1), pressed, `loading` (spinner sustituye icono, botón deshabilitado, `aria-busy`), `disabled` (opacidad 50 %, sin pointer). En móvil todos crecen a ≥44 px de zona táctil.

### 5.2 `IconButton` con tooltip

Tooltip al hover/focus tras 400 ms, máximo 1 línea, sin contenido esencial (el icono debe entenderse sin él). En táctil, el tooltip aparece con pulsación larga sobre controles no destructivos.

### 5.3 `Input` / `Textarea` / `DateField` / `TimeField`

Borde `--border-strong`, radio `--radius-lg`, padding `0.75rem` **[EXISTE en capture-input]**. Focus: outline 2 px acento **[EXISTE]**. Estado error: borde `--danger` + mensaje bajo el campo con `role="alert"` y `aria-describedby`. DateField abre `DatePicker` (6.8); admite teclear "23/10", "mañana" y pegar ISO.

### 5.4 `Checkbox` de tarea

Cuadrado redondeado de 20 px (radio 6 px), borde 2 px con **color de prioridad** (rojo/naranja/azul/gris; TickTick usa este patrón y lo replica la spec, RF-502). Estados: sin marcar, hover (fondo `--surface-3`), marcando (animación de check 180 ms, la fila se atenúa y colapsa si la vista oculta completadas), indeterminado (no usado), focus-visible, disabled. En tarjetas kanban es 18 px. `aria-label="Completar «título»"`.

### 5.5 `Tag` (chip)

Pildora con fondo del color de etiqueta al 15 % y texto del color (calculado para contraste AA en ambos temas). Variantes: `readonly` (en tarjeta de tarea), `removable` (con `×` en editores), `add` (`+` punteado). Altura 22 px, `--fs-xs`. TickTick renderiza las etiquetas como pills inline en la fila **[verificado en la app real]**; igual.

### 5.6 `Badge` de contador

Contadores de sidebar y cabeceras de grupo: `--fs-xs` en `--ink-3`, sin fondo (TickTick los muestra como número suelto a la derecha **[verificado]**). Badge de notificación (p. ej. recordatorios pendientes): punto rojo 8 px o cápsula con número sobre `--danger`.

### 5.7 `Toast` (notificaciones efímeras)

Esquina inferior izquierda en escritorio, sobre la barra inferior en móvil. Máximo 3 apilados. Tipos: `info`, `success`, `error`, `undo`. Duración: 4 s estándar, **10 s si lleva acción Deshacer** (RF-210). Pausa el temporizador al hover/focus. `role="status"` (info/success) o `role="alert"` (error). La acción de undo es un botón real, foco por teclado con `Ctrl+Z` como atajo global mientras el toast vive.

### 5.8 `Modal` y `ConfirmDialog`

Modal centrado, ancho 480 px (máx. 92 vw), scrim `--ink` al 40 %, cierre con `Esc` y clic en scrim (los destructivos solo con `Esc` y botón). `ConfirmDialog` para acciones irreversibles: título con la acción ("Vaciar la papelera"), cuerpo con el alcance exacto ("127 tareas se borrarán para siempre; las de hace más de 30 días ya no se pueden recuperar"), botón primario `danger` con el verbo ("Vaciar"), sin confirmación por escrito salvo borrado de cuenta (escribir el email). Focus trap y retorno de foco al invocador.

### 5.9 `Sheet` (hoja móvil)

Bottom sheet con asa de arrastre, posiciones 60 %/100 %, cierra al arrastrar abajo o `Esc`. En escritorio los mismos flujos usan `Modal` o el panel de detalle. La captura rápida **[EXISTE como CaptureSheet]** y el detalle de tarea en móvil usan `Sheet`.

### 5.10 `Menu` / `ContextMenu`

Menú emergente anclado (listas de la sidebar, `...` de vistas, clic derecho en tarea). Items con icono + etiqueta + atajo opcional; separadores; item `danger` al final; submenú a la derecha en escritorio, a pantalla completa en móvil. Navegación con flechas, `Home`/`End`, apertura con `Enter`/`Espacio`/`↓`, cierre `Esc` devolviendo foco. TickTick abre el menú contextual de tarea también con clic derecho en la fila **[verificado como patrón estándar]**; replicar.

### 5.11 `Popover` y `Tooltip`

Popover para selectores ricos (fecha, prioridad, etiquetas, lista): anclado al invocador, cierra al clic fuera/`Esc`, foco dentro al abrir. Tooltip según 5.2.

### 5.12 `EmptyState`

Icono lineal 48 px en `--ink-3`, título `--fs-lg` serif, una frase de ayuda y un CTA `Button` primario o de texto. Nunca una ilustración decorativa sin acción. Copys concretos por pantalla en §22.

### 5.13 `Skeleton` y `Spinner`

Skeletons con la silueta real de la vista (filas de 44 px, cabecera de grupo, panel de detalle) con shimmer de 1.2 s respetando reduced-motion. Spinner solo para acciones puntuales (botón `loading`) y cargas <300 ms esperadas; para todo lo demás, skeleton. Regla: primera carga de una vista = skeleton; recargas con datos previos = datos viejos + indicador de sync, nunca pantalla en blanco.

### 5.14 `ErrorState` (error de vista)

Icono, "No se pudo cargar {recurso}", detalle técnico colapsado, botón `Reintentar` (reintenta la query) y enlace "Copiar diagnóstico" (copia `X-Request-Id` + timestamp). En 401 → redirige a login; en 403 de scope → mensaje específico; en 429 → cuenta atrás con `Retry-After`; en 5xx/red → estado offline si procede (§14).

### 5.15 `ProgressRing` y `ProgressBar`

Anillo para checklists (x/y) en tarjeta de tarea y metas de hábito; barra para progreso de columna kanban y objetivos. Colores: acento; verde al 100 %.

### 5.16 `Avatar` y `UserChip`

Avatar 28 px con iniciales si no hay foto; `UserChip` (avatar+nombre) se usa en V2 (asignados) y ya se diseña para no romper layouts.

### 5.17 `Kbd`

Tecla en `--surface-3` con borde inferior 2 px, `--font-mono` `--fs-xs`. Usado en menús, paleta y hoja de atajos.

### 5.18 Criterios de aceptación de componentes

- **UI-201**: todo control interactivo tiene estado `:focus-visible` visible con contraste ≥3:1 (WCAG 2.4.7).
- **UI-202**: toda mutación destructiva muestra `ConfirmDialog` o toast con undo según la regla del principio 8.
- **UI-203**: los toasts de undo viven 10 s y `Ctrl+Z` los dispara (RF-210).
- **UI-204**: skeleton en primera carga de cada vista; nunca spinner de pantalla completa tras la primera visita (cache de TanStack Query + persistencia offline).

---

## 6. Captura rápida (Quick Add) — MVP, ya iniciada **[EXISTE]**

La captura es la prioridad máxima del producto (spec 9.1). Lo construido en `features/capture` se conserva y se formaliza:

### 6.1 Puntos de entrada

| Entrada | Mecanismo | Estado |
|---|---|---|
| Tecla `N` global (sin foco en input) | `CaptureHotkey` | **[EXISTE]** |
| FAB `＋ Nueva tarea` | botón fijo | **[EXISTE]** (móvil: pasa al centro de la barra inferior, §4.4) |
| Share target del SO (PWA) | POST al SW → redirect a `/quick-add?title&text&url` | **[EXISTE]** |
| Dictado por voz | Web Speech API → mismo pipeline | **[EXISTE]** |
| Email-to-task | `<token>@in.todo.reflexionia.com` | **[EXISTE backend]**; su ajuste se gestiona en §20.8 |
| Ruta directa `/quick-add` | deep link compartible | **[EXISTE]** |
| Añadir inline en una lista | fila "Añadir tarea en «lista»" al pie de cada grupo/sección | NUEVO (TickTick lo tiene al inicio de la vista **[verificado]**: "Add task to 'inbox'") |
| Paleta de comandos | comando "Nueva tarea" | §17 |
| V2: widget/atajo global de escritorio | fuera de PWA | spec RF-106 |

### 6.2 La hoja de captura

Basada en `CaptureSheet` **[EXISTE]**:

- **Campo único** con resaltado inline de lo detectado por NLP sobre un backdrop transparente **[EXISTE patrón backdrop]**: fecha/hora (subrayado acento), prioridad (color de prioridad), `#etiqueta` (color etiqueta), `^lista`/`~lista` (color lista), recordatorio ("avísame…").
- **Chips de parseo** bajo el campo: uno por entidad detectada (`Fecha: mañana 18:00`, `Prioridad: alta`, `Etiqueta: casa`, `Lista: trabajo`, `Aviso: 30 min antes`), cada uno con `×` para quitarlo **[EXISTE remove]**. Quitar un chip devuelve el texto al título.
- **Vista previa del título limpio** ("Título") **[EXISTE titlePreview]**.
- **Avisos no bloqueantes** tras crear **[EXISTE notice]**: lista inexistente → creada en Inbox y se avisa (RF-107); etiqueta inexistente → no se crea y se avisa; recordatorio sin fecha → no se guarda y se avisa. Estos avisos aparecen en el toast/notice de "Tarea creada" con opción "Editar" que reabre la tarea.
- **Destino**: por defecto la lista visible si se abrió desde una lista, si no Inbox (RF-303). Selector de destino colapsado tras los chips (no obliga a elegir).
- **Crear y seguir capturando**: `Ctrl+Enter` crea y mantiene la hoja abierta con el campo vacío; `Enter` crea y cierra; `Esc` cierra sin crear.
- **Voz**: botón de micrófono con estado `grabando` (anillo pulsante rojo + cronómetro), `voiceUnsupported` si el navegador no lo admite **[EXISTE]**.
- **Offline**: crea en local con `Idempotency-Key`, marca "pendiente de sincronizar" en la tarea y encola (§14). Criterio de aceptación 5 de la spec.
- Velocidad: abierta en <150 ms desde la tecla; creada en <300 ms percibidos (optimista) (RF-101, sección 16).

### 6.3 Criterios de aceptación de captura

- **UI-301** (→ RF-101, RF-102): desde cualquier ruta, `N` abre la captura con el campo enfocado; escribir "Comprar leche mañana 18:00 !alta #casa" y pulsar Enter crea la tarea con fecha, prioridad y etiqueta parseadas, mostradas como chips antes de confirmar.
- **UI-302** (→ RF-102, RF-103): cada chip es eliminable y el título se actualiza; el parseo funciona en español e inglés (mismo pipeline del backend `packages/domain`, nunca un parser duplicado en cliente).
- **UI-303** (→ RF-107): con título vacío no se crea nada; con `^lista` inexistente, la tarea cae en Inbox y el aviso lo dice en el toast de creada.
- **UI-304** (→ RF-104): el dictado vuelca texto al mismo campo y lo parsea igual; sin soporte, el botón muestra `voiceUnsupported`.
- **UI-305** (→ RF-13010): sin red, la tarea se crea con badge "pendiente" y aparece en Inbox; al volver la red se sincroniza sin duplicados (Idempotency-Key).
- **UI-306** (→ RF-106): compartir un texto/URL desde el móvil a la PWA abre `/quick-add` con el campo precargado.

---

## 7. Hoy (`/today`) — MVP

La pantalla que Pablo abre por defecto; es su "qué toca". Base **[EXISTE]** (hoy solo muestra el aviso de captura; esta sección define la pantalla completa).

### 7.1 Layout

Cabecera: título "Hoy" + fecha ("sábado, 17 de octubre"), a la derecha: botón de sugerencias de la **revisión diaria** (RF-2301, icono bombilla como TickTick), selector de orden/grupo, menú `...` (ocultar completadas, mostrar detalles, opciones de vista, imprimir — mismo menú que TickTick **[verificado]**).

Contenido (vista lista, RF-1001):

1. **Bloque de revisión diaria** (colapsable, RF-2301): la propuesta de 3-7 tareas del backend (`GET /api/v1/review/daily`) como tarjetas con checkbox "para hoy"; aceptar toda la propuesta, reordenar por arrastre o descartar elementos con un gesto/botón. Marca visual "en tu plan de hoy" (borde acento a la izquierda) que persiste en la vista. Vacío: si ya se hizo la revisión, el bloque se colapsa a un resumen ("Plan de hoy: 5 tareas · rehacer").
2. **Vencidas** (si las hay): grupo fijo arriba, contador, fechas en `--danger` (RF-603).
3. **Tareas de hoy** agrupadas según `?group=` (default: `priority`, como el Today de TickTick **[verificado: High 17 / Medium 18]**), con cabeceras plegables y contador.
4. **Hábitos de hoy**: franja inferior opcional (activable en ajustes) con los hábitos del día y su check-in rápido (§15.3). Default: activada.
5. **Eventos de calendario** (V1, RF-1103): sección "Hoy en tu calendario" con eventos externos de solo lectura.

### 7.2 Componentes

Fila de tarea (§9.2), cabecera de grupo, inline add, `EmptyState` ("Despejado. Captura lo próximo con N o revisa tu Inbox."), `HabitQuickCard`, `DailyReviewCard`.

### 7.3 Interacciones

Completar con checkbox o `Espacio`; reordenar por arrastre dentro del grupo (orden manual persistido si `?sort=manual`); clic abre detalle; swipe móvil (§4.4); menú contextual con "Aplazar a mañana / semana que viene / fecha" (RF-605). `Tab+1` fija hoy, `Tab+2` mañana (paridad atajos TickTick, §21).

### 7.4 Estados

- **Vacío total**: EmptyState con CTA a captura y enlace "Revisar Inbox".
- **Sin revisión hecha**: bloque de revisión expandido con skeleton de propuesta.
- **Error**: ErrorState con reintento; los datos cacheados se muestran degradados con aviso.
- **Offline**: indicador global (§14); completar funciona y se encola.

### 7.5 Criterios de aceptación

- **UI-401** (→ RF-603): las vencidas aparecen en grupo propio arriba con fecha en rojo.
- **UI-402** (→ RF-1001): agrupación por prioridad por defecto; cambiar a fecha/etiqueta/lista actualiza `?group=` y persiste por vista.
- **UI-403** (→ RF-2301, V1 pero el bloque se prepara en MVP como "Plan de hoy" manual): la propuesta del backend se muestra con acciones aceptar/reordenar/descartar; la selección queda marcada.
- **UI-404** (→ RF-210): completar por error revierte con el toast de undo sin recargar la vista.
- **UI-405**: tiempo interactivo de `/today` con 200 tareas <2 s en Moto G4 throttling (budget PWA).

---

## 8. Bandeja de entrada (`/inbox`) — MVP

Vista lista normal sobre el Project de sistema `is_inbox` (RF-303), destino de captura y email-to-task.

### 8.1 Particularidades

- Cabecera "Bandeja" con contador y acción "Procesar todo" (abre el modo procesamiento, abajo).
- Inline add arriba ("Añadir tarea en «Bandeja»") como en TickTick **[verificado]**.
- Orden por defecto: creación descendente (lo capturado nuevo arriba).
- **Modo procesar** (extensión propia barata, útil con RF-2302): recorrido tarea a tarea con acciones grandes en la parte inferior: `Fijar fecha` · `Mover a lista` · `Etiquetar` · `Hecha` · `Borrar` · `Saltar`; atajos de una tecla (D/M/T/E/Supr/S). Al terminar, EmptyState de celebración sobria ("Bandeja vacía").
- Las tareas creadas por email muestran un icono de origen (`source`, 5.1) con tooltip "por email"; igual para `api`/`automation` en todas las vistas (trazabilidad visible, espíritu de 10.1 auditoría).

### 8.2 Criterios de aceptación

- **UI-501** (→ RF-303): lo capturado sin lista destino aparece en Inbox; el contador de sidebar coincide.
- **UI-502**: el modo procesar recorre todas las tareas con teclado completo y termina en EmptyState.
- **UI-503** (→ RF-105): una tarea venida por email muestra icono de origen y su contenido/adjuntos en el detalle.

---

## 9. Lista (`/list/{id}`) — MVP (vista lista)

### 9.1 Layout

Cabecera: color/nombre de lista (editable inline), contador, acciones: inline add, selector de vista (lista/kanban/timeline — kanban y timeline en V1, §10), orden/grupo, menú `...` (renombrar, color e icono, vista por defecto, gestionar secciones, archivar, exportar CSV/iCal V1, borrar). Debajo, la vista activa. En escritorio, el detalle abre en el tercer panel (§11).

### 9.2 Fila de tarea (componente `TaskRow`)

Anatomía (de TickTick **[verificado]** y ampliada):

```
[☐ prio] Título con #etiquetas como pills        [⤴ recurrencia] [📎 n] [⚑ x/y] [lista] [fecha]
```

- Checkbox con color de prioridad (5.4). Título en `--fs-base`; las etiquetas del título se renderizan como `Tag` pills **[verificado: pills inline]**.
- Metadatos a la derecha en `--fs-xs` `--ink-3`: icono de recurrencia (tooltip con la regla en lenguaje natural), adjuntos con contador, progreso de checklist x/y (RF-207), subtareas con contador **[verificado: badge numérico]**, nombre de lista (fuera de su lista), fecha (roja si vencida RF-603, `--ink-3` si futura, acento si hoy).
- Fila seleccionada: fondo `--accent-soft`. Selección múltiple: `Shift+clic` rango, `Ctrl+clic` individual, `Ctrl+A` la vista; barra de acciones masiva flotante abajo (completar, fecha, prioridad, etiquetas, mover, borrar) (RF-208).
- Drag & drop: asa al hover en escritorio; en móvil, pulsación larga. Drop entre grupos cambia el atributo del grupo (fecha, etiqueta, sección...) con undo.

### 9.3 Secciones y grupos

- Secciones (Column, RF-304): cabecera plegable con contador, renombrar inline, menú (añadir tarea, reordenar, colapsar, renombrar, borrar sección → tareas pasan a "Sin sección"). Nueva sección al final ("＋ Añadir sección").
- Agrupación dinámica `?group=`: fecha / prioridad / etiqueta / lista / sección. Cabeceras con el mismo componente; el orden de grupos sigue el campo (vencidas primero en fecha).

### 9.4 Estados y aceptación

- **UI-601** (→ RF-201, RF-301): CRUD completo desde la vista: crear inline, editar en detalle, duplicar/mover/borrar desde menú contextual.
- **UI-602** (→ RF-502, RF-503): la prioridad colorea el checkbox y ordena con "prioridad" en `?sort=`.
- **UI-603** (→ RF-304): las secciones se crean, renombran, colapsan y reordenan; mover tarea entre secciones actualiza `column_id` (optimista, undo 10 s).
- **UI-604** (→ RF-208): selección múltiple con las 6 acciones masivas aplicando a N tareas con un solo request `POST /tasks/batch`.
- **UI-605** (→ RF-306): "Archivar completadas" y "vaciar papelera" con confirmación y conteo.
- **UI-606**: con 5.000 tareas en la lista, scroll fluido (virtualización) y búsqueda contextual `?q=` sin lag de tecleo (debounce 150 ms).

---

## 10. Kanban y Timeline (V1)

### 10.1 Kanban (`?view=kanban`, RF-1002)

- Columnas = secciones de la lista **[verificado en TickTick: columnas master-ia/tu-rugby/picos-26 con contador y botón +]**. Cabecera: nombre, contador, `＋` (crea en esa columna), menú (renombrar, WIP limit, colapsar, borrar).
- Dentro de cada columna, grupos plegables por fecha (Vencidas / Sin fecha / Completadas) **[verificado]**; alternativa de agrupación por etiqueta/prioridad/asignado (V2 asignado).
- Tarjeta (`TaskCard`): checkbox mini con color de prioridad, título 2 líneas, pills de etiqueta, fecha (roja si vencida), iconos de adjuntos/recurrencia/checklist **[verificado]**.
- Drag & drop entre columnas actualiza `column_id`; entre grupos de fecha, reprograma; WIP limit opcional por columna (extensión propia): al superarlo, la cabecera pasa a `--warning` con tooltip "límite N superado" (no bloquea).
- Progreso por columna: x completadas / total con `ProgressBar` sutil.
- Aceptación: **UI-701** (→ RF-1002): drag entre columnas persiste y se revierte con undo; WIP limit visible; agrupación alternativa funciona; vista recordada por lista (`view_mode`).

### 10.2 Timeline (`?view=timeline`, RF-1003)

- Eje horizontal día/semana/mes (zoom con rueda+Ctrl o botones); hoy marcado con línea acento.
- Tareas con fecha como barras: inicio-fin según `start_date`/`due_date` o `duration_minutes`; color de lista; etiqueta de título dentro si cabe.
- Arrastrar barra = mover en el tiempo; arrastrar bordes = cambiar duración/inicio-fin (RF-602); clic en hueco = crear con esa fecha; panel lateral "Sin planificar" con tareas sin fecha, arrastrables al timeline.
- Vencidas: borde `--danger`. Fines de semana sombreados `--surface-2`.
- Aceptación: **UI-702** (→ RF-1003): mover/redimensionar persiste fechas y duración; crear en hueco; sin- planificar arrastrable; zoom conserva la fecha bajo el cursor.

---

## 11. Detalle de tarea (`/task/{id}` o `?task={id}`) — MVP

Mismo componente `TaskDetail` en panel derecho (escritorio) y hoja (móvil). Referencia: panel derecho de TickTick **[verificado: checkbox+fecha arriba, título, contenido con comandos `/`, pills de etiqueta con +, barra inferior con lista y menú]**.

### 11.1 Estructura

1. **Barra superior**: checkbox de completar, fecha (popover DatePicker, muestra relativa "hace 3 meses, 18 jul" con la absoluta al hover **[verificado]**), a la derecha: fijar (pin), prioridad (bandera con el color), menú `...` (duplicar, convertir a nota, mover, copiar enlace, borrar, historial).
2. **Título**: textarea autoexpandible, serif `--fs-lg`; edición inline.
3. **Propiedades rápidas** (fila de chips editables): fecha, prioridad, etiquetas (con `＋`), lista, recordatorios. Cada chip abre su popover.
4. **Checklist** (RF-205a): items con checkbox, reordenables, "＋ Añadir ítem"; cada ítem admite fecha propia; progreso x/y arriba. Las líneas `- [ ]` del contenido pueden convertirse a items (acción "Convertir checklist") y viceversa (RF-202).
5. **Subtareas** (RF-205b): sección propia con `TaskRow` compactas, crear inline; pueden vivir en otra lista que el padre y se respetan ambos ids; al completar el padre con hijas activas, diálogo (RF-206).
6. **Contenido Markdown** (RF-202): editor con previsualización (pestañas Escribir/Vista previa o split en ancho), toolbar mínima (negrita, lista, checklist, enlace, código) y comandos `/` (como TickTick **[verificado: "type / for commands"]**): fecha, prioridad, etiqueta, tabla, código, cita, adjunto. Links clicables.
7. **Adjuntos** (RF-203): dropzone (arrastrar archivos al panel), miniaturas inline de imágenes, lista de archivos con tamaño y descarga; límite 25 MB con error claro.
8. **Recordatorios**: lista de recordatorios de la tarea con tipo (relativo/absoluto), canal y `×`; "＋ Añadir recordatorio" (RF-801); toggle "constante" (RF-803); snooze desde la notificación (RF-804, §14).
9. **Recurrencia**: resumen en lenguaje natural ("cada lunes · desde fecha de vencimiento") con editor (§11.2) (RF-702).
10. **Actividad** (RF-209): historial colapsable con cambios y actor (tú / nombre del token PAT / automatización).

### 11.2 Editor de recurrencia (RF-701/702)

Popover/página según complejidad. Constructor en español: frecuencia (diaria, semanal [selector de días], mensual [día del mes u "primer lunes"], anual, personalizada con intervalo), fin (nunca, fecha, N ocurrencias), origen (desde vencimiento / desde completado, RF-703). Vista previa de las próximas 5 fechas calculadas por el backend (`/tasks/{id}/occurrences`). Modo avanzado: textarea con la RRULE y validación en vivo. Nunca se expone RRULE por defecto.

### 11.3 Editar una ocurrencia (RF-705)

Al editar fecha/hora de una recurrente, diálogo: "Solo esta ocurrencia" (crea `exdate` y desvincula) / "Toda la serie". Completar una ocurrencia genera la siguiente sin diálogo (regla 6.1).

### 11.4 Criterios de aceptación

- **UI-801** (→ RF-201…210): todos los campos de 5.1 editables desde el detalle; guardado automático con indicador "Guardado ✓" y reintento en error.
- **UI-802** (→ RF-701–706): construir una recurrencia compleja ("cada primer lunes, 6 veces") sin escribir RRULE; preview de fechas correcta incluidos cambios de horario (zona de captura).
- **UI-803** (→ RF-206): completar padre con hijas activas pregunta; la opción elegida es recordada por sesión ("aplicar a todas").
- **UI-804** (→ RF-209): la actividad muestra quién/qué cambió, incluido el nombre del token si vino por API (auditoría visible).
- **UI-805**: el detalle carga en <300 ms con cache caliente y muestra skeleton propio si no.

---

## 12. Smart lists y filtros (`/smart/{key}`, `/filter/{id}`) — MVP

### 12.1 Smart lists (RF-901)

Vistas de solo configuración: cada una es una vista lista normal (§9) con cabecera propia y sin inline add fuera de Inbox (crear desde una smart list crea en Inbox, salvo "Hoy"/"Mañana" que asignan esa fecha). Conjunto: Hoy, Mañana, Próximos 7 días, Todas, Bandeja, Sin fecha, Añadidas recientemente, Completadas, Papelera (y Asignadas a mí en V2). "Completadas" agrupa por fecha de completado descendente y permite "descompletar". "Papelera": restaurar individual/masivo, vaciar con confirmación, aviso de purga a los 30 días (regla 6.2). Activación/orden en Ajustes → Smart lists (§20.5).

### 12.2 Vista de filtro (RF-903)

Un filtro es una vista de primera clase: cabecera con icono/color/nombre, contador, mismas vistas (lista/kanban/timeline) y acciones que una lista, menú con editar, duplicar, fijar, exportar iCal (V1, RF-1104) y borrar. La evaluación es siempre backend (RF-904).

### 12.3 Editor de filtros (RF-902)

Modal grande (720 px) u hoja en móvil, con dos modos:

- **Normal**: filas de condición `campo · operador · valor` con autocompletado (listas, etiquetas, fechas relativas, prioridades, palabra clave, estado). Combinador global Y/O. Sin anidación.
- **Avanzado**: grupos anidados un nivel con combinador por grupo (gramática 5.7). Vista del JSON solo lectura opcional.
- **Vista previa obligatoria** (RF-902): panel lateral/inferior que ejecuta `POST /filters/preview` con debounce y muestra hasta 50 tareas que casan, con contador total. Guardar deshabilitado hasta que la preview ha cargado sin error.
- Al guardar: nombre, icono, color, fijar en sidebar.

Aceptación: **UI-901** (→ RF-902/904): un filtro "(lista = Trabajo O etiqueta = curro) Y fecha = próximos 7 días Y prioridad ≥ media" se construye en modo avanzado, la preview coincide con lo que luego muestra la vista, y evalúa igual llamando a la API (mismo resultado, mismo orden).

---

## 13. Calendario (`/calendar/{view}`) — V1 (RF-1101–1105)

Referencia directa: el calendario de TickTick **[verificado: mes con semanas W40-W44, pill de tareas con hora, "+9" de overflow, eventos Google de otro color, spans multi-día, sidebar colapsada a rail]**.

### 13.1 Layout

Full width (la sidebar se colapsa a rail de iconos, como en TickTick). Cabecera: botón `＋` (crear con fecha en el día seleccionado), selector de vista (día, semana, multi-día, multi-semana, mes, año, agenda — RF-1101), navegación ‹ Hoy ›, menú `...` (suscripciones, feeds, mostrar/ocultar completadas, fines de semana).

### 13.2 Comportamiento

- Tareas con fecha: all-day en la franja superior; con hora en su posición; color de lista **[verificado: pills con hora a la derecha]**; overflow "+N" por celda con popover (RF-1102).
- Drag & drop entre celdas replanifica (RF-1102); en semana/día, arrastrar verticalmente cambia hora; resize cambia duración.
- Clic en celda/hueco: crear tarea con esa fecha (inline mini-popover, no la hoja completa).
- Eventos externos (iCal/Google, RF-1103): color de su calendario, icono de candado en tooltip ("solo lectura · Google Calendar"), no editables ni arrastrables.
- Clic en tarea: detalle en popover con "Abrir completo" (en calendario no abrimos el panel entero para no perder el contexto de mes).
- Vista año: 12 minimeses con puntos de densidad por día. Vista agenda: lista cronológica infinita.
- Suscripciones y feeds se gestionan en Ajustes (§20.6); el feed iCal propio por lista/filtro (RF-1104) muestra su URL secreta con botón copiar y "regenerar" (revoca la anterior, confirmación).

### 13.3 Criterios de aceptación

- **UI-1001** (→ RF-1101/1102): las 7 vistas funcionan; mover una tarea en mes persiste la fecha; crear en hueco crea con fecha.
- **UI-1002** (→ RF-1103): evento externo visible con su color, no editable (intento de drag no hace nada y lo explica).
- **UI-1003** (→ RF-1104): el feed iCal de un filtro se crea, se copia y al regenerarlo la URL anterior deja de servir.
- **UI-1004**: con 300 eventos en mes, render <1 s y celdas estables al arrastrar.

---

## 14. Matriz de Eisenhower (`/matrix`) — V1 (RF-1004)

Referencia **[verificado: 4 cuadrantes con color, grupos internos Overdue/Later/No Date, menú por cuadrante]**.

- Cuadrantes: Urgente e Importante (`--danger`), No urgente e Importante (`--warning`), Urgente y No importante (`--info`), Ni urgente ni importante (`--success`). Colores suaves de fondo (5 % del semántico).
- Reglas por defecto (urgente = vencida o vence en 24 h; importante = prioridad alta/media) visibles en la cabecera de cada cuadrante con tooltip; editables en Ajustes → Matriz con la gramática de filtros (5.7).
- Drag & drop entre cuadrantes aplica la regla destino: muestra un resumen del cambio antes de soltar ("→ prioridad alta, fecha hoy") y undo tras soltar.
- Cada cuadrante agrupa por fecha (Vencidas/Más tarde/Sin fecha) con cabeceras plegables **[verificado]** y límite de filas con "ver todas" (abre el cuadrante como vista lista filtrada).
- Aceptación: **UI-1101** (→ RF-1004): arrastrar una tarea entre cuadrantes actualiza prioridad/fecha según la regla con undo; reglas editables se aplican al instante; los contadores cuadran con los filtros equivalentes.

---

## 15. Hábitos (`/habits`) — MVP (RF-1301–1305)

Referencia **[verificado: tira semanal con círculos, tarjeta de hábito con icono, racha y total, detalle con 4 stat cards + progreso de meta + calendario-mapa de calor]**.

### 15.1 Vista principal

- Cabecera "Hábitos", toggle de vista (tarjetas / tabla semanal), `＋`, menú (ordenar, archivados, estadísticas globales).
- **Tira semanal** arriba: 7 días con anillo de cumplimiento del día (proporción de hábitos del día hechos) **[verificado patrón]**; hoy resaltado.
- Tarjetas de hábito (`HabitCard`) agrupadas por momento del día (Mañana/Tarde/Noche, como el "Night" de TickTick **[verificado]**) o planas según ajuste: icono/color, nombre, racha actual y mejor racha, los 7 círculos de la semana (relleno = check-in completo, medio = parcial, hueco = pendiente, tachado = no programado).
- **Check-in rápido**: clic en el círculo de hoy = +1 (RF-1302); con contador (agua 8/día) muestra `3/8` y anima el anillo; pulsación larga o clic derecho: quitar check-in o añadir nota del día.
- EmptyState: "Empieza con un hábito pequeño" + sugerencias (§15.4).

### 15.2 Alta y edición (RF-1301, "menos de un minuto")

Hoja/modal con lo mínimo obligatorio arriba: nombre, icono+color (selector con preview), objetivo (veces por día/semana), días. Avanzado colapsado: recordatorio diario a hora fija, nota de motivación (se muestra al hacer check-in), fecha de inicio. "Guardar" crea y vuelve; "Guardar y crear otro" para rachas de configuración. Sugerencias de una pulsación (§15.4).

### 15.3 Detalle (`/habits/{id}`, RF-1303)

Panel/página con: stat cards (racha actual, mejor racha, % cumplimiento 30 días, total check-ins) **[verificado patrón]**, barra de meta si el hábito tiene objetivo de largo plazo (17/100), **mapa de calor anual** (cuadrícula tipo GitHub con intensidad por count), calendario mensual navegable **[verificado]**, historial de notas, menú (editar, pausar, archivar, borrar con confirmación). Botón de check-in grande.

### 15.4 Sugerencias iniciales (adopción fácil, spec 9.13)

Al primer uso o desde el EmptyState: 6 plantillas de una pulsación (Beber agua 8/día, Leer 20 min, Ejercicio, Meditar 10 min, Dormir antes de las 0:00, Sin pantallas 1 h) que crean el hábito con icono/color/recordatorio razonables y abren la edición por si quiere ajustar.

### 15.5 Recordatorios de hábito

Notificación a la hora fija con acción "Check-in" directa desde la push (RF-1301); centro de preferencias en §20.4.

### 15.6 Criterios de aceptación

- **UI-1201** (→ RF-1301): alta completa de un hábito en <1 min con 3 campos obligatorios; sugerencia de una pulsación lo crea editable.
- **UI-1202** (→ RF-1302): check-in con contador actualiza racha y mapa de calor al instante (optimista); deshacer check-in recalcula.
- **UI-1203** (→ RF-1303): las estadísticas del detalle coinciden con `GET /habits/{id}/stats` (racha, mejor, %, heatmap).
- **UI-1204** (→ RF-1305): al hacer check-in se emite el evento (visible en el log de la automatización "si fallo 3 días…" cuando exista, V1).

---

## 16. Notas (`/list/{id}` con `kind=NOTE`) — V1 (RF-1401–1403)

- Una lista de notas usa la misma vista lista pero con tarjetas de nota: título + extracto de 3 líneas, sin checkbox; orden manual; etiquetas compartidas.
- Detalle de nota: mismo `TaskDetail` sin fecha/prioridad (ocultos, no eliminados del modelo), editor Markdown a ancho completo, adjuntos.
- Conversión nota ↔ tarea desde el menú (RF-1402) conservando contenido, etiquetas y adjuntos.
- Sticky notes (RF-1403, V1 tardía): ventana `/sticky` minimalista siempre encima solo si el SO lo permite; en PWA queda como nota fijada en el dashboard. Marcado como diferencia conocida frente a escritorio nativo.
- Aceptación: **UI-1301** (→ RF-1401/1402): crear/editar/convertir nota sin perder contenido ni adjuntos; búsqueda las encuentra (§17).

---

## 17. Búsqueda global y paleta de comandos — MVP (RF-1501, RF-1502)

### 17.1 Paleta (`Ctrl/Cmd+K` o `/`)

Overlay centrado (640 px, top 15 %) con input, dos modos:

1. **Buscar** (default): resultados instantáneos agrupados por tipo (Tareas, Notas, Listas, Etiquetas, Hábitos) con resaltado del match y contexto (lista, fecha) **[paridad TickTick: `Go to Search /`]**; `Enter` abre el primero, flechas navegan, `Tab` cambia de grupo; "Ver todos" lleva a `/search?q=`.
2. **Comandos** (prefijo `>` o icono): "Nueva tarea", "Ir a Hoy/Inbox/lista…", "Cambiar tema", "Alternar densidad", "Abrir ajustes de…", "Sincronizar ahora", comandos de plugins en V2 (12.2). Muestra el atajo a la derecha (`Kbd`).

Búsqueda inline con filtros (`in:compra`, `#casa`, `priority:high`, `done:true`) con autocompletado de operadores (RF-1501). Recientes (últimas 8 búsquedas/comandos) al abrir vacío.

### 17.2 Página `/search?q=`

Resultados completos paginados, mismos grupos, con filtros laterales (tipo, lista, etiqueta, fecha) y orden (relevancia, fecha). Cada resultado abre el detalle conservando `?q=` para volver.

### 17.3 Criterios de aceptación

- **UI-1401** (→ RF-1501): búsqueda "informe in:trabajo #curro" devuelve resultados filtrados en <300 ms (100k tareas, sección 16) con match resaltado en título y contenido.
- **UI-1402** (→ RF-1502): todos los comandos listados ejecutan su acción; la paleta es operable solo con teclado y anuncia resultados a lectores de pantalla (`aria-live`).

---

## 18. Dashboard "jardín digital" (`/dashboard`) — V1 (RF-2101–2105)

### 18.1 Layout

Parrilla de 12 columnas (6 en tablet, 4 en móvil) con widgets arrastrables y redimensionables (grid drag & drop, RF-2103). Cabecera: "Jardín digital", selector de vista guardada ("Hoy", "Semana"… 5.18), botón "Editar layout" (entra en modo edición: bordes punteados, asas, catálogo), periodo global (hoy/semana/mes) que los widgets pueden heredar.

### 18.2 Catálogo inicial de widgets (RF-2102)

| Widget | Contenido | Tamaños |
|---|---|---|
| Completadas | hoy/semana con tendencia (↑↓ vs periodo anterior) | 2×2, 4×2 |
| Vencidas y próximas | contador vencidas + barras próximos 7 días | 4×2 |
| Flujo | creadas vs completadas (línea) | 4×2, 6×4 |
| Hábitos | anillos de hoy + racha agregada + mini heatmap | 4×2, 4×4 |
| Carga por lista/etiqueta | top 8 barras horizontales | 4×4 |
| Calendario | próximos 5 eventos (propios + externos) | 4×2 |
| Integraciones | actividad por token/agente (MCP/Telegram/Drive): últimos usos | 4×2 |
| Focus (V2) | tiempo de foco y pomodoros | 4×2 |

Cada widget: título, KPI principal `--fs-2xl` serif, sparkline/barra, "ver más" que navega a la vista filtrada correspondiente. Estados propios: loading (skeleton del widget), error (reintento solo del widget), sin datos (copy breve, no widget vacío roto).

### 18.3 Criterios de aceptación

- **UI-1501** (→ RF-2103/2104): reordenar/redimensionar persiste en `GET/PATCH /me/dashboard`; cada widget pide solo `dashboard/data?widget=…`; un agente lee el mismo KPI por API y coincide.
- **UI-1502**: modo edición usable con teclado (mover con flechas) y en móvil (arrastre con pulsación larga).

---

## 19. Reporte semanal y revisiones asistidas — V1 (RF-2201–2204, RF-2301–2303)

### 19.1 Reporte semanal (`/reports/weekly`, `/reports/weekly/{semana}`)

- Índice: lista de semanas con mini-resumen (KPIs clave) y acceso al detalle.
- Detalle: cabecera de semana, bloques: completadas vs creadas (gráfico), vencidas arrastradas, hábitos (% y rachas rotas), comparativa con la semana anterior y **1-3 observaciones accionables** en tarjetas (RF-2201). Tono honesto visible en el copy: sin coletillas motivacionales vacías; si flojeó, lo dice con números.
- Ajustes del reporte (día/hora, canales, tono, secciones) en Ajustes (§20.4) con vista previa de cómo habría quedado la semana pasada con otra config (RF-2202).

### 19.2 Revisión semanal guiada (`/review/weekly`, RF-2302)

Recorrido por pasos (wizard ligero, no modal bloqueante): 1) Vencidas → replanificar/algún día/borrar; 2) Sin fecha → asignar o dejar; 3) Listas estancadas (X días sin movimiento) → acciones; 4) Hábitos en riesgo (racha rota o <50 % esta semana). Cada paso lista candidatas del backend (`GET /review/weekly`) con acciones rápidas en línea y contador de progreso "paso 2 de 4 · 3 de 12". Salir guarda el progreso. Al final: resumen de lo decidido + enlace al reporte.

### 19.3 Criterios de aceptación

- **UI-1601** (→ RF-2201/2204): el reporte del histórico coincide con el `payload` de la API; las observaciones son generadas por reglas y enlazan a las tareas/hábitos concretos.
- **UI-1602** (→ RF-2302): la revisión se completa con teclado, persiste al salir y las acciones aplican de verdad (replanificar cambia la fecha).

---

## 20. Ajustes (`/settings/...`) — MVP→V2

Layout: subnavegación izquierda (como el modal de ajustes de TickTick **[verificado: Account/Features/Smart List/Notifications/Date & Time/Appearance/…]**) + contenido; en móvil, lista de secciones que navega a subpáginas. Guardado automático con indicador; las secciones marcadas llegan en su fase.

### 20.1 Cuenta (`/settings/account`) — MVP

Perfil (nombre, avatar, zona horaria con aviso de que no reescribe tareas, RF-604), email, cambiar contraseña, sesiones activas con revocación, 2FA TOTP (V1: QR + códigos de respaldo), exportar mis datos (RF-1703) y borrar cuenta (ConfirmDialog fuerte, escribir email).

### 20.2 Apariencia (`/settings/appearance`) — MVP

Tema Claro/Oscuro/Auto (UI-D4), densidad (UI-D6), color de acento (6 preestablecidos + el índigo default), inicio de semana, formato de fecha/hora, idioma (es/en, UI-D1). Vista previa en vivo de cada cambio.

### 20.3 Captura y NLP (`/settings/capture`) — MVP

Idioma del parser (es/en/auto), lista por defecto de captura (Inbox/última usada), comportamiento de `^lista` inexistente, email-to-task: dirección actual enmascarada, botón copiar, **regenerar** (revoca la anterior, confirmación) (RF-105, sección 15 de la spec).

### 20.4 Notificaciones (`/settings/notifications`) — MVP/V1

Centro de preferencias por tipo (sección 14 de la spec): recordatorios de tareas (push/email), daily reminder con hora (RF-805), hábitos, fin de pomodoro (V2), automatizaciones (V1), reporte semanal (día/hora/canales/tono/secciones, RF-2202). Horario de silencio (default 22:00-08:00) con excepción "críticos". Botón "Enviar prueba" por canal. Estado del permiso push del navegador con guía si está denegado.

### 20.5 Smart lists y campos (`/settings/smart-lists`) — MVP

Activar/desactivar y reordenar smart lists (RF-901), contadores en sidebar on/off (RF-305), reglas de la matriz Eisenhower (V1, §14).

### 20.6 Calendario (`/settings/calendar`) — V1

Suscripciones iCal (añadir URL, color, estado del último sync, errores), conexión Google Calendar (estado, calendarios elegidos) (RF-1103), feeds iCal propios por lista/filtro con regeneración (RF-1104).

### 20.7 Tokens de acceso (PAT) y MCP (`/settings/tokens`) — MVP (RF-2001/2002)

La pantalla clave para los agentes de Pablo:

- Lista de tokens: nombre (un token por agente: "Cursor", "ChatGPT", "Instinct"…), scopes como chips, creado, **último uso** (fecha + IP), estado; menú: renombrar, cambiar scopes, **revocar** (efecto inmediato, confirmación).
- Crear token (wizard de 2 pasos): 1) nombre + scopes con checkboxes agrupados por recurso (tasks, lists, tags, filters, habits, notes, calendar, reminders, focus, webhooks, automations, profile, backup) y toggle read/write por recurso; 2) **el token se muestra una sola vez** con botón copiar y aviso de que no se volverá a mostrar (se almacena hasheado, sección 15).
- Actividad por token (`/settings/tokens/{id}`): log de operaciones (qué hizo, cuándo, endpoint) — `GET /me/tokens/{id}/activity` (10.1/15).
- Bloque MCP: URL del servidor MCP, instrucciones de conexión copiables para Cursor/Claude/ChatGPT (snippet JSON de config), mismo sistema de tokens (RF-2001).

### 20.8 Integraciones (`/settings/integrations`) — V1

Telegram (vincular bot con código, canales de notificación) (RF-2003), Google Drive (adjuntos + destino de backups) (RF-2005), email-to-task (ver 20.3). Cada integración muestra estado, scopes y desconexión.

### 20.9 Automatizaciones y webhooks (`/settings/automations`, `/settings/webhooks`) — V1 (sección 11)

- Automatizaciones: lista de reglas (activa/pausada, trigger, último resultado), editor when→if→then con la gramática de filtros para el "if", catálogo de acciones, **probar con una tarea real** (dry-run que muestra qué haría), log de ejecuciones por regla.
- Webhooks: endpoints (URL, eventos suscritos con checkboxes del catálogo, filtro opcional), secreto con mostrar/regenerar, entregas recientes (código HTTP, reintentos), botones "Ping" y "Reenviar" (11.2).

### 20.10 Datos y backups (`/settings/data`) — MVP/V1

Export JSON completo (descarga, RF-1703), export CSV por lista, import CSV con mapeo de columnas (RF-1702, V1), estado del backup diario (último, tamaño, destino remoto, última prueba de restauración semanal con ✓/✗ y fecha, RF-1704), restaurar desde archivo (flujo guiado con advertencia de sustitución).

### 20.11 Plugins (`/settings/plugins`) — V2

Instalados con permisos declarados, instalar desde git/paquete, revocar permisos. Marcado V2.

### 20.12 Atajos (`/settings/shortcuts`) — V1

La tabla completa de §21, con reasignación de atajos no fijos (como el "Set shortcut" de TickTick **[verificado]**) y "Restablecer".

Aceptación de ajustes: **UI-1701** (→ RF-2002): crear un PAT con scopes `tasks:read tasks:write`, usarlo contra la API y ver su último uso y actividad reflejados; revocarlo corta el acceso al instante (siguiente request 401). **UI-1702** (→ RF-1704): la pantalla de datos muestra último backup y última restauración probada con fecha real.

---

## 21. Mapa completo de atajos — V1 (RF-1901)

Auditoría de paridad con TickTick (verificado en su app web, Ajustes → Atajos, 17 oct 2025). Vistas de TickTick sin equivalente en tick-tack-done (Group chats, Time Blocking, Pomodoro, Search Page) se omiten.

### 21.1 General

| Acción | Atajo |
|---|---|
| Guardar (edición en curso) | `Ctrl/Cmd+S` |
| Sincronizar ahora | `.` |
| Cancelar / cerrar | `Esc` |
| Deshacer | `Ctrl/Cmd+Z` |
| Rehacer | `Ctrl/Cmd+Shift+Z` |
| Imprimir | `Ctrl/Cmd+P` |
| Modo foco (vista sin distracciones) | `Ctrl/Cmd+Shift+P` |
| Paleta de comandos | `Ctrl/Cmd+K` |
| Buscar | `/` |
| Ayuda de atajos (overlay) | `?` |

### 21.2 Tareas (en cualquier lista)

| Acción | Atajo |
|---|---|
| Nueva tarea | `Tab+N` (o `N` con la lista enfocada) |
| Nueva tarea debajo | `Enter` (con tarea seleccionada) |
| Nueva subtarea | `Shift+Enter` |
| Expandir/colapsar subtareas | `Tab+E` |
| Completar | `Tab+M` |
| Fijar | `Tab+P` |
| Borrar | `Ctrl/Cmd+Delete` |
| Asignar fecha | `Tab+D` |
| Quitar fecha | `Tab+0` |
| Hoy / Mañana / Semana próxima | `Tab+1` / `Tab+2` / `Tab+3` |
| Prioridad 0-3 | `Alt+0…3` |

### 21.3 Vistas y navegación

| Acción | Atajo |
|---|---|
| Lista / Kanban / Timeline | `V` luego `L` / `K` / `T` |
| Ajustes | `G,S` |
| Todas las tareas | `G,A` |
| Hoy | `G,T` |
| Próximos 7 días | `G,R` |
| Notas | `G,N` |
| Matriz Eisenhower | `G,M` |
| Inbox | `G,I` |
| Calendario | `G,C` |
| Abandono | `G,W` |
| Papelera | `G,B` |
| Listas y etiquetas (área de listas) | `G,G` |
| Calendario: día/semana/mes/año/agenda | `D` `W` `M` `Y` `A` (o `1…5`) |
| Calendario: volver a hoy | `T` |

### 21.4 Quick-add inline

`*` fecha · `!` prioridad · `#` etiqueta · `~`/`^` lista · `@` asignado. Enter confirma, Enter con campo vacío crea otra tarea debajo.

Aceptación: **UI-1801** (→ RF-1901): la tabla anterior es operativa con la app sin ratón: navegar, capturar, completar, replanificar, cambiar de vista y buscar; `?` muestra el overlay fiel a la tabla; los atajos se desactivan dentro de inputs excepto `Esc` y `Ctrl/Cmd+Enter`.

---

## 22. Responsive, gestos y primer uso

### 22.1 Responsive

- **Móvil (<768 px)**: barra inferior con 5 destinos (Hoy, Buscador, +, Calendario, Menú). El resto vive en "Menú". Listas a una columna; swipe derecha completar, swipe izquierda acciones (fecha, mover, borrar); detail panel a pantalla completa; add-bar fija abajo; FAB solo donde no hay add-bar (notas, hábitos). Kanban con scroll horizontal por columnas; calendario mes → vista agenda en móvil; matriz Eisenhower se apila 2×1 con scroll.
- **Tablet (768-1024)**: sidebar colapsable a raíz de iconos; detail como overlay.
- **Desktop (>1024)**: tres paneles con sidebar redimensionable (mín 200 px) y detail 400-520 px.

### 22.2 Gestos y offline

Offline: todo readable; acciones de escritura se encolan con indicador "pendiente de sincronizar" en la tarea (punto gris) y en el toast de conexión; al volver online se sincroniza con feedback (RF-1801). La PWA funciona instalada (share target ya implementado).

### 22.3 Primer uso (onboarding en contexto, no tour)

- Primera vez en Hoy vacío: CTA "Crea tu primera tarea" + sugerencia de probar la captura rápida (`Ctrl+Q`).
- Primera captura: toast discreto "Pulsa `.` para forzar sincronización · `?` para atajos".
- Primer acceso a una vista aún no implementada en el MVP: la vista no aparece en el sidebar (regla UI-D7); no se muestran placeholders.

### 22.4 Criterios de aceptación

- **UI-1901** (→ RF-1801/1803): en móvil 375 px no hay scroll horizontal; la captura es alcanzable con una mano; swipe completa y deshacer funciona.
- **UI-1902** (→ RF-1801): con red caída, completar una tarea la marca pendiente de sync y al reconectar desaparece el indicador y el dato persiste en API.

---

## 23. Accesibilidad, i18n, notificaciones

### 23.1 Accesibilidad (objetivo WCAG 2.1 AA)

- Contraste ≥ 4.5:1 en texto (los tokens de §3.2 lo cumplen en ambos temas; validar con CI de contraste).
- Navegación con teclado completa (§21) con foco visible (`outline` 2 px acento, nunca `outline: none` sin sustituto).
- Landmarks y etiquetas: `header`/`nav`/`main`, `aria-label` en botones-icono, `aria-live="polite"` en toasts y en la paleta, `aria-expanded` en disclosure, roles de `listbox`/`option` en selects, `aria-selected` en tabs, skip link "Saltar al contenido".
- `prefers-reduced-motion`: desactiva transiciones no esenciales.
- Hit targets ≥ 44×44 px en móvil.

### 23.2 i18n

- Namespace nuevo `views.*` para todo lo nuevo, es/en; claves en inglés estable; nada de texto hardcodeado en componentes (regla de PR).
- Fechas, números y relativos con Intl y `date-fns` según locale (RF-605): "hoy/mañana" localizados; formato de fecha configurable en Ajustes.

### 23.3 Notificaciones en la app

- Centro de notificaciones en la raíz (campana con badge) para: reporte semanal listo, recordatorios push fallidos, errores de integraciones, entregas de webhook fallidas (V1). Sin badge rojo permanente: solo no leídas.
- Preferencias en §20.4; horario de silencio respetado salvo críticos.

### 23.4 Criterios de aceptación

- **UI-2001**: recorrido Hoy → captura → detalle → completar usable solo con teclado y lector de pantalla (NVDA/VoiceOver) sin trampas de foco; Lighthouse a11y ≥ 95.
- **UI-2002** (→ RF-605): cambiar idioma a inglés traduce toda la UI nueva sin claves faltantes en consola.

---

## 24. Matriz de trazabilidad UI → RF

| Criterio | RF cubiertos | Vista |
|---|---|---|
| UI-0101 | RF-101, RF-109, RF-113, RF-1802, RF-604 | Captura rápida |
| UI-0201, UI-0202 | RF-601, RF-603, RF-604, RF-802, RF-803 | Hoy |
| UI-0301 | RF-114 | Bandeja de entrada |
| UI-0401, UI-0402, UI-0403, UI-0404 | RF-201, RF-203, RF-204, RF-206, RF-207, RF-401, RF-402, RF-405, RF-406, RF-504 | Lista / Kanban / Timeline |
| UI-0501, UI-0502, UI-0503 | RF-103, RF-112, RF-205, RF-208, RF-701, RF-702, RF-703, RF-705, RF-706 | Detalle de tarea |
| UI-0601, UI-0602 | RF-301, RF-302, RF-305, RF-1001 | Sidebar |
| UI-0701, UI-0702 | RF-405, RF-406, RF-901, RF-902, RF-903, RF-904 | Smart lists / filtros |
| UI-0801, UI-0802 | RF-302, RF-303, RF-304, RF-1701 | Papelera / Actividad |
| UI-0901, UI-0902, UI-0903 | RF-1101, RF-1102, RF-1103, RF-1104, RF-1105 | Calendario |
| UI-1001, UI-1002 | RF-1201, RF-1202 | Matriz Eisenhower |
| UI-1101 | RF-1201 | Abandono |
| UI-1201, UI-1202, UI-1203 | RF-501, RF-502, RF-503, RF-505, RF-806 | Hábitos |
| UI-1301 | RF-601 (notas) | Notas |
| UI-1401, UI-1402 | RF-1501, RF-1502 | Búsqueda / paleta |
| UI-1501, UI-1502 | RF-2101, RF-2102, RF-2103, RF-2104, RF-2105 | Dashboard |
| UI-1601, UI-1602 | RF-2201, RF-2202, RF-2204, RF-2301, RF-2302, RF-2303 | Reportes / revisión |
| UI-1701, UI-1702 | RF-2001, RF-2002, RF-2005, RF-1703, RF-1704 | Ajustes (tokens, datos) |
| UI-1801 | RF-1901 | Atajos |
| UI-1901, UI-1902 | RF-1801, RF-1803 | Responsive / offline |
| UI-2001, UI-2002 | RF-604, RF-605, RF-805 | Accesibilidad / i18n |

---

## 25. Anexo A — Notas de paridad con TickTick (verificado en la app web de TickTick, 17 oct 2025)

Hallazgos de la exploración de referencia (cuenta propia, solo lectura) que este documento adopta o decide conscientemente:

1. **Layout de 3 paneles** (rail de iconos / sidebar / contenido) con rail azul de ~48 px. Adoptado como variante de colapso (§4.5).
2. **Hoy agrupada por prioridad** con contadores de sección; inline-add "Añadir tarea a 'inbox'" al pie. Adoptado como default (UI-D2).
3. **Detalle de tarea**: fecha con formato relativo "Hoy, 17 oct 14:00", contenido con comandos `/`, barra inferior con lista/etiqueta. Adoptado (§11).
4. **Kanban**: columnas = secciones, con grupos Vencidas/Sin fecha/Completadas en vista lista. Adoptado (§10.2).
5. **Calendario mes a ancho completo** con números de semana (W1…W52), pills con hora, "+1" de overflow, spans multi-día, eventos externos (Google) en otro color. Adoptado (§13).
6. **Hábitos**: tarjeta con racha y strip semanal; detalle con 4 stat cards (racha actual, mejor racha, total, tasa) + objetivo progreso + heatmap mensual. Adoptado (§15).
7. **Ajustes** como modal con navegación lateral (Account/Features/Smart List/Notifications/Date & Time/Appearance/AI/More/Integrations/Collaborate/Shortcuts/About). Adoptado como página con subnavegación (§20).
8. **Matriz Eisenhower**: cuadrantes coloreados (rojo/ámbar/azul/gris), tarjetas con checkbox, grupos Vencidas/Later/Sin fecha. Adoptado (§14).
9. **Atajos**: mapa completo capturado y adoptado salvo vistas sin equivalente (§21).
10. **Diferencias deliberadas**: sin IA ni pomodoro en el MVP; estilo editorial serif propio en vez del sans/plano de TickTick (UI-D5); multi-completado/deshacer igual pero con nuestros toasts; reporte semanal y revisión guiada no existen en TickTick (diseño propio).

---

## 26. Anexo B — Resumen de alcance por fase

| Vista | MVP | V1 | V2 |
|---|---|---|---|
| Captura rápida, Hoy, Bandeja, Lista, Papelera, Actividad, Detalle | ✔ | mejoras | |
| Sidebar completa, Ajustes base, tokens PAT/MCP, notificaciones | ✔ | | |
| Notas | ✔ básicas | | |
| Kanban, Timeline, Calendario (incl. feeds/suscripciones), búsqueda/paleta, filtros/smart lists, Eisenhower, Abandono, atajos | | ✔ | |
| Hábitos (fase 2.1, siguiente fase cerrada), Dashboard, reporte semanal, revisión guiada, automatizaciones/webhooks, integraciones | | ✔ | |
| Foco (pomodoro), estadísticas avanzadas, plugins, compartir listas | | | ✔ |

---

*Fin del documento. Las decisiones marcadas como UI-Dx (§1.2) deben confirmarse con el product owner antes de implementar; el resto del documento es normativo para las fases indicadas.*
