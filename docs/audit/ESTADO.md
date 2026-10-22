# Estado de la auditoría ttd-codex (TTD-AUD-01…74)

Fuente: `docs/spec/ttd-codex/ttd-codex-especificacion-unica.md`  
Worktree: `todo-worktrees/ttd-aud-fase-0` · Rama: `fix/ttd-aud-fase-0`  
Base: `origin/main` @ arranque de la rama.

| ID         | Fase | Estado              | PR  | Notas                                                                                           |
| ---------- | ---- | ------------------- | --- | ----------------------------------------------------------------------------------------------- |
| TTD-AUD-01 | 0    | verificado en tests | #60 | Tests: filters.spec, row-date.spec, automation-dates.e2e, matrix/propose                        |
| TTD-AUD-02 | 0    | verificado en tests | #61 | Tests: nlp/parse.spec time ranges; task-composer.e2e                                            |
| TTD-AUD-03 | 5    | corregido           | #71 | Atajos de día → all-day si no había fecha                                                       |
| TTD-AUD-04 | 5    | corregido           | #71 | Chip Cuándo = start??due; duración nowrap; Hasta en DatePopover                                 |
| TTD-AUD-05 | 2    | verificado en main  | #68 | Menú acciones; verificar tras 64 si hace falta pulido                                           |
| TTD-AUD-06 | 5    | corregido           | #71 | save sin await refresh; carga «Cargando…» + skeleton                                            |
| TTD-AUD-07 | 2    | verificado en main  | #69 | Gate Ticky + layout; 63 puede ampliar el interruptor                                            |
| TTD-AUD-08 | 2    | corregido           | #71 | Interruptor en Funcionalidades (vía 63)                                                         |
| TTD-AUD-09 | 0    | verificado en main  | #72 | Ya en main: semana calendario local; no reimplementar                                           |
| TTD-AUD-10 | 0    | corregido           | #71 | formatFocusDuration redondea; /focus etiquetado como total                                      |
| TTD-AUD-11 | 0    | verificado en tests | #67 | Test: weekly-automation.e2e-spec.ts                                                             |
| TTD-AUD-12 | 5    | corregido           | #71 | Chip control muestra N/100                                                                      |
| TTD-AUD-13 | 5    | corregido           | #71 | Button + etiquetas Campo/Combinar + .condition                                                  |
| TTD-AUD-14 | 2    | corregido           | #71 | Botón info icono; ámbito filtra NOTE                                                            |
| TTD-AUD-15 | 5    | corregido           | #71 | Acciones papelera a la derecha en meta                                                          |
| TTD-AUD-16 | 0    | corregido           | #71 | Purga optimista + rollback; contador trash                                                      |
| TTD-AUD-17 | 5    | corregido           | #71 | Button primary en Nueva lista/etiqueta                                                          |
| TTD-AUD-18 | 5    | corregido           | #71 | Tras borrar lista → /inbox                                                                      |
| TTD-AUD-19 | 5    | corregido           | #71 | NotFoundPage en ruta *                                                                          |
| TTD-AUD-20 | 5    | corregido           | #71 | Anillo SVG + presets aria-pressed + error/carga                                                 |
| TTD-AUD-21 | 3    | corregido           | #71 | h1 nowrap; emoji fuera del clamp                                                                |
| TTD-AUD-22 | 5    | corregido           | #71 | Tokens dark --countdown-*-bg/ink                                                                |
| TTD-AUD-23 | 5    | corregido           | #71 | Dialog i18n; labels flex; date lang; ui-select                                                  |
| TTD-AUD-24 | 5    | corregido           | #71 | Popover Nueva + LayoutGrid; confirm inline                                                      |
| TTD-AUD-25 | 5    | corregido           | #71 | Active/hover + rail + segmented theme contraste                                                 |
| TTD-AUD-26 | 5    | corregido           | #71 | Login submit usa --accent                                                                       |
| TTD-AUD-27 | 5    | corregido           | #71 | Countdown + Ticky settings/routines/proposal i18n                                               |
| TTD-AUD-28 | 0    | verificado en tests | #66 | Tests: run-action.spec.ts, query-client.spec.ts                                                 |
| TTD-AUD-29 | 0    | corregido           | #71 | onUnauthorized → login?next=; red ≠ logout                                                      |
| TTD-AUD-30 | 5    | corregido           | #71 | Boundary por ruta + i18n; reset al navegar                                                      |
| TTD-AUD-31 | 5    | corregido           | #71 | Focus/filters/matrix/countdowns/features/workday ErrorState+Skeleton                            |
| TTD-AUD-32 | 5    | corregido           | #71 | Plural; sin confirm() nativo en hábitos/plan/review                                             |
| TTD-AUD-33 | 3    | corregido           | #71 | Hoja inferior «Más»; Ticky filtrado; scrim encima                                               |
| TTD-AUD-34 | 5    | aplazado            | #71 | Origen no analizado; login/auth sin errores de código evidentes                                 |
| TTD-AUD-35 | 4    | verificado en main  | #63 | Paginación tokens; no reimplementar                                                             |
| TTD-AUD-36 | 4    | verificado en tests | #71 | tokenExpired + UI pill; token-groups.spec                                                       |
| TTD-AUD-37 | 4    | verificado en main  | #62 | OAuth name conflicts; no reimplementar                                                          |
| TTD-AUD-38 | 4    | corregido           | #71 | UI etiquetas+lifecycle; una página de 100 (sin más páginas)                                     |
| TTD-AUD-39 | 4    | corregido           | #71 | Error revoke en banda; 409 nombre tomado                                                        |
| TTD-AUD-40 | 4    | corregido           | #71 | aria-live sin secreto; dismiss explícito                                                        |
| TTD-AUD-41 | 4    | corregido           | #71 | manage/countdowns/sensitive + scopes.spec                                                       |
| TTD-AUD-42 | 4    | verificado en main  | #64 | Consentimiento OAuth; no reimplementar                                                          |
| TTD-AUD-43 | 4    | verificado en main  | #65 | Reconexión Google; depende de 47 para testing                                                   |
| TTD-AUD-44 | 4    | corregido           | #71 | Telegram pairing + inbound regenerate confirm                                                   |
| TTD-AUD-45 | 4    | corregido           | #71 | Webhook rotate confirm + feed Copiar URL                                                        |
| TTD-AUD-46 | 4    | corregido           | #71 | Lista revocados con estilo                                                                      |
| TTD-AUD-47 | 4    | corregido (parcial) | #71 | ?google=denied + mensaje; GCP console = ops manual                                              |
| TTD-AUD-48 | 1    | corregido           | #71 | tag_ids/tags + add/remove en create/update                                                      |
| TTD-AUD-49 | 1    | corregido           | #71 | quick_add + parse=true en create/update                                                         |
| TTD-AUD-50 | 1    | corregido           | #71 | delete_task / restore_task (scope tasks:trash)                                                  |
| TTD-AUD-51 | 1    | corregido           | #71 | content + list/add comments + list attachments                                                  |
| TTD-AUD-52 | 1    | corregido           | #71 | + reminders MCP + list_tasks tag/from/to/priority                                               |
| TTD-AUD-53 | 1    | corregido           | #71 | reopen/cancel + status en list_tasks; flujo vía column_id                                       |
| TTD-AUD-54 | 0    | corregido           | #71 | Validación estricta MCP con validateMcpArgs                                                     |
| TTD-AUD-55 | 0    | corregido           | #71 | parseTaskInstant YYYY-MM-DD → medianoche local + is_all_day                                     |
| TTD-AUD-56 | 0    | corregido           | #71 | deriveDurationMinutes rechaza mismatch; no pisa explicit                                        |
| TTD-AUD-57 | 1    | corregido           | #71 | MCP created_via + activity vía token en detalle; cuentas/persona = ops                          |
| TTD-AUD-58 | 3    | corregido           | #71 | outlet sin padding-top; sticky bajo cabecera; viewport-fit                                      |
| TTD-AUD-59 | 2    | corregido (parcial) | #71 | ViewPrefs local + print + hideCompleted; syncAcrossDevices flag local (server sync = follow-up) |
| TTD-AUD-60 | 2    | corregido           | #71 | Detalle fijo + abrir tarea en ruta actual (matrix/calendar/plan/focus)                          |
| TTD-AUD-61 | 2    | corregido           | #71 | sectionOf + CalendarSidebar mini-mes                                                            |
| TTD-AUD-62 | 2    | corregido           | #71 | minimalQuadrantPatch; skip mismo cuadrante; undo; no clear en drop                              |
| TTD-AUD-63 | 2    | corregido           | #71 | Flag ticky + useTickyAvailable; FeatureRoute; server-off bloquea switch                         |
| TTD-AUD-64 | 2    | corregido           | #71 | Capture card + Popover + addDescription + submit visible en sheet                               |
| TTD-AUD-65 | 0    | corregido           | #71 | taskEventSnapshot + migración strip activity                                                    |
| TTD-AUD-66 | 2    | corregido           | #71 | ViewMenu + prefs por vista; cabecera unificada vía Board                                        |
| TTD-AUD-67 | 2    | corregido           | #71 | Inbox usa Board + ViewMenu; Procesar todo se mantiene                                           |
| TTD-AUD-68 | 2    | corregido           | #71 | Kanban por fecha si no hay secciones; sin «Nueva sección» en smart                              |
| TTD-AUD-69 | 2    | corregido           | #71 | Toolbar full-width; zoom i18n; locale; start_date                                               |
| TTD-AUD-70 | 3    | corregido           | #71 | page-title ellipsis; badge nowrap; actions shrink-0                                             |
| TTD-AUD-71 | 3    | corregido           | #71 | BottomBar última vista; toolbar sticky; DaySheet ya existía                                     |
| TTD-AUD-72 | 3    | corregido           | #71 | matrix-tabs sticky + tabpanel a11y                                                              |
| TTD-AUD-73 | 5    | corregido           | #71 | Skeleton solo si no hay data cacheada (matrix/countdowns)                                       |

