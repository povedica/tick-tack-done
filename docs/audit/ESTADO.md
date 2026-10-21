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