## Resumen por fase

### Fase 0 — cerrada en #71

- Corregidos: 65, 54, 55, 56, 10, 16, 29 (+ verificados en main/tests).

### Fase 1 — MCP casi cerrada en #71

- Corregidos: 48, 49, 50, 51, 53.
- Corregido 52 (reminders + filtros list_tasks) y 57 (created_via MCP + vía en actividad).

### Fases 0–5 — cerradas en #71 (salvo ops/manual)

- Código de auditoría implementado en esta PR.
- Quedan parciales ops: 47 GCP, 59 sync servidor ViewPrefs.
- AUD-38: #73 amplía la actividad de tokens con paginación por cursor y reintento.
- #71 está integrada en main. La continuación autorizada y los nuevos alcances se concentran en #73.

### Comprobaciones manuales pendientes

- Tras desplegar: editar una tarea 10+ veces y confirmar que `activity_log.changes` no anida `activity`.
- MCP `create_task` con `due_date: "YYYY-MM-DD"` → all-day en Europe/Madrid.
- MCP `update_task` con campo inventado → `isError: true`.

## Continuación en #73 (21/10/2026)

- TTD-AUD-74: alta contextual en calendario, popover anclado al punto, selección de rango,
  zonas horarias/DST, teclado, hoja móvil y conservación del borrador al ampliar el editor.
  El arrastre de varios días en la cuadrícula mensual queda como mejora opcional.
- Main integrado después de la fusión de #71; conflictos resueltos conservando sus mejoras.
- Rail: activo blanco con contorno más grueso (fallback de Lucide), inactivos atenuados,
  hover y foco con tooltip localizado, sin fondos. Estado derivado de la ruta y
  `aria-current`; badges opacos. La selección de la segunda columna no cambia.
  Requisitos relacionados: RF-1902 (teclado) y RF-1903 (temas).

Validación de la continuación: lint y typecheck completos; 590 unitarios
(299 dominio, 163 web, 117 API, 11 SDK), cobertura de dominio 89,48 %;
integración 127 pasan y 2 omitidos; OpenAPI estable. En Chromium pasan
17 pruebas de alta contextual/compositor, 6 regresiones funcionales del calendario
y la comprobación del rail en ambos temas. Las capturas nuevas permanecen locales.

## Reapertura TTD-AUD-75–79 — 21/10/2026

Base comprobada: `codex/ttd-audit-remaining`, `ab21786`, PR #73 abierta en borrador.
No se consideran acreditadas las marcas de finalización anteriores.
Informe recibido: [ttd-codex-r75.md](ttd-codex-r75.md), copiado desde la carpeta
local del usuario. Las 101 evidencias originales se copiaron a `evidencias/` y se
compararon byte a byte con el ZIP; no se copia el PDF ni se generan HTML/PDF.
Los originales y las modificaciones locales ajenas quedan fuera de los commits.

Matriz inicial (la inspección de código no sustituye la validación funcional):

| Requisito                                                | Evidencia contrastada en este corte                                                                                 | Estado                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 75.1 Filtros/fuentes a la izquierda, URL y persistencia  | `CalendarSidebar` solo contiene el minicalendario; `Places` mantiene el select de lista y `CalendarVisibility` en ⋯ | Ausente                                                               |
| 75.2 Panel fijo solo en Tareas                           | `sectionShowsDetailPane` incluye calendar/focus/matrix/search/stats; `?task=` aún abre columna                      | Ausente                                                               |
| 75.3 Plegar en cabecera                                  | `Places` no incorpora el control; sigue en `IconRail`                                                               | Ausente                                                               |
| 75.4 Hora separada del título                            | `chipLabel` concatena hora/título en Mes; HourGrid ya separa la hora                                                | Parcial                                                               |
| 75.5 Mover/redimensionar, teclado/táctil, Deshacer y DST | Los handlers de puntero de HourGrid seleccionan rangos de creación; no mueven tareas existentes                     | Ausente                                                               |
| 75.6 TaskPeek y evento anclados/hoja                     | Enlaces `taskQueryHref` en HourGrid y DayGrid; evento existente sin nuevo anclaje                                   | Parcial                                                               |
| 75.7 Hoy circular relleno en todas las superficies       | Reglas independientes en calendar.css, ui.css, shell.css y weekly.css; selector con outline                         | Parcial                                                               |
| 75.8 Cabecera compacta, 1024/1280/1440 y móvil           | `calendar-toolbar` mantiene select, segmentado, título CalendarPeriod y + primary                                   | Ausente                                                               |
| 75.9 Solo panel secundario izquierdo                     | Hay CalendarSidebar izquierdo y panel fijo derecho habilitado                                                       | Parcial                                                               |
| 75.10 Todo el día: límites por vista y expansión         | HourGrid renderiza la colección sin límite de chips ni expansión de franja                                          | Parcial                                                               |
| 75.11 PeriodNavigator/PeriodPicker compartidos           | Persisten WeekPicker y CalendarPeriod/CalendarJump independientes                                                   | Ausente                                                               |
| 76 TaskCard único global/calendario                      | CaptureSheet conserva h1/Cancelar y TaskComposer mantiene la variante calendar                                      | Parcial                                                               |
| 77 Quitar widgets exteriores y progreso en avatar        | Eliminados los tres montajes y barra móvil; AccountMenu usa Floating UI, progreso, estados y hoja                   | Verificado en componente y navegador simulado; backend real pendiente |
| 78 Foco Pomo/Cronómetro, pausa, resumen y registro       | FocusPage conserva estructura anterior; controller sin pause/resume ni stopwatch                                    | Parcial                                                               |
| 79 Aplicaciones, caducidad y filas compactas             | TokensPage sigue groupTokens y permisos expandidos; createToken sin expires_in_days; no rutas /me/oauth/grants      | Parcial                                                               |

Esta matriz cubre 75–79. El contraste completo del alcance previo (fuentes de
TTD-AUD y especificación única) continúa pendiente: no se declara cerrado ni se
reclasifica como verificado por las pruebas de este corte. Ticky F1–F10 queda excluido.

### Corte 77 — RF-1602, acceso a racha y puntuación

- Rail/sidebar/barra móvil: sin `ControlChip`; se eliminan los estilos específicos
  de esos montajes. El avatar móvil de «Más» abre el mismo contenido.
- Menú de 256 px anclado con Floating UI (right-start, offset 8, flip/shift),
  cabecera de identidad y progreso en dos columnas; número neutro y etiqueta/barra
  según estado. Punto de racha en el avatar (retirado en la revisión posterior solicitada por Pablo). Datos, carga, vacío y error con reintento.
- Botón con aria-haspopup/expanded/controls, roles menu/menuitem, flechas,
  Inicio/Fin, Escape y devolución de foco, Tab para cerrar. En móvil hoja inferior
  con filas de al menos 44 px. Nuevos tokens en claro/oscuro e i18n es/en.
- Tests elegidos por riesgo: 4 de componente (datos, vacío, error, carga y teclado)
  y 4 Playwright (1280×800 / 390×844 × claro/oscuro), con API interceptada.
  Los 4 de componente fallaron antes del cambio y pasan después.
- Navegador simulado: ausencia de widgets/barra, contenido del menú, ancho de
  256 px en escritorio, hoja de 390 px pegada abajo, filas táctiles y Escape/foco.
  Revisión visual de capturas temporales de escritorio claro y móvil oscuro:
  tarjeta legible, cifra neutra, estado coloreado y hoja sin desbordamiento.
  No se publican nuevas capturas de auditoría; los PNG temporales no se commitean.
- Backend real y sesión del usuario: **no comprobados**. Este corte no cambia la
  API ni demuestra el cálculo real de racha/Control; reutiliza stats/overview.
- Validación: typecheck completo correcto; suite completa correcta al repetir sin
  carga paralela (un primer intento tuvo timeout de 5 s en RailSectionLink;
  pasó aislado y en la repetición completa). OpenAPI regenerado sin diff.
  Lint del monorepo: API/domain/SDK correctos; los errores de lint del nuevo menú
  se corrigieron y se comprueba de nuevo web antes del commit.

### Corte 75.7 — RF-604: hoy circular y fecha de cuenta

- `TodayMark` aplica `.today-mark`, `data-today` y `aria-current="date"` al número
  en HourGrid (Día/Semana/Varios días), Mes/Varias semanas, Año/Trimestre,
  minicalendario, CalendarJump y WeekPicker. Se retiran los rellenos/aros
  independientes. Dimensiones por contexto en tokens de ambos temas; blanco
  `--on-accent` sobre `--today-mark-bg`, sin padding horizontal en el círculo.
- `useCalendarToday` usa la zona de la cuenta (por defecto Europe/Madrid), programa
  la siguiente medianoche local y se refresca al recuperar foco/visibilidad.
  No presupone días de 24 horas. También corrige la fecha de hoy de Agenda.
- Tres unitarios significativos: día de Madrid antes de medianoche UTC y próxima
  medianoche en los días de 25/23 horas. Suite web Node 26: 170 correctos.
- Dos recorridos Playwright (1280×800 y 390×844), API simulada, navegador en
  America/New_York: paso 21→22 a medianoche Madrid sin recargar; forma circular
  ±0,5 px, radio 50 %, texto blanco y contraste ≥4,5 en seis acentos × claro/oscuro
  de cabecera; círculo también en Mes, Año y selector CalendarJump.
  El test de navegador falló antes del cambio. Una regla heredada de min-width
  deformaba el círculo móvil en 2 px: se detectó y corrigió su prioridad.
- Regresión del corte 77: los cuatro recorridos siguen correctos tras tocar CSS
  compartido. Total del pase dirigido: seis recorridos correctos.
- Lint/typecheck web correctos. Sin cambios de API ni dominio; OpenAPI permanece
  igual al regenerado del corte anterior. No se declara validado el backend real
  ni el Reporte semanal en navegador: WeekPicker usa el componente compartido,
  pero el navegador compartido completo sigue pendiente en 75.11.

### Revisión de 77 tras validación del usuario — 21/10/2026

El usuario detectó regresiones móviles que el corte anterior no acreditaba:
Listas quedaba bajo el scrim y «Más» debía usar el sidebar izquierdo de Listas.
Las capturas aportadas en el chat son la evidencia de la reapertura. Se retira
la declaración de cierre funcional completo de 77 hasta validar esta revisión.

- Causa contrastada: el sidebar de Listas estaba en z-index 30 y el scrim en 35;
  «Más» tenía una excepción a 40. La nueva prueba con un clic real en un enlace
  de Listas falló antes de corregirlo: `scrim intercepts pointer events`.
  Ver un elemento con `toBeVisible` no acreditaba que recibiera los clics.
- Reparación: ambos menús usan el mismo drawer izquierdo y filas de al menos
  44 px. Sidebar 40 por encima del scrim 35 mediante tokens en ambos temas;
  scrim oscuro en tema oscuro. Se elimina la excepción de «Más» como hoja/grid.
  Esta decisión aplica la aclaración explícita del usuario y sustituye el diseño
  previo de TTD-AUD-33; el menú del avatar sigue siendo hoja en móvil.
- Punto amarillo del avatar eliminado, incluyendo CSS y token específicos.
- Progreso compacto: padding de 8 px, cifra de 18 px, estado junto a la cifra y
  barra en segunda fila, con al menos 8 px de separación respecto al valor.
  La tarjeta queda por debajo de 68 px de alto; «Tu progreso» sigue como texto
  accesible sin ocupar otra línea visible.
- Cuatro recorridos existentes ampliados, sin añadir una batería de cobertura:
  1280×800 / 390×844, claro/oscuro. Clic real en enlaces de Listas y Más, cierre
  del drawer al navegar, posición x=0 y alto completo del menú Más, filas
  horizontales, avatar sin punto, tarjeta compacta, separación cifra/barra y
  navegación por teclado del menú. Los cuatro pasan; también los cuatro tests
  de componente de AccountMenu. Revisión visual de escritorio claro, sidebar
  Más claro y avatar móvil oscuro mediante PNG temporales, sin publicarlos.
- Lint, typecheck y suite de unitarios completos correctos en esta revisión
  (web: 170; API: 117). OpenAPI regenerado sin diff. Sin cambios en API/modelo/eventos. La prueba con datos de usuario sigue pendiente: navegador
  con API interceptada; solo se comprueba salud real de la API local.
- Incidencia del entorno: se restablece Vite en 4173 como proceso independiente
  de Playwright. `/smart/tomorrow` responde HTTP 200 y `/api/v1/health` devuelve
  `status: ok` por el proxy; el servidor queda arrancado para validar.

### Feedback adicional registrado — pendiente, sin desviar 75–79

A petición de Pablo se registran estos ajustes, manteniendo el foco en el alcance
75–79. No están implementados ni se dan por verificados:

- Cabecera de Hoy: retirar el texto de fecha y el selector visible Lista/Matriz;
  mover las vistas a «⋯ → Vistas → Lista / Kanban / Matriz», conservando una fila
  limpia en móvil. Kanban debe tener comportamiento real, no solo una entrada.
  Evidencia del chat: `codex-clipboard-8d607a64-ddd6-465e-9712-306df6badac7.png`.
- Plan del día en móvil: ocultar el resumen de capacidad («0 min de 9 h») y
  mantener título y acción «Planificar» alineados, con objetivo táctil adecuado.
  Evidencia del chat: `codex-clipboard-c0de6043-531e-4d5b-aaa8-e81c61c9f7fa.png`.

La revisión de 77 queda en `ab15f2b`; se retoma 75.10. Estas observaciones no se
mezclan con el commit de los menús ni se cierran basándose en lecturas de código.

Ajuste posterior de 77 solicitado por Pablo: ambos sidebars móviles pasan al 88 %
del ancho del viewport mediante `--mobile-sidebar-w` en claro/oscuro. Se conserva
la franja exterior para cerrar. Sustituye el límite anterior de 240 px; el drawer
no depende ya del ancho del sidebar de escritorio.

El fondo exterior del drawer recibe además desenfoque de 4 px y opacidad más
oscura (55 % en claro / 60 % en oscuro), mediante tokens de ambos temas y
backdrop-filter con prefijo Safari. El sidebar permanece por encima y nítido.

### Aclaración vinculante de 75.11 — referencia del Reporte semanal

Pablo confirma que el selector que le gusta es el **existente en Reporte semanal**.
Debe reutilizarse ese mismo componente UI en el calendario, conservándolo como
referencia visual y funcional del proyecto. No se construirá un segundo selector
ni una reinterpretación visual independiente. La adaptación común debe admitir
los periodos necesarios sin duplicar estructura ni estilos.

También se registra la apertura inestable observada por el usuario: al montarse,
el selector actual cambia de posición hasta recolocarse. Criterio de aceptación:
el contenido debe aparecer ya en su posición y tamaño definitivos, desde su
primera apertura; sin flash en otra posición ni salto de recolocación visible.
Esta aclaración prevalece sobre la interpretación anterior de 75.11 que proponía
rediseñar el selector del Reporte para adaptarlo a otro popover. La explicación
previa de 264 px/no modal no se considera una decisión aceptada por el usuario.
Pendiente de implementación y comprobación; no se declara corregido todavía.

### Ajuste solicitado — Dos semanas sustituye Varias semanas

Se elimina la vista de longitud variable y su selector de cantidad. La nueva vista
«Dos semanas» muestra siempre 14 días, respeta el inicio de semana y navega en
saltos de 14 días. Los enlaces antiguos `multi-week` y la preferencia guardada se
convierten a `two-weeks`; se retira el parámetro obsoleto `weeks` conservando los
demás filtros. Etiquetas es/en y alturas mediante tokens en ambos temas.

Evidencia: siete unitarios del calendario, incluidos inicio de semana y cambio
de horario de octubre; dos Playwright dirigidos en 390×844 y escritorio, con API
simulada. Comprueban 14 celdas, migración, navegación, persistencia, límites del
grid móvil y captura contextual. Lint y typecheck web correctos. Esto no acredita
la sesión real del usuario ni cierra el resto de 75 (incluido 75.11 pendiente).

Cierre técnico de este ajuste: lint, typecheck y test del monorepo en verde
(598 pruebas). OpenAPI regenerado sin cambios en API/SDK. Sin cambios de API.

### Año dentro del viewport — RF-1101

Ajustada la vista anual al alto útil del shell: 3×4 meses en móvil, 4×3 en
escritorio, sin apilado de 12 meses ni desbordamiento inferior. El trimestre no
cambia. Los botones de mes conservan acceso a la vista mensual; en móvil tienen
44 px. Prueba dirigida reproduce antes el desbordamiento (3772 px en móvil y
955 px en escritorio) y pasa después a 390×844 y 1280×800, claro y oscuro, con API
simulada. No acredita sesión real del usuario. Sin cambios de API ni lógica de
negocio; comprobaciones generales previas en verde y dos Playwright nuevos.

### Nueva referencia de cabecera y Semana móvil — en curso

Pablo pide cabecera simplificada según TickTick (periodo + selector de vistas
con iconos y selección + menú), y Semana móvil en dos columnas con minicalendario
en primera celda y siete días ordenados. Deslizar horizontalmente avanza o
retrocede una semana; no debe impedir el scroll vertical. Referencias del chat:
`codex-clipboard-7e1f432b-608e-469d-b90b-a81d48eb9213.jpg` y
`codex-clipboard-0e245194-1530-462c-9e44-8c489f73950f.jpg`.

### Relevo de sesión — cambios locales aún sin commit (21/10)

Decisiones posteriores de Pablo, vinculantes:

- Cabecera simplificada en todas las vistas: retirar todos los botones «⋯».
- Selector de vistas con icono de la vista activa; cambia al seleccionar otra.
- Botón de filtros en escritorio/móvil: panel flotante con listas, filtros
  guardados, etiquetas y calendarios activos (Google e iCal). Se traslada ahí
  la opción de semana laboral; navegación móvil dentro del selector de vistas.
- Semana móvil en dos columnas: minicalendario primero y siete celdas de día,
  horas a la derecha; gesto horizontal para cambiar semanas.
- Año: gesto vertical (arriba siguiente año, abajo anterior); conservar los
  doce meses dentro del viewport. Pablo ha validado favorablemente la maquetación
  anual, pero observa lentitud al cargar (pendiente de analizar, sin diagnóstico).
- Acercar nombres de meses a los días y separar algo más los números.
- Suavizar SOLO las siglas de los días de semana (peso 400/color secundario).
  No suavizar los números: corrección explícita del usuario incorporada.
- Desplegable de vistas sin salto de tamaño/posición al abrir por primera vez.

Implementación en curso en Places.tsx, calendar.css, tokens.css, extra.ts,
CalendarControls.tsx, Popover.tsx y calendar-v2.spec.ts. No está commiteada ni
se declara completo el alcance 75. Filtros en URL y vía endpoints existentes,
sin cambios API. Visibilidad de calendarios con estado optimista mientras se
actualiza y recarga la consulta. Popover anclado oculto durante medición inicial.

Última comprobación de la versión local: cinco Playwright dirigidos pasan
(minicalendario, teclado/cierre de menús, Dos semanas, Semana móvil y Año táctil).
Los dos gestos usan entrada táctil de Chromium/CDP; se espera a que exista la
cuadrícula antes del gesto. Datos API simulados, sin sesión real del usuario.
Antes habían pasado pruebas de viewport Año 390/1280 claro/oscuro, filtros
390/1280 y estabilidad del primer popover; repetir solo lo afectado tras cambios.

Última comprobación general: typecheck y 598 tests verdes antes de los últimos
ajustes. Lint detectó expresiones void y borrado dinámico de una propiedad;
corregidos, pero falta una ejecución final de lint/typecheck en el estado actual.
OpenAPI regenerado sin cambios. No se ha probado la sesión backend del usuario.
No se han publicado imágenes nuevas: las vistas inspeccionadas están en /tmp.

Commits publicados: 8a5676a (Dos semanas) y a4c226a (Año en viewport).
Falta revisar diff, cerrar checks finales, actualizar evidencia de PR y guardar
el corte en la misma PR 73. No incluir documentos locales ajenos al agente.

### Ajustes móviles de calendario — RF-1101 (21/10)

Días ajenos al mes con números de menor peso y contraste en móvil. Agenda del
día en panel de 92dvh, scroll interior y X negra arriba a la derecha con nombre
accesible. Fondo oscuro y difuminado mediante tokens compartidos con diálogos y
paneles laterales. Navegación vertical compartida entre Mes y Año: arriba avanza,
abajo retrocede; se suprime el clic posterior al gesto.

Evidencia con API simulada: Playwright del panel (altura, scroll y cierre) y dos
pruebas táctiles Mes/Año en verde. Typecheck web correcto tras extraer el gesto.
Lint y tests generales pasaron antes de esa extracción; no acredita sesión real.

### Agenda continua — RF-1101 (21/10)

Sustituida ventana fija por ampliación de 30 días al acercarse a los extremos
del scroll, hacia pasado y futuro. Incluye días vacíos y conserva el día visible
al anteponer fechas. Consultas existentes ampliadas, sin cambios de API.
Playwright con API simulada verifica ampliación más allá de septiembre y
noviembre y cruce a 2027; panel de día sin regresión. Typecheck web correcto.

### Barra inferior móvil independiente de la sección — RF-1902 / UI-103

Listas abre el Sidebar general (listas, filtros y etiquetas); Más abre navegación
principal en todas las secciones, incluido Calendario. Escritorio conserva su
CalendarSidebar. La barra inferior permanece pulsable sobre el fondo del drawer;
se reserva su altura al pie para no tapar los enlaces finales.
Playwright con API simulada verifica alternancia Listas/Más desde Calendario,
navegación, cierre y minicalendario de escritorio. Typecheck web correcto.

### Corrección posterior de Agenda — navegación mensual manual (RF-1101)

La petición posterior sustituye la ampliación automática anterior: no se cargan
meses por scroll. Agenda compacta desde hoy por defecto, sin filas para todos los
días vacíos (se conserva hoy como ancla). Botones «Ver mes anterior» y «Ver mes
siguiente» en los extremos amplían un mes natural únicamente al pulsarlos.
Se conserva acceso por fecha explícita. Dos Playwright con API simulada en verde:
posición inicial en hoy, scroll sin peticiones nuevas, botones cargan más datos y
panel del día sin regresión. No acredita sesión backend real.

### Agenda: cabecera mínima y tres meses iniciales — RF-1101

Petición posterior: cabecera sólo con iconos de vistas y filtros, en móvil y
escritorio; sin selector de fecha, navegación, alta ni texto auxiliar. Carga
inicial: mes anterior, actual y siguiente, con hoy visible al abrir. Botones
sutiles para ampliar un mes, visibles únicamente en el extremo correspondiente.
Sin carga automática por scroll. Dos Playwright con API simulada verifican rango
septiembre–noviembre, hoy visible, botones ocultos entre extremos, carga manual
y cabecera de escritorio. Typecheck web correcto.

### Agenda: transición a diciembre y meses vacíos — RF-1101

Al ampliar manualmente, se lleva el scroll al mes recién cargado y se recalculan
los extremos tras cambiar datos, sin depender de un evento scroll adicional.
Los meses sin elementos conservan cabecera y estado vacío, sin crear filas por
día. Prueba con API simulada: evento en diciembre visible y continuación por
enero/febrero vacíos; prueba de tres meses iniciales y carga manual también pasa.
Typecheck web correcto. No se ha inspeccionado backend/sesión real del usuario.

### Panel de filtros: coherencia visual — RF-1101 / RF-1902

Sustituidos campos de formulario prominentes por filas reutilizables con icono,
etiqueta, selección secundaria y chevron, conservando selects accesibles y
contratos existentes. Ajustes de calendario como fila sin enlace morado;
separación sutil de fuentes. Contenedores y botones compartidos del calendario
usan radios, colores y espaciados de tokens. Tres Playwright dirigidos en verde:
filtros 390/1280, selección/persistencia/visibilidad, Escape/foco y apertura de
vistas estable. Inspección visual clara/oscura con API simulada y capturas sólo
en /tmp. Lint y typecheck web correctos; no acredita sesión real.

### Orden estable de acciones del calendario — RF-1101 / RF-1902

Filtros a la izquierda y vista a la derecha en todas las vistas, incluida Agenda;
mismo orden en DOM/teclado y pantalla. Agenda conserva la cuadrícula compartida
de cabecera móvil. Dos Playwright con API simulada recorren las ocho vistas a
390 y 1280, comparando posiciones con tolerancia inferior a 2 px y orden DOM.
Ambos pasan.

### Filtros: calendario sin enlace a ajustes — RF-1103

El panel muestra «Calendario» como título, sin navegación a Ajustes. Debajo,
«No hay calendarios suscritos» cuando no hay fuentes; si las hay, se enumeran
con sus controles de visibilidad. Tareas permanece como control independiente.
Texto es/en. Tres Playwright con API simulada correctos: vacío sin enlace y
fuentes/selección/persistencia a 390 y 1280.

### Día: franja semanal fija y navegación — RF-1101 / RF-1902

Siete días con siglas fijas y selección numérica, respetando inicio de semana.
Pulsar cambia fecha y horario; deslizar horizontalmente salta siete días
conservando columna y día de semana, incluido cambio de año. Hoy seleccionado
por defecto y diferenciado al seleccionar otra fecha. Franja fuera del scroll
del horario; sin duplicar la cabecera de día. Alternativa PageUp/PageDown.
Playwright táctil con API simulada verifica selección, ambos gestos, octubre/DST,
diciembre–enero, columna estable y posición fija con scroll. Otras dos pruebas
verifican filtros/vistas en todas las vistas móvil/escritorio. Inspección visual
390 px, captura temporal en /tmp. Typecheck y lint de archivos afectados en verde.

### Día: hora actual roja y cabecera compacta — RF-1101

NowLine compartida recupera el rojo semántico; calcula minutos en zona de cuenta,
igual que la posición de eventos y la hora de entrada al horario (ya sin tope
artificial de las 18). Actualización por minuto y sólo en columna de hoy.
Reducidos huecos superiores y tamaño del número seleccionado a token 2rem;
objetivos táctiles conservados y etiqueta Todo el día en una línea.
Playwright con navegador America/New_York/cuenta Europe/Madrid verifica 12:00,
rojo, actualización 12:01, ausencia en otro día y geometría 390×844: horario
comienza antes del 22 % del viewport y supera el 65 % de altura. También pasa
prueba de franja/gestos. API simulada, captura temporal /tmp; lint y tipos web
correctos antes del ajuste final de coherencia horaria de eventos.

### Horario: afinado de línea, horas y todo el día — RF-1101

Tokens compartidos claro/oscuro: línea 1px/punto 4px, horas 11px, columna horaria
3rem y tarjetas de todo el día con texto 11px, menor padding/alto/checkbox.
Etiqueta Todo el día alineada arriba con separación lateral, sin solaparse con
las tarjetas; admite dos líneas para estrechar la columna. Inspección visual
con cuatro tareas (tres títulos largos) a 390×844. Tres Playwright dirigidos
correctos: línea/actualización/zona, franja/gestos, cuatro tareas sin solapamiento.
Typecheck web correcto; API simulada y capturas sólo en /tmp.

### Todo el día: dos elementos y agenda completa — RF-1101/1102

Franja limitada a dos elementos por día contando tareas y eventos; «+N» abre el
DaySheet compartido con la agenda completa del día. Se conservan spans de eventos
entre días visibles. Tarjetas compactas de una línea en la franja, menor padding;
checkbox y texto alineados. Tarjetas con hora ajustadas al intervalo (height,
sin crecimiento fuera del día), hora junto al título y checkbox sin ocupar media
columna. Prueba a 23:00 con solapamiento confirma altura 48px y límite de día.
Prueba mixta con cuatro tareas y un evento confirma dos visibles, +3 y agenda
completa. Ambas pasan con API simulada; inspección de capturas temporales /tmp.
Typecheck y lint de archivos afectados correctos antes del último afinado CSS.

### Vistas sólo escritorio — RF-1101 (petición posterior)

Trimestre y Dos semanas se retiran del selector móvil. Enlaces directos y
preferencias heredadas se normalizan en móvil a Mes y Semana respectivamente,
conservando fecha y filtros. Ambas vistas siguen disponibles en escritorio.
Playwright específico móvil/escritorio correcto con API simulada.

### Semana móvil: tarjetas compactas — RF-1101

Tarjetas de una línea con altura mínima 20px, padding vertical cero, peso 400,
check compartido de 13px y marca lateral de color. Hora se conserva a la derecha
(al no existir franja horaria en esta vista). Eliminados objetivos mínimos de
44px en enlaces interiores que inflaban cada card. Scroll por celda conservado.
Playwright densidad con doce tareas: caben al menos cuatro completas por celda,
altura <=24px; prueba previa de gestos/selector también correcta. Inspección visual
390×844 con API simulada, captura sólo /tmp.

### Selector de vistas móvil: sólo vistas — RF-1101

Retirada la fila anterior/Hoy/siguiente del menú compartido de vistas a petición
del usuario: termina en Día en móvil. Eliminados sus estilos sin uso. Typecheck
web y comprobación ESLint del componente ejecutados; prueba dirigida del selector
actualizada para verificar seis vistas y ausencia de botones de navegación.
Resultado: ESLint y typecheck correctos; Playwright dirigido correcto (1/1),
con API simulada.

### Alta desde calendario móvil: modal amplio y acciones — RF-1102 / RF-1902

Modal móvil de 86dvh con margen exterior y fondo oscuro/desenfocado mediante
tokens compartidos. Descripción flexible, sin borde decorativo; conserva foco
visible accesible. Botonera sin fondos grises, bordes ni sombras, etiqueta junto
a Bandeja y envío con icono Send en color accent. Nombre accesible conservado.
Typecheck web y ESLint de componentes correctos. Playwright dirigido correcto
(1/1): geometría móvil, blur, envío con icono y ajuste desktop al viewport.
Inspección visual a 390×844 con API simulada; captura sólo /tmp.

Ajuste posterior: altura móvil reducida de 86dvh a 69dvh (aprox. 20 %),
centrada con margen 15.5dvh. Fecha sin límite fijo de ancho ni elipsis;
aprovecha el espacio hasta la prioridad y permite salto si hace falta.
Playwright dirigido correcto (1/1), API simulada: altura y fecha sin truncado.

### Hora final por defecto — RF-601

Al configurar Hora en DatePopover compartido, la duración vacía se inicializa
a 30 minutos y Hasta se calcula automáticamente. Duraciones ya elegidas se
conservan. Playwright dirigido correcto (1/1), API simulada: 23:45 → 00:15
y conservación de duración personalizada al cambiar inicio. Typecheck web correcto.

Cabecera del composer compartido: muestra inicio y fin cuando hay duración,
y fecha del fin si cruza de día, respetando zona de cuenta y locale.
Typecheck correcto; prueba dirigida verifica rango 12:00–13:00 tras confirmar.

### Indicadores junto a fecha — RF-701 / RF-801

Composer compartido muestra iconos de repetición y campana junto al rango
cuando están configurados. Tooltips y nombre accesible en es/en. Typecheck
correcto y Playwright dirigido (1/1) con API simulada verifica ambos indicadores
tras configurar recordatorio de cinco minutos y repetición diaria.

### Alta desde huecos en todas las vistas — RF-1102 / RF-1902

Semana móvil conecta los huecos de cada día al QuickAddPopover compartido.
Agenda (incluidos meses vacíos), Año y Trimestre abren también alta desde
espacios asociados a una fecha; números de día conservan navegación. No se
interceptan tarjetas ni controles, y el gesto de semana suprime clic posterior.
Enter/Espacio disponibles en los huecos de Semana/Agenda.
Cinco Playwright verifican apertura y fecha de tarea creada en Semana móvil,
Mes, Año, Trimestre y Agenda. Otros cinco verifican franja horaria en Día,
Semana escritorio y Varios días, Dos semanas y gestos móviles. Todos correctos
con API simulada: las franjas conservan hora pulsada y duración inicial 30 min;
sin horario se crea todo el día. Typecheck, ESLint y diff --check correctos.

### Agenda: controles de continuación por mes — RF-1101

Sustituidos textos genéricos por nombre del mes/año que se cargará y chevrons
arriba/abajo según dirección de la lista. Botones ghost compartidos, color accent,
tamaño y espaciado con tokens, objetivo táctil conservado; nombres accesibles
es/en anteriores conservados. Sin carga automática. Typecheck correcto; dos
Playwright con API simulada verifican navegación manual y meses vacíos.

### Comandos slash en descripción del alta — RF-202 / RF-1902

El placeholder anunciaba una función inexistente. TaskComposer compartido ahora
abre menú al escribir / al comienzo de una línea: encabezado, viñetas, checklist,
cita y código. Inserta Markdown sin perder el texto alrededor, devuelve foco y
coloca el cursor para continuar. Reutiliza Popover y sus flechas/Enter/Escape;
Escape cierra sólo el menú y conserva borrador. URLs con / no disparan menú.
Etiquetas es/en. Playwright dirigido correcto (1/1), API simulada: teclado,
selección táctil/clic, cursor, cierre, URL y contenido enviado.

## Guardado de avances y alcance pendiente — cierre del 21/10/2026

Se guarda el corte móvil y alta en la PR 73, sin merge. Resumen vigente en
[RESUMEN-ALCANCE-2026-10-21.md](RESUMEN-ALCANCE-2026-10-21.md), que distingue
implementado, instrucciones pendientes y decisiones posteriores del usuario.
Calendario móvil queda cerrado a nuevos ajustes salvo instrucciones omitidas;
queda repaso de escritorio. No se implementan aquí otros puntos del alcance.

Validación final: lint general correcto (primer intento concurrente terminó en
137, repetición sola correcta); typecheck general correcto; 598 unitarios pasan.
OpenAPI regenerado sin diff. Playwright: 64/66 en el pase completo, y uno de los
dos fallos pasa al corregir expectativa/carga de eventos: acumulado 65 correctos,
un fallo pendiente de escritorio al 200 % de zoom (Agenda con ancho cero entre
paneles). Queda registrado para el repaso desktop, sin ocultar el fallo.
API simulada; no se acredita sesión real. Capturas temporales /tmp; los seis
PNG que la prueba antigua había regenerado se restauraron a su estado limpio.
Documentos locales del usuario excluidos de los commits.

## 75.2/75.9 — panel fijo sólo en Tareas (22/10/2026)

Implementada la política compartida sectionShowsDetailPane: sólo tasks conserva
columna fija. Calendario, Foco, Matriz, Búsqueda y Estadísticas recuperan ancho;
?task= mantiene enlace profundo y abre TaskDetail centrado mediante Popover en
escritorio. Móvil conserva la hoja completa existente. Cierre con X/Escape/fuera,
foco y menús anidados reutilizan los componentes compartidos. El detalle anclado
a la tarjeta y la hoja específica de 75.6 siguen pendientes.

La prueba de política falla antes y pasa después. 171 unitarios web correctos;
tras corregir un fallo descubierto en Estadísticas, pasan los 17 unitarios de
política/rango. Estadísticas ya no guarda/restaura task en preferencias, evitando
que cerrar el detalle vuelva a abrirlo. Lint afectado y typecheck web correctos.
Playwright recorre cinco secciones sin columna, sus enlaces profundos y Escape,
Tareas con columna y cierre de detalle móvil: correcto con API simulada.
La prueba de composición tablet/móvil/200 % también pasa: resuelto el ancho cero
de Agenda al liberar la columna derecha. Sin cambios de API/modelo/eventos.

## 75.3 — plegado compartido en cabecera (22/10/2026)

SidebarFoldButton compartido entre Calendario, Hoy y ViewPages. A la izquierda
del título, usa PanelLeft, aria-expanded real y aria-controls del sidebar;
etiquetas es/en existentes y tooltip con atajo [. En móvil abre el drawer de
Listas; Escape lo cierra. Retirado el botón duplicado del rail y sus props.
El atajo de teclado continúa funcionando. Estilos con tokens, objetivo de 44px
móvil y botón compacto de escritorio. Agenda añade sólo el control de plegado
junto a sus filtros/vistas, sin restaurar fecha o navegación eliminadas.

Cuatro Playwright correctos: plegado en 1280/390 para calendario Mes/Agenda y
Tareas Hoy/Bandeja, estados ARIA y atajo; posiciones de filtros/vistas en las
ocho vistas a ambos anchos. Dos regresiones de Agenda correctas antes del ajuste
final de orden visual; repetición final de plegado 2/2 correcta. 171 unitarios
web, lint web y typecheck correctos. Inspección visual 1280/390, capturas sólo
/tmp y API simulada. Sin cambios de API/modelo/eventos.

## 75.5 — mover y redimensionar tareas (22/10/2026)

RF-1102 / RF-604 / RF-1902. Reglas puras nuevas en domain/calendar/drag.ts;
Pointer Events compartidos en use-calendar-drag para horario, Mes/Dos semanas y
Semana móvil. Agenda/Año/Trimestre siguen sin arrastre. Sólo tareas activas:
checkbox conserva su acción y eventos externos siguen siendo de lectura; una
pulsación larga anuncia que se editan en el calendario de origen.

Ratón: umbral 4px, mover con duración conservada, snap 15min (Alt:5), sombra y
celda destino. Asa inferior cambia duración con mínimo 15min y límite de la
medianoche local. Todo el día limpia inicio/duración y conserva fecha local;
volver a horario asigna 60min. Celdas vacías de todo el día mantienen zona de
soltado. Mes/Dos semanas y Semana móvil conservan hora al cambiar de día.
Teclado: Espacio levanta; flechas cambian franja/día (Mes: filas de siete días),
Mayús arriba/abajo cambia duración, A alterna todo el día, Enter/Espacio guarda,
Escape cancela. Ayuda accesible y anuncios localizados. Táctil: 400ms para
levantar, selección conserva asa visible para redimensionar; scroll bloqueado
sólo al arrastrar. Auto-scroll vertical en borde del horario; soltar fuera cancela.

PATCH existente, sin nuevas APIs/migraciones/eventos: actualización optimista de
cachés de calendario, rollback y Reintentar ante error. Deshacer durante 5s
restaura campos originales. No se modifica repeat_rule; el aviso aclara que
sólo cambia la repetición actual. Evita guardar cuando no cambian fechas/duración.

DST: el 25/10 Madrid ofrece dos filas 02:00 CEST/CET y posiciones separadas;
la conversión predeterminada elige la primera y se puede soltar explícitamente
en la segunda. Duración sigue siendo tiempo transcurrido. Captura nueva respeta
el eje ampliado y conserva sus saltos de 30min. Claves y geometría existentes se
actualizan en las pruebas para tener en cuenta esa fila, sin cambiar contratos.

Validación: 605 unitarios correctos (305 dominio, 172 web, 117 API, 11 SDK).
Cobertura dominio 89,59 %; módulo drag 97,96 % de sentencias. Lint/typecheck
generales correctos, más repetición dirigida tras afinado final. OpenAPI generado
sin diff. Pase completo Playwright 74/75; el único fallo era un punto de clic
fuera del enlace circular de Trimestre: corregido a un punto interior y pasa.
Siete pruebas finales correctas: seis de arrastre y la de Trimestre. Cubren mover,
redimensionar ratón/táctil, ambos sentidos de todo el día, teclado/cancelación,
Alt, auto-scroll, error/rollback/Reintentar, Deshacer, recurrencia y DST. API
simulada, navegador en America/New_York/cuenta Madrid; sin sesión real. Capturas
visuales de sombra y hora repetida sólo /tmp. Sin cambio de semana automático
al acercarse al borde horizontal (opcional en la especificación).

## 2026-10-22 — estilo compartido de pastillas de calendario (75.4)

RF-1101/1102 y RF-1903. Mes/Dos semanas, horario, Todo el día y Semana
móvil comparten superficie, borde lateral de color, radio, tipografía y tamaño
de casilla/icono mediante `calendar-chip`. En Mes el fondo y el color de lista
se aplican al contenedor completo: check dentro, título con elipsis y hora a
la derecha en su propio `time`. Eventos usan la misma superficie con icono.
Se mantiene el título rojo de tareas vencidas, confirmado por el usuario,
y se aplica también a las otras cuadrículas. Agenda conserva su formato de lista.

Validación: lint y typecheck generales correctos, 605 tests unitarios correctos;
OpenAPI regenerado sin cambios. Dos pruebas Playwright nuevas en claro/oscuro
verifican superficie compartida entre Mes, Dos semanas, Día y Semana, casilla
dentro de la caja, título vencido rojo y hora separada sin desbordamiento.
Capturas revisadas en /tmp; datos simulados, sin validación de sesión real.

Las 75 regresiones existentes de calendario, captura y arrastre pasan. En el
primer pase amplio una prueba nueva comparaba antes de cargar el color de la
lista; ahora espera ese estilo y las dos pruebas finales pasan (claro/oscuro).

## 2026-10-22 — 75.11 excluido del alcance

El usuario indica expresamente «Este no lo hagas». Se retira 75.11 del alcance
pendiente: no compartir el selector de periodos del Reporte semanal con Calendario.
Calendario conserva su selector actual. Esta decisión sustituye las indicaciones
anteriores sobre 75.11, incluida la aclaración vinculante del 21/10.

## 2026-10-22 — maquetación de la vista anual

RF-1101 / RF-1903. Nombres de mes centrados sobre su mini-calendario, con
mayúscula inicial y altura consistente. Retirado el margen negativo que acercaba
los días al título; separación explícita de 4px, padding interior uniforme y
gaps entre meses adaptados a escritorio y móvil. Conserva doce meses en el
viewport (4×3 escritorio, 3×4 móvil) y la navegación existente.

Capturas revisadas en /tmp con API simulada. Playwright: encaje y alineación de
los doce meses a 320/390/1280px en claro/oscuro, composición a zoom 200% y
navegación táctil anual correctos. Sin cambios de API; OpenAPI sin diff.
Lint y typecheck generales correctos. 605 unitarios correctos por paquetes;
lint interrumpido por recursos y un timeout de API en el primer pase concurrente
se resuelven al repetir lint y los 117 tests de API de forma aislada.

## 2026-10-22 — 76: alta homogénea global y de calendario

RF-101/102, RF-201/202, RF-1102 y RF-1902. CaptureSheet delega en la misma
tarjeta que QuickAddPopover: cabecera con fecha/prioridad, título, descripción
sin caja, etiquetas/adjuntos y pie con lista, etiquetas, más, cierre y enviar
azul. Global (+/N y URL de captura) usa tarjeta centrada con fondo oscuro
desenfocado; calendario conserva anclaje en escritorio. Móvil conserva el
modal amplio ya aprobado por el usuario, con el mismo contenido en ambos casos.
El alta en línea de Tareas mantiene su patrón de barra. N ya no la enfoca en
lugar de abrir la tarjeta global. Más opciones transfiere todos los campos.

Escape/cierre con borrador pide confirmación en línea; Seguir editando o Escape
en esa confirmación conserva el borrador. Clic fuera vacío cierra; con borrador
se conserva e impide acciones accidentales detrás. Envío bloquea cierre.
Ctrl/Cmd+Enter guarda desde el formulario; Enter guarda y Mayús+Enter añade
línea en descripción; IME respetado. Foco inicial, Tab contenido y retorno al
acceso de origen. Asa móvil permite cierre por gesto con la misma protección.

visualViewport ajusta altura/posición al teclado, tanto global como calendario.
Prueba con viewport visible de 400px y offset de 30px verifica pie visible.
Es simulación: queda comprobar teclado virtual en dispositivo real. Capturas
sólo /tmp con datos simulados. Sin APIs, modelo o eventos nuevos.

Validación final: 30/30 Playwright de altas globales/calendario y composer en
línea; 605 unitarios correctos, lint/typecheck generales correctos y verificación
final web. OpenAPI regenerado sin diff. Corregida carrera de retorno de foco
al cerrar menús: restaura el título salvo si ya se está escribiendo en la
descripción. Comprobaciones de N repetidas en 1280/390px correctas.

## 2026-10-22 — horas editables en línea y posición del selector de fecha

RF-601 / RF-1902. Hora y Hasta son campos de texto HH:mm en su propia fila,
sin abrir panel secundario ni selector nativo. Selección del contenido al
enfocar, Enter confirma el campo, validación de hora 24h; datos incompletos
o inválidos se revierten al perder foco. × en Hasta borra duración; × en Hora
conserva fecha, pasa a todo el día y borra duración. Se mantiene +30min al poner
hora sin duración y se conservan duraciones personalizadas al cambiar inicio.

DatePopover solicita desplazamiento de +16px horizontal y −16px vertical;
Popover conserva su ajuste de lado/altura y márgenes de viewport de 12px.
Los demás flotantes conservan desplazamiento cero. Capturas revisadas en /tmp
en 1280/390px con API simulada. 32/32 Playwright de alta y composer correctos,
más dos verificaciones finales de posición exacta/ajuste lateral y borrado.
Al quitar Hasta en una captura desde hueco, se guarda realmente sin duración ni
start_date; se elimina el fallback que reintroducía 30min al enviar desde ese
contexto. Prueba de persistencia con POST simulado correcta.
Aclaración posterior del usuario: conservar la edición en la misma fila, con
placeholder HH:mm que haga explícitos los dos puntos; × conserva la acción
Sin hora. Se añade el placeholder a ambos campos.
Validación: 33/33 Playwright finales, 605 unitarios y typecheck generales
correctos; lint de dominio/API y lint web corregido correctos. OpenAPI sin diff.

## 2026-10-22 — aclaración de controles de hora y confirmación de borrador

El usuario pide recuperar los controles nativos anteriores en la propia fila.
Hora/Hasta vuelven a input time (segmentos y controles del navegador), sin
el desplegable intermedio anterior, y conservan × para quitar la hora.
Selector CSS específico evita la regla heredada que estiraba los campos; ancho
6,5rem, alineación a la derecha y sin margen inferior. Mantiene edición HH:mm
y los comportamientos de +30min y borrado de fin ya verificados.

Confirmación sin fondo gris, texto y acciones centrados. Seguir editando usa
acento principal; Descartar queda como acción de texto roja, con foco accesible.
Esta indicación sustituye la propuesta previa de panel gris y acciones a la derecha.
Validación conjunta: 35 Playwright correctos, cuatro repeticiones finales de
confirmación/teclado correctas. Lint/typecheck generales y 606 unitarios correctos;
OpenAPI regenerado sin diff. Capturas locales revisadas en /tmp.

## 2026-10-22 — Hoy: alta ligera y vistas por iconos compartidos

RF-301/304, RF-502 y RF-1902/1903. Alta en línea común con fondo reducido al
35% de surface-3 y borde suave del sistema. Se retira la bombilla de Hoy.
Controles de Lista/Matriz/Kanban por iconos, con tooltip, nombre accesible y
estado pulsado. Compartidos con las páginas de listas, Mañana y vistas de tareas
equivalentes; Matriz sólo se ofrece en contextos que soportan su alcance.

Hoy Kanban distribuye las agrupaciones existentes en columnas, conservando
acciones/completado/orden; Hábitos es la última columna a la derecha y respeta
su opción de ocultar. No introduce nuevas columnas de dominio ni estados.
Mañana permite Lista/Kanban existentes y Matriz filtrada por el día siguiente
en la zona de cada tarea, mediante API de tareas existente. Preferencias locales
y URL de las vistas conservadas. Selector de alcance Matriz admite Mañana.

Validación: dos Playwright a 1280/390px comprueban controles, tarjeta legible,
orden de Hábitos y cambios de vista en Mañana. Pase conjunto 35/35 correcto.
606 unitarios, incluidos alcance Mañana, lint/typecheck generales y OpenAPI sin
diff correctos; comprobación web final adicional. Capturas sólo /tmp, API simulada.

## 2026-10-22 — Kanban: tarjetas, captura en columnas y detalle contextual

RF-301/304, RF-501/502, RF-1902/1903. Columnas transparentes, anchos acotados
y tarjetas con borde suave, altura por contenido, título multilínea y metadatos
que respetan el ancho. Lista de cada columna con scroll independiente. Hoy
agrupado por prioridad ofrece las cuatro columnas incluso vacías; Hábitos sigue
al final. Alta en línea superior oculta en Kanban.

En Kanban el panel derecho sólo se monta con tarea seleccionada. × elimina la
selección y recupera espacio del tablero. URL view=kanban y preferencia local
compatibles; enlaces directos y navegación entre vistas respetados. Tarjeta
abre detalle al pulsar su contenido no interactivo; controles mantienen su acción.

- en cabecera y primer hueco al final abren el modal compartido: Hoy conserva
  fecha y prioridad/lista/etiqueta del grupo; listas conservan proyecto y column_id,
  y agrupaciones por fecha conservan su fecha contextual. columnId viaja en el
  borrador y se preserva al expandir; se limpia si se cambia a otro proyecto.
  No se consideran cambios los valores iniciales del contexto: modal vacío cierra
  sin confirmación; ediciones reales conservan la protección de borrador.

Validación: 37 Playwright de editor/calendario/Kanban correctos, más pase final
Kanban con URL directa, creación desde ambas zonas, prioridad/column_id reales
en POST simulado, título largo sin desbordar, apertura y × del panel. 606 unitarios,
lint/typecheck generales y OpenAPI sin diff correctos, más verificación web final.
Capturas revisadas en /tmp; API simulada, pendiente revisión visual real del usuario.

### Kanban: interacción de tarjetas (22 oct 2026)

RF-304 y RF-1002: clic en toda la tarjeta, incluidos sus márgenes, abre el detalle;
checkbox, enlaces y acciones conservan su comportamiento. Hover azul suave sólo
en la tarjeta señalada. Arrastre entre columnas con indicación de destino:
secciones actualizan column_id; Hoy actualiza prioridad, lista, etiqueta principal
o fecha según la agrupación. Fechas conservan hora y duración. Reutiliza endpoints
públicos existentes, incluido moveTask para cambios de lista.

Validación: lint y typecheck generales, 606 unitarios y OpenAPI sin diff.
Pruebas Playwright de clic en padding, hover aislado y arrastre nativo entre
prioridades y secciones con persistencia simulada en API.

### Densidad de la vista lista (22 oct 2026)

RF-1001: filas desktop de 40 a 34 px (15 % menos de altura), con mínimo de
32 px al elegir densidad compacta. Texto, checkbox y metadatos conservan tamaño
y alineación. Ajuste compartido por Hoy y las listas que usan TaskList; móvil
y tarjetas Kanban mantienen sus dimensiones.

Corrección de densidad: se elimina además el padding heredado de 8 px por lado
y el borde duplicado de los li. Altura efectiva de fila desktop verificada en
34 px, incluido su contenedor. Clic en espacio vacío abre detalle en Hoy y
TaskList; hover suave ocupa el ancho completo, manteniendo acciones de botones.

Medición directa de Hoy en TickTick: filas consecutivas de 40 px, margen y
padding vertical cero; texto 14 px, área de texto 40 px y padding derecho 20 px.
Se ajusta TTD a 40 px efectivos (densidad compacta conserva 32 px), en vez de
los 34 px interiores del primer ajuste. La reducción real proviene de retirar
los 16 px verticales heredados y el borde duplicado del contenedor.

Checkbox en lista desktop: referencia TickTick medida con icono de 17 px y
7 px hasta el título. TTD ajusta el área del check a 24 px, retira padding del
título y deja 7,5 px entre icono y texto; la zona del input no invade el título.
Validación geométrica Playwright en Hoy y lista de proyecto.

## 2026-10-22 — continuación de 78/79 y pendientes transversales

Fuentes contrastadas: especificación única, documento vigente r75-lite y resumen
de alcance, además de código y estado actual de #73. Los encabezados originales
son «TTD-AUD-78 — Foco/Pomodoro: pantalla tipo TickTick (Pomo/Cronómetro, anillo
con progreso, Resumen y Registro) y sin panel de detalle» y «TTD-AUD-79 — Tokens
y MCP: lo que pidió la propuesta y no llegó en #71/#73». 76 y 77 ya tenían la
implementación principal; se han revisado sin restaurar diseños descartados.

### Implementación de Foco — RF-1201/1202/1204/1205/1206

- Cronómetro persistido, pausa/continuación con tiempo acumulado y reconstrucción
  desde servidor, duración por sesión sin reescribir ajustes globales.
- Endpoints públicos de pausa y continuación; validación explícita de DTO,
  aislamiento de propietario/listas al asociar una tarea y cierre concurrente
  sin duplicar eventos. Estadísticas por zona IANA de cuenta o `tz`, con totales
  de hoy; cronómetro suma tiempo sin convertirse en un pomodoro.
- Registro con título de tarea, paginación por cursor y agrupación por día local.
  Dos columnas en escritorio; Resumen/Registro debajo en móvil. Anillo fino,
  reloj centrado, selector de tarea, fases y descansos, pausa y confirmación de
  abandono. Atajos F y Espacio documentados. Ajustes globales en menú separado
  de los presets de sesión. El «+» de registro manual sigue oculto: opcional en 78.
- Mini reloj compatible con pausas/cronómetro; conservación del aviso de fin.
  Se emiten `focus.session_paused@v1`, `focus.session_resumed@v1` y
  `focus.settings_updated@v1`; catálogo de la especificación actualizado.

### Tokens y MCP — RF-2001/2002, TTD-AUD-38/43/47/49/59/79

- PAT con 30/90/365 días o sin caducidad; UI por defecto 90 días. Motivo de
  revocación derivado, filtro por origen personal/OAuth y recuento de renovaciones
  agrupado por aplicación en servidor, independiente de la página de tokens.
- Aplicaciones OAuth por cliente, scopes, autorización, último uso y actividad
  paginada entre renovaciones. Revocación conjunta de access/refresh en transacción;
  bloqueo por usuario/cliente compartido con la renovación evita carreras.
- Instrucciones diferenciadas Cursor/Otro (bearer), Claude/ChatGPT (OAuth), permisos
  plegables, sensibles identificados también en filas, formulario móvil y estados
  sin conexión. Corregido aviso de error duplicado de actividad.
- `api_catalog`: contrato público generado del mismo OpenAPI, con búsqueda y
  paginación. `api_request`: operaciones sin herramienta dedicada, JSON, archivos
  multipart base64 (25 MB), descargas, e Idempotency-Key. Reutiliza el bearer y
  vuelve a pasar por guards/DTO/scopes/owner/listas. No admite destinos externos,
  redirecciones ni llamadas MCP recursivas. No se sortean las operaciones que
  exigen sesión de navegador (S-15/S-16). Quick add conserva el parser compartido;
  probado también desde el nuevo transporte contra API y PostgreSQL reales.
- Preferencias por cuenta para Hoy y vistas de tareas: API GET/PUT pública,
  caché local, recarga y consulta periódica entre dispositivos. Evento
  `account.view_preference_updated@v1`. Corregida carrera de arranque de rutas
  habilitadas antes de aplicar la caché de preferencias.
- Google solicita Calendar calendarlist.readonly + events (con compatibilidad
  para autorizaciones anteriores), conserva scopes concedidos y distingue
  `invalid_grant` con reconexión, sin confundirlo con caducidad de sesión de ttd.
  Páginas públicas /privacy y /terms y enlaces desde login/registro.
- Plan del día móvil: capacidad oculta y cabecera alineada, según pendiente vigente.

### Evidencia y límites

- Migraciones generadas con `pnpm db:migrate` en base temporal aislada. La base
  local original tiene una migración histórica divergente y NO se ha reseteado.
  Aplicación completa y rollback SQL de ambas migraciones verificados en otra
  base temporal vacía. SQL inverso: `docs/migrations/20261022-focus-preferences-down.sql`;
  se niega a perder registros de cronómetro, pausas o preferencias.
- Pruebas de navegador con API simulada; las capturas nuevas de Foco/Tokens están
  en `/tmp/ttd-focus-*.png` y `/tmp/ttd-tokens-*.png`. Tests heredados actualizados al avatar de 77, cabecera/sidebar vigente,
  confirmaciones en línea y contratos de sesión completos. Esto no es validación
  real de las pantallas nuevas ni prueba de teclado virtual en dispositivo físico.
- Producción consultada en lectura: health devuelve `36f9209`. Login real 200,
  Google configurado/conectado y lectura de nueve calendarios 200; logout 204.
  No se han creado ni editado tareas/eventos reales. La conexión del propietario
  funciona en esa versión; NO acredita el código nuevo, acceso de no testers ni
  permanencia más de siete días. Sin errores JavaScript en login anónimo: dos
  401 esperados de /me y /auth/session; los cuatro errores históricos no reproducidos.
- La publicación/verificación de Google Cloud permanece externa y excluida de
  cambios automáticos. Falta acreditar audiencia no tester y autorización duradera.
- El usuario ha autorizado finalmente merge y despliegue, sustituyendo su
  restricción anterior. Se recuperó del historial el acceso correcto al VPS y responde; los alias
  locales que daban timeout no identificaban este despliegue. Backup previo completado y despliegue de `acd7570` realizado;
  comprobación posterior detallada abajo.
- Se mantienen excluidos 75.11 y Ticky F1–F10. Calendario móvil conserva el diseño
  aprobado; no se añaden propuestas históricas como funcionalidades nuevas.

### Correcciones encontradas en el repaso

- AUD-34: cerrar sesión marca el estado anónimo y elimina CSRF antes de vaciar
  consultas/navegar. Una respuesta de sesión anterior ya no puede autenticar
  otra vez el cliente tras logout. Regresión unitaria y recorrido de navegador.
- Estadísticas: normalización inicial de URL antes de interacción; esperar zona
  de cuenta evita que el primer preset se pierda al cargar.
- Agenda: alineación de casilla con la primera línea corregida (2 px), sin
  cambiar funciones de calendario móvil. Cuatro combinaciones de ancho/densidad.
- CodeQL: transporte genérico MCP con `node:http`, hostname y puerto fijos;
  sólo la ruta validada procede del agente. Sin redirecciones.

### Validación de esta continuación

- `pnpm lint`, `pnpm typecheck`, `pnpm test`: correctos en Node 26.
  **623 unitarias** (dominio 310, API 128, web 174, SDK 11).
- Integración completa: **131 correctas, 2 omitidas** (Ticky fuera del corte),
  PostgreSQL/Redis reales en base temporal; sin modificar tareas de producción.
- Contratos OpenAPI/SDK y catálogo MCP regenerados; migraciones y rollback
  verificados en bases aisladas. **Playwright completo: 262 correctas y 2 omitidas**, con API simulada.
  CI completo y CodeQL correctos en `be06896`, antes del merge.
- Commits de implementación: `0dbc0d0` (API/dominio/SDK/migraciones), `a2674d3`
  (Foco), `5e14ac0` (Tokens/preferencias), `1132595` (MCP) y `5d7d96f`
  (sesión/Estadísticas/regresiones), `4a89401` (evidencia) y `be06896` (formato).
  PR #73 mergeada en `acd7570` el 22/10/2026.

### Despliegue y comprobación real — 22/10/2026

- PR #73 finalizada y mergeada en main: `acd75706761c0bc5bd57d11dd06899d64bc4ff1f`.
  Main local actualizado. Backup previo privado de PostgreSQL, adjuntos y código;
  índices de archivo y checksums comprobados, imágenes anteriores conservadas.
  El backup previo queda en el VPS; no se presenta como nueva copia externa RF-1704.
- Imágenes API y web construidas en el VPS, migraciones ejecutadas por el
  entrypoint. Health público: `status=ok`, commit completo `acd7570…`.
- Cuenta real: login 200; Foco settings/stats/sessions, aplicaciones OAuth,
  renovaciones y preferencias `today`: todos 200. Google configurado/conectado;
  lectura de nueve calendarios 200 en el código nuevo.
- Navegador real de producción: Foco, Tokens, Mes, Año y Hoy a 1280 y 390 px.
  Diez aperturas, sin desbordamiento horizontal ni errores JavaScript; Año
  visible en 904/391 ms en esta máquina (no es medición de dispositivo físico).
  Editor global con N y menú del avatar abiertos/cerrados sin guardar datos.
  Logout desde la UI: 204 y redirección a login. Capturas privadas en /tmp.
- MCP HTTP real con PAT temporal de lectura: creación 201, initialize y
  tools/list 200, list_projects, api_catalog y api_request GET correctos.
  PATCH de Foco rechazado por scope_missing, sin modificación. Revocación del
  PAT 204 y logout 204; sólo se han creado/revocado credenciales de prueba,
  sin cambiar tareas, eventos ni sesiones de foco. El primer intento con
  permisos/argumentos insuficientes se rechazó correctamente; no se cuenta
  como funcionamiento correcto del escenario hasta repetir el contrato válido.

### Estado final y pendientes externos

- 78 y 79: implementación y validación local/integración cerradas; despliegue y
  lectura real acreditados. Las escrituras de Foco, tareas/adjuntos por MCP y
  revocación OAuth se prueban con usuarios temporales en PostgreSQL real, sin
  revocar aplicaciones personales ni generar sesiones de foco de producción.
- 76/77: conservados y regresiones verificadas; editor/avatar abiertos también
  con cuenta real. Falta teclado virtual de dispositivo físico para 76.
- Google: funcionamiento del propietario acreditado. Falta verificación/publicación
  de Google Cloud para no testers y duración mayor de siete días; no se ha
  cambiado esa configuración externa. Drive no se prueba adjuntando archivos
  personales; no se afirma validada una nueva copia de backup externa.
- Conector MCP de Codex: list_projects devuelve error interno -32603 del conector.
  La misma operación HTTP directa con PAT válido funciona; no aparece error de
  servidor en el recorrido. Queda revisar/reconectar el cliente y volver a
  descubrir herramientas; no se declara validado Claude/ChatGPT/Cursor reales.
- Calendario desktop: repaso en navegador y aceptación simulada; se conserva el
  detalle flotante compartido. Eso no implementa literalmente el TaskPeek compacto
  anclado histórico de 75.6; no se añade automáticamente ni se declara ese criterio
  literal acreditado. No se reabre móvil ni se incorpora 75.11. La consolidación
  de overrides CSS permanece deuda de mantenimiento, sin cambiar lo aprobado.
- Exclusiones conservadas: 75.11 y Ticky F1–F10. Los 162 archivos/estados locales
  del usuario conservan contenido/ausencia tras cambiar a main; localuser y los
  documentos aportados quedan fuera de commits.

No se declara aceptación global de todos los criterios físicos/externos ni
del patrón literal de 75.6 a partir de pruebas simuladas o históricas.

## R80 — TTD-AUD-80 a 104 (PR #75, en desarrollo)

Base actualizada: afc9f5d. Comprobación previa en [r80/verificacion-previa.md](r80/verificacion-previa.md). Una única PR por petición expresa de Pablo.

| ID  | Estado                                                                | Evidencia                           |
| --- | --------------------------------------------------------------------- | ----------------------------------- |
| 80  | Implementado; validación local; staging pendiente                     | [OAuth](r80/80-oauth.md)            |
| 81  | Implementado; aceptación local; copia de producción pendiente         | [Recurrencia](r80/81-recurrence.md) |
| 82  | Implementado; validación local                                        | [Tareas MCP](r80/82-tasks.md)       |
| 83  | Implementado; validación local                                        | [Paginación](r80/83-pagination.md)  |
| 84  | Implementado; validación local real MCP/API/web                       | [Foco](r80/84-focus.md)             |
| 85  | Pendiente de implementación y aceptación                              | PR #75                              |
| 86  | Implementado; validación local; variable global ausente en producción | PR #75                              |
| 87  | Pendiente de implementación y aceptación                              | PR #75                              |
| 88  | Pendiente de implementación y aceptación                              | PR #75                              |
| 89  | Pendiente de implementación y aceptación                              | PR #75                              |
| 90  | Pendiente de implementación y aceptación                              | PR #75                              |
| 91  | Pendiente de implementación y aceptación                              | PR #75                              |
| 92  | Pendiente de implementación y aceptación                              | PR #75                              |
| 93  | Pendiente de implementación y aceptación                              | PR #75                              |
| 94  | Pendiente de implementación y aceptación                              | PR #75                              |
| 95  | Pendiente de implementación y aceptación                              | PR #75                              |
| 96  | Pendiente de implementación y aceptación                              | PR #75                              |
| 97  | Pendiente de implementación y aceptación                              | PR #75                              |
| 98  | Pendiente de implementación y aceptación                              | PR #75                              |
| 99  | Pendiente de implementación y aceptación                              | PR #75                              |
| 100 | Pendiente de implementación y aceptación                              | PR #75                              |
| 101 | Pendiente de implementación y aceptación                              | PR #75                              |
| 102 | Pendiente de implementación y aceptación                              | PR #75                              |
| 103 | Pendiente de implementación y aceptación                              | PR #75                              |
| 104 | Pendiente de implementación y aceptación                              | PR #75                              |

- TTD-AUD-85: contrato implementado y probado localmente; reparación de datos pendiente de copia de producción (véase r80/85.md).

- TTD-AUD-87–92: implementación y verificación local en r80/87-92.md; capturas comparativas disponibles. Pendiente revisión global del lote y requisitos de densidad extrema del calendario.

- TTD-AUD-99: pasos 1–6 implementados en commits separados; inventario de producción de solo lectura: 0 filas y 4 ficheros huérfanos/201 bytes preservados. Capturas y pruebas sintéticas de Drive, MCP, correo y Telegram. Modelo sin almacenamiento local y rollback verificado. Pendientes pruebas externas; sin borrado de producción.

- TTD-AUD-93: sidebar con cinco secciones, filtros persistentes y PeriodNavigator compartido implementados; ocho Playwright y dos e2e de Calendar en verde. Evidencia en r80/93.md.

- TTD-AUD-94: paso inicial de fuentes por usuario y recuentos del dominio implementados; 17+1→18, exclusión→1/17 ocultas. Unitarias, siete e2e HTTP y 36 Playwright en verde; r80/94.md.

- TTD-AUD-95: total/cumplimiento explicados, icono de 14 px y semana actual con agregado diario; dominio, fallback, 12 Playwright y regresión semanal en verde. r80/95.md.
