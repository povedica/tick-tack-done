# Prompt para Cursor: ronda 3 — tick-tack-done contra TickTick (19-oct-2026)

Contexto. Tercera auditoría de https://todo.reflexionia.com/ (19-oct-2026, 00:48-01:05 CEST), esta vez comparando función por función contra la cuenta real de TickTick de Pablo (ticktick.com/webapp), que es la referencia de comportamiento correcto. Se verificó en vivo cuál de los 34 ítems de la auditoría anterior (v3) está resuelto y se probaron recordatorios, recurrencia, borrado/duplicado, Focus, etiquetas, papelera, calendario, kanban, timeline, ajustes y móvil. En TickTick se crearon y se borraron tareas "ZZ TEST" solo para observar el parser y los menús; su cuenta quedó como estaba (All 214, inbox 12). En todo.reflexionia.com se crearon y se eliminaron por completo tareas, etiquetas y hábitos "ZZ TEST" (la papelera quedó con sus 23 tareas originales de Pablo, nada más).

Cómo usar este documento. Cada hallazgo lleva **Qué es**, **Resultado actual**, **Resultado esperado (TickTick)** y **Cómo arreglarlo** con rutas de archivo. Prioridades: P0 (rompe el uso o muestra datos mal), P1 (muy visible), P2 (pulido/paridad). Regla general: TickTick es la referencia; cuando tick-tack-done se desvíe, copia el comportamiento de TickTick.

---

## 0. AVISO IMPORTANTE: el despliegue de producción no coincide con `main`

El build desplegado en todo.reflexionia.com está POR DELANTE de `main` (41e866d) en GitHub. Pruebas:

- Focus en producción usa sesiones de servidor (sobrevive a recargar); en `main` `FocusPage` sigue siendo `useState` local (`apps/web/src/features/places/Places.tsx` ~587).
- `GET /api/v1/smart-lists` responde en ~230 ms en producción; en `main` `SmartListsService.list()` sigue cargando todas las tareas y contando en JS (`apps/api/src/modules/filters/smart-lists.service.ts` ~35-55).
- Los recordatorios funcionan en producción; en `main` `TaskDetail.tsx` (~163, ~375) sigue enviando `trigger: '-PT30M'` sin prefijo.
- El borrado definitivo por elemento (`DELETE /api/v1/tasks/trash/:id`) funciona en producción; en `main` el controller solo tiene `DELETE /tasks/trash` (vaciar todo) y `POST /tasks/trash/:id/restore` (`apps/api/src/modules/tasks/tasks.controller.ts` ~85-121).
- La UI de producción está en español; `main` tiene los textos pero el build desplegado incluye además las traducciones aplicadas a shell y ajustes.

**Acción:** sube a GitHub los cambios que están desplegados (commit + push desde la rama que generó el build), y fija el despliegue para que cada build salga de un commit conocido. Hasta entonces, cualquier arreglo hecho sobre `main` puede pisar trabajo ya desplegado. Además: añade un endpoint o cabecera con el commit desplegado (p. ej. `GET /api/v1/health` -> `{status, commit}`) para poder verificarlo sin adivinar.

---

## 1. Estado de los 34 ítems de la auditoría anterior (verificado en vivo)

| #     | Ítem                                | Estado                 | Notas                                                                                                                                                                                                                                    |
| ----- | ----------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1  | smart-lists 1.6-2.5 s               | ✅ Resuelto            | 233 ms en frío; ninguna petición del arranque > 400 ms                                                                                                                                                                                   |
| P0-2  | Peticiones duplicadas / refetch     | ✅ Resuelto            | Arranque en frío: 8 peticiones, una por recurso, sin rondas repetidas                                                                                                                                                                    |
| P0-3  | Scroll horizontal                   | 🟡 Parcial             | Resuelto en todas las vistas de lista (scrollWidth 1265 = innerWidth 1280). **Sigue fallando con el panel de detalle abierto: scrollWidth 2176** (barra horizontal en toda la página)                                                    |
| P0-4  | Detalle solapado                    | ✅ Resuelto            | Panel limpio con fondo sólido en desktop; en móvil es pantalla completa sin solapes. Queda el scroll horizontal del punto anterior                                                                                                       |
| P0-5  | Completed sin check                 | ✅ Resuelto            | Checks rellenos, tachado, "Completada <fecha>", contador 207 correcto. Detalle: la fecha queda truncada ("Completad", "Compl") — ver hallazgo nuevo N-4                                                                                  |
| P0-6  | Etiquetas no clicables / sin página | ✅ Resuelto            | Página `/tag/:id` con TaskRow completo (check, prioridad, chips enlace, +N, lista, fecha); chips clicables en filas y detalle; búsqueda usa filas con checkbox                                                                           |
| P1-7  | Grip decorativo                     | ❌ Abierto             | `draggable="false"` y el grip se muestra en todas las filas (incluida la búsqueda, donde no tiene sentido)                                                                                                                               |
| P1-8  | Pie del sidebar                     | ✅ Resuelto            | Una fila de 3 iconos (vaciar, tema, contraer)                                                                                                                                                                                            |
| P1-9  | Ajustes rotos                       | 🟡 Parcial             | Secciones agrupadas (General/Productividad/Avanzado) y en español. Siguen: radios a ancho completo con huecos enormes, texto duplicado "El tema, la densidad..." + "Tema: auto", acento como radios de texto en vez de círculos de color |
| P1-10 | Calendario sin estilo               | 🟡 Parcial             | Cuadrícula estilizada con chips y navegación. Siguen: nombres de mes/días en inglés, tareas con hora aparecen un día tarde (bug N-1, P0), "No hay calendarios externos." suelto                                                          |
| P1-11 | Pantallas sin estilo                | ✅ Casi                | Hábitos, Filtros, Matriz, Focus, Tokens, Datos, Automatizaciones, Webhooks rediseñados. Restan detalles de kanban (N-6)                                                                                                                  |
| P1-12 | Móvil                               | ✅ Resuelto            | Sin scroll horizontal (390=390), filas con elipsis, etiquetas bajo el título, barra inferior Hoy/Calendario/+/Listas/Más, detalle a pantalla completa                                                                                    |
| P1-13 | Contadores incoherentes             | ✅ Resuelto            | Hoy 58 = filas de Today; todos los contadores se refrescan al instante tras crear/borrar/completar                                                                                                                                       |
| P2-14 | Detalles de fila                    | 🟡 Parcial             | "Repeat" ya no sale en todas las filas (icono ↻ solo en recurrentes). Siguen: fechas "May 4"/"Mar 19" en inglés y sin año, sin formato relativo (hoy/mañana), títulos importados conservan `#etiqueta` duplicada con el chip             |
| P2-15 | Papelera sin acciones               | ✅ Resuelto            | Restaurar y Eliminar por elemento; `/trash` redirige a `/smart/trash`                                                                                                                                                                    |
| P2-16 | Mezcla de idiomas                   | 🟡 Parcial             | UI en español. Siguen en inglés: "Monday, October 19", "October 2026", cabeceras de día Mon/Tue, fechas "Mar 19", "Oct 19, 2026, 12:00 AM" (ver N-3)                                                                                     |
| P2-17 | Datos importados / varios           | 🟡 Parcial             | Sección de etiquetas muy mejorada (contadores, buscador, "Mostrar sin uso"). Siguen: títulos con `#tag` sin limpiar, scrollbar horizontal en la zona de Listas del sidebar                                                               |
| P0-18 | Etiquetas paginadas a 50            | ✅ Resuelto            | El sidebar muestra las 56 etiquetas (26 en uso + 30 sin uso)                                                                                                                                                                             |
| P0-19 | Contadores sin refrescar            | ✅ Resuelto            | Smart lists, listas y papelera se actualizan al instante (Bandeja 13→16, Papelera 33→34 en vivo)                                                                                                                                         |
| P1-20 | "Could not save." en recurrencia    | ✅ Resuelto            | "Cada semana" guarda `RRULE:FREQ=WEEKLY;BYDAY=TU` en tarea con hora. Pero se muestra el RRULE crudo (N-2)                                                                                                                                |
| P1-21 | Borrar/duplicar sin feedback        | ✅ Resuelto            | Toast "Tarea duplicada"; "Confirmar borrado" + toast "Tarea movida a la papelera" con Deshacer. Matiz de paridad: TickTick borra al instante con toast (ver N-9)                                                                         |
| P2-22 | Parser de captura                   | ✅ Resuelto            | `p1` = prioridad alta; `every weekday at 9am` -> fecha + `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`. Ojo a la divergencia con TickTick (N-10)                                                                                              |
| P0-23 | "Add reminder" no crea nada         | ✅ Resuelto            | Se crea (`TRIGGER:-PT30M`) y aparece al instante. Pero se muestra crudo "TRIGGER:-PT30M · " (N-2)                                                                                                                                        |
| P0-24 | Focus roto / texto falso            | ✅ Resuelto            | Sesiones reales en servidor, sobrevive a recargar, duraciones 15/25/50, Terminar/Cancelar. Problemas nuevos: N-5                                                                                                                         |
| P1-25 | Kanban                              | 🟡 Parcial             | Tarjetas con borde/redondeo. Sin retest de arrastre. Restan: checkbox suelto encima de la tarjeta, input de sección cortado, tarjetas sin fecha/etiquetas/prioridad (N-6)                                                                |
| P1-26 | Timeline                            | ✅ Resuelto            | Eje de días real (19 Mon, 20 Tue...), tareas colocadas por día, "Poner hoy", zoom day/week/month                                                                                                                                         |
| P1-27 | Process all                         | ⏸️ Sin retestar        | El código de `main` sigue igual (`snoozeTask(..., 'tomorrow')` directo, `Places.tsx` ~88); verificar contra el despliegue                                                                                                                |
| P1-28 | Etiquetas sin gestión               | 🟡 Parcial             | Sidebar: "Nueva etiqueta", buscador, "Renombrar" por etiqueta, "Mostrar sin uso". Siguen sin UI: borrar y fusionar (solo API: `DELETE /tags/:id`, `POST /tags/merge`)                                                                    |
| P1-29 | Automations/Webhooks/Sharing/Data   | ✅ Resuelto            | "Crear automatización", "Crear webhook", integraciones con estado (Telegram/Drive Conectado), Datos con exportar + texto de restaurar                                                                                                    |
| P1-30 | Calendario día ISO crudo            | ✅ Resuelto            | Vista día muestra la tarea con formato ("ZZ TEST R3 prioridad / Hoy")                                                                                                                                                                    |
| P2-31 | Notas zombi en papelera             | ⏸️ Por verificar en UI | La API de papelera sí devuelve la nota (`kind:"note"`); confirmar que la vista la muestra y se puede restaurar                                                                                                                           |
| P2-32 | Atajos                              | ⏸️ Sin retestar        | No se pudo confirmar si `N` abre el sheet o la página                                                                                                                                                                                    |
| P2-33 | Hábitos archivados                  | ✅ Resuelto            | Sección "Archivados" con botón "Recuperar"                                                                                                                                                                                               |
| P2-34 | Filtros                             | 🟡 Parcial             | Formulario mejorado (Nombre, Modo Normal/Avanzado, condiciones por tipo). Contador incoherente sin retestar                                                                                                                              |
| P2-35 | Tema oscuro y PWA                   | ✅ Resuelto            | Sin cambios, correcto                                                                                                                                                                                                                    |

Resumen: 20 resueltos, 9 parciales, 1 abierto (P1-7), 4 sin retestar (P1-27, P2-31, P2-32 y el contador de P2-34).

---

## 2. Hallazgos nuevos (ronda 3)

### N-1 (P0). Calendario mensual: las tareas con hora aparecen un día tarde

**Qué es.** La colocación de tareas en las celdas del mes (`/calendar/month`).

**Resultado actual (probado).** "ZZ TEST R3 hora" con vencimiento 20-oct 10:00 (Europe/Madrid) aparece en la celda del **21**; "ZZ TEST R3" (9:00 del 19-oct) aparece en la celda del **20**. Las tareas de día completo se colocan bien. La vista Timeline coloca las mismas tareas en el día correcto, así que el bug es solo de la vista mensual.

**Causa.** `apps/web/src/features/places/month.ts`: `cellKey(day)` hace `day.toISOString().slice(0, 10)` — la fecha UTC de la medianoche local de la celda (en Madrid, el día anterior a las 22:00 UTC) — y `tasksOnCell` la compara con `due_date.slice(0, 10)` (fecha UTC del instante). Una tarea a las 08:00Z del día D cae en la celda cuyo toISOString empieza por D, que es la celda local D+1. El propio comentario del código avisa: "Do not use this as a human date".

**Resultado esperado (TickTick).** Cada tarea en la celda de su día local; las tareas con hora muestran la hora en el chip.

**Cómo arreglarlo.** En `tasksOnCell` usa la fecha **local** de ambos lados: `localDateParam(day)` para la celda (ya existe en el mismo archivo) y, para la tarea, `new Date(due_date)` formateado con `localDateParam` en la zona del usuario (para tareas `is_all_day`, el `due_date` ya es la medianoche local: su slice UTC es el día correcto; para tareas con hora, convierte con la zona). Muestra la hora (`HH:mm`) en el chip de las tareas con hora. Test: tarea a las 10:00 del 20 -> celda 20, a 1280 y 390 px.

### N-2 (P1). Recordatorios y repetición se muestran como texto crudo

**Qué es.** Cómo se muestran los recordatorios y la repetición en el detalle de tarea.

**Resultado actual (captura y probado).** La lista de recordatorios muestra `TRIGGER:-PT30M · ` (con el separador colgando) y la sección Repetición muestra `RRULE:FREQ=WEEKLY;BYDAY=TU`.

**Resultado esperado (TickTick).** Etiquetas humanas: "30 min antes", "Cada semana". TickTick muestra la fecha como "6 months ago, Apr 28, 10:00 ↻" (relativo + absoluto + icono de repetición), nunca la cadena iCal.

**Cómo arreglarlo.** `apps/web/src/features/tasks/TaskDetail.tsx` (~354): formatea el trigger con el mismo diccionario que el combobox (`-PT30M` -> "30 min antes", `-PT1H` -> "1 h antes", `-P1D` -> "1 día antes"; absoluto -> fecha/hora local) y el RRULE con un `describeRRule()` en `@reflexionia/domain` (FREQ=DAILY -> "Cada día", WEEKLY+BYDAY -> "Cada semana (los martes)" / "Cada día laborable", MONTHLY -> "Cada mes"). Quita el `·` cuando no hay canal que mostrar.

### N-3 (P1). Fechas y nombres de mes/día en inglés con la UI en español

**Qué es.** Locale de todos los formatos de fecha.

**Resultado actual.** "Monday, October 19" (cabecera de Today), "October 2026" y "Mon/Tue/..." (calendario), "Mar 19" y "May 4" (filas), "Oct 19, 2026, 12:00 AM" (campo Fecha del detalle). Causa probable: `apps/web/src/features/tasks/model.ts` ~107 usa `Intl.DateTimeFormat('en-CA', ...)` y otros sitios usan `navigator.language` del navegador (inglés) en vez del idioma elegido en ajustes.

**Resultado esperado (TickTick).** Con la UI en español: "lunes, 19 de octubre", "octubre 2026", "lun/mar/...", "19 mar", "19 oct 2026, 0:00". Además formato relativo donde toca: "Hoy", "Mañana" (TickTick muestra la fecha en verde si es hoy y en rojo solo si está vencida).

**Cómo arreglarlo.** Una sola utilidad `formatDate(date, style, locale)` en `@reflexionia/domain` o `apps/web/src/lib`, con el locale del ajuste de idioma (no `navigator.language`), usada por filas, detalle, cabecera de Today, calendario y papelera. Añade año cuando no sea el actual y relativo Hoy/Mañana para fechas cercanas. Test de claves: ninguna cadena de fecha con mes en inglés cuando `language=es`.

### N-4 (P1). Lista Completadas: la fecha de completado queda cortada ("Completad")

**Qué es.** La columna de fecha en `/smart/completed`.

**Resultado actual (captura 02).** Se lee "Completad" o "Compl" según el ancho; la fecha completa no cabe.

**Resultado esperado (TickTick).** Se ve "Completed Oct 18" entero (o "18 oct"); si no cabe, solo la fecha.

**Cómo arreglarlo.** En la fila de Completed muestra solo la fecha (`18 oct`) con tooltip "Completada el 18 de octubre", o reserva ancho fijo para la etiqueta completa. Mismo componente de fecha de N-3.

### N-5 (P1). Focus: sesiones zombi, filtro `status` ignorado y tiempo inflado

**Qué es.** Ciclo de vida de las sesiones de foco.

**Resultado actual (probado).** Tres sesiones creadas el 18-oct quedaron "activas" para siempre con `remaining_seconds: 0`: al entrar en `/focus` la página las retomaba con el reloj a "0:00". Al pulsar Terminar en una sesión abierta hacía 4 h, registró `actual_seconds: 7888` (2 h 11 min) como tiempo de foco real, inflando las estadísticas. Además `GET /api/v1/focus/sessions?status=active` devuelve también sesiones ya terminadas: en `main` el endpoint ni siquiera lee `status` (`apps/api/src/modules/focus/focus.controller.ts` ~167-186, solo filtra `from`/`to`).

**Resultado esperado (TickTick).** Un pomodoro que supera su duración termina solo (o se marca abandonado); las estadísticas nunca cuentan más que la duración planificada; el listado filtra por estado de verdad.

**Cómo arreglarlo.** (1) En el `finish`, cap `actual_seconds` a `planned_minutes * 60`. (2) Al listar/hidratar, trata como expirada cualquier sesión con `started_at + planned < now` y ofrece descartarla, no retomarla. (3) Implementa el filtro `status=active|completed|aborted` en el endpoint (y pruébalo). (4) Considera un job que cierre sesiones abandonadas.

### N-6 (P2). Kanban: restos visuales

**Resultado actual (captura).** El checkbox de completar flota encima de cada tarjeta, desconectado; el input "Añade una sección para usar e..." está cortado; las tarjetas no muestran prioridad, fecha ni etiquetas; el texto de la tarjeta va centrado. Sin retest de arrastre (en `main` el drop sigue sin invalidar la lista y con `window.alert` para el límite WIP: `apps/web/src/features/tasks/TaskList.tsx` ~419-430).

**Resultado esperado (TickTick).** Tarjeta con checkbox integrado a la izquierda del título, prioridad por color del checkbox, fecha y etiquetas en el pie de la tarjeta; al soltar, la columna se actualiza al instante y se puede devolver a "Sin sección".

### N-7 (P2). Ajustes > Apariencia: restos

**Resultado actual (captura).** Radios de Tema a ancho completo con huecos; fieldset de Densidad con borde; acento como radios de texto ("indigo violet teal..."); textos duplicados ("El tema, la densidad y el idioma se aplican al momento." + "Tema: auto"); la navegación de secciones son enlaces que envuelven en varias líneas sin estado activo claro.

**Resultado esperado (TickTick).** Tema como segmented control (Auto/Claro/Oscuro), acento como círculos de color, una descripción por sección, navegación de secciones en columna con la activa resaltada.

### N-8 (P2). Menú de acciones del detalle: faltan acciones que TickTick sí tiene

**Resultado actual.** El detalle tiene "Copiar enlace", "Duplicar", "Borrar" (y "Convertir a nota"). El menú ··· de TickTick tiene además: **Add Subtask, Link Parent Task, Pin, Won't Do, Tags, Upload Attachment, Start Focus, Task Activities, Save as Template, Export, Print**.

**Resultado esperado (TickTick).** Prioriza: "Iniciar foco" (arranca una sesión de Focus con la tarea asociada — la API ya admite `task_id`), "Fijar" (pin arriba de la lista), "Añadir subtarea", "Convertir a nota" (ya), "Actividad" (historial). El resto puede esperar.

### N-9 (P2). Borrado: confirmación de dos clics vs borrado inmediato de TickTick

**Resultado actual.** Borrar exige dos clics ("Borrar" -> "Confirmar borrado").

**Resultado esperado (TickTick).** TickTick borra al instante y muestra toast "Task deleted" (con Deshacer). Si tick-tack-done ya tiene toast con Deshacer (lo tiene), quita el segundo clic y deja el Deshacer como red de seguridad. Es la referencia que Pablo pidió seguir.

### N-10 (P2). Parser de captura: divergencia con TickTick en prioridades inline

**Resultado actual (probado en ambos).** tick-tack-done: `p1` -> prioridad alta, `!1` -> alta. TickTick web: ni `p1` ni `!1` se interpretan — quedan en el título (la prioridad se pone con la bandera del detalle).

**Resultado esperado.** Decisión de Pablo: mantener el parser extra (es más cómodo y no rompe nada) o igualar a TickTick. Recomendación: mantener, pero documentarlo en la ayuda de captura.

### N-11 (P2). Estructura de listas: agrupación por prioridad y notas como elementos

**Resultado actual.** "Bandeja de entrada" es una lista plana.

**Resultado esperado (TickTick).** La vista de lista agrupa por prioridad (High / Medium / None) y muestra las **notas** como elementos con icono propio (sección "Note"). Además en "All" TickTick muestra el grupo "Overdue 55" con acción "Postpone" (aplazar en bloque). tick-tack-done no tiene ni aplazar en bloque ni sección de notas.

### N-12 (P2). Contador de etiqueta incoherente entre sidebar y página

**Resultado actual.** Sidebar: "personal 14"; cabecera de `/tag/personal`: "13". Uno de los dos cuenta (o no) completadas/subtareas.

**Cómo arreglarlo.** Una sola consulta de conteo por etiqueta (la misma cláusula en API para ambos) y test que los compara.

### N-13 (P2). Restos visuales varios

- Zona de Listas del sidebar con scrollbar horizontal visible y nombres cortados ("Notas Managemen...").
- Chip de tarea de día completo con fecha de hoy se pinta en rojo (parece vencida) en la vista mensual; en TickTick hoy no es rojo.
- El grip de arrastre aparece también en la búsqueda, donde no se puede ordenar (relacionado con P1-7).
- "No hay calendarios externos." como párrafo suelto en el calendario; mover a un enlace discreto en ajustes o a un empty state con CTA.
- "Añadidas hace poco" (300) mezcla completadas y pendientes sin indicarlo; TickTick no tiene esta lista. Considera renombrarla o excluir completadas.
- La página Focus no muestra estadísticas (la API `/focus/stats` existe: racha, pomodoros completados); TickTick sí las muestra.
- "Mañana" a las 00:52 se resolvió al día siguiente calendario (20-oct). Es la interpretación estándar de los parsers, pero conviene documentarla.

---

## 3. Comportamiento de referencia observado en TickTick (cuenta real, 19-oct-2026)

- **Fila de tarea:** checkbox con borde de color de prioridad; título con elipsis; chips de etiqueta coloreados con "+N"; nombre de lista; iconos de subtarea/nota/repetición; fecha a la derecha en rojo SOLO si vencida.
- **Vista All:** grupo "Overdue 55" arriba con acción "Postpone"; inbox y lista "inbox" coexisten en el sidebar (la duplicidad Bandeja/Bandeja de tick-tack-done imita bien esto).
- **Detalle:** panel derecho fijo, fecha arriba como "6 months ago, Apr 28, 10:00 ↻", bandera de prioridad, contenido con checklist markdown (lo hecho, tachado), pie con lista + menú ··· (ver N-8). No hay scroll horizontal de página con el panel abierto.
- **Quick add:** hereda la fecha de la vista (Today -> hoy). No parsea `p1` ni `!1`; los deja en el título. Sí parsea fechas en inglés.
- **Borrado:** inmediato + toast "Task deleted".
- **Inbox:** agrupado por prioridad; notas con icono propio en sección "Note".
- **Contadores:** All = pendientes con y sin fecha; Today incluye vencidas.

---

## 4. Datos de prueba y limpieza

- **TickTick:** creadas y borradas "#capturada ZZ TEST p1 algo" y una tarea sin título válido ("ZZ TEST bang !1" no llegó a crearse). Queda la tarea borrada en la papelera de TickTick (Pablo puede vaciarla). Contadores verificados al terminar: All 214, inbox 12 (igual que al empezar). No se tocó ninguna tarea real.
- **todo.reflexionia.com:** eliminados definitivamente 11 elementos "ZZ TEST" de la papelera (incluida la nota "ZZ TEST mover 1"), 5 tareas activas/completadas "ZZ TEST R3/5" (borradas y purgadas) y el hábito archivado "ZZ TEST hábito". La papelera queda con las 23 tareas originales de Pablo, verificado por API. No se tocó ninguna tarea real.
- **Focus:** se terminaron/cancelaron las 3 sesiones zombi del 18-oct y la sesión de prueba de esta ronda. Una de ellas registró 2 h 11 min de foco ficticio en las estadísticas (efecto del bug N-5); no hay forma de borrarla desde la UI.

---

## 5. Orden de trabajo recomendado

1. **Subir a GitHub lo desplegado** (sección 0) y añadir commit al health check.
2. **N-1** (calendario mensual, día tarde) — es un dato mal mostrado, P0.
3. **N-2 + N-3 + N-4** (formato humano de recordatorio/repetición/fechas) — mismo paquete de "texto legible".
4. **N-5** (ciclo de vida de Focus) — cap de duración, expiración, filtro de estado.
5. **P0-3 restante** (scroll horizontal con el detalle abierto).
6. **N-6/N-7** (pulido kanban y apariencia) y **P1-7** (grip: o funciona o se quita).
7. Paridad TickTick (N-8, N-9, N-11) según apetito.

Criterios de aceptación de esta ronda:

- `scrollWidth <= innerWidth` también con `?task=<id>` abierto, a 1280/820/390.
- Tarea a las 10:00 del día D visible en la celda D del mes.
- Ninguna cadena `TRIGGER:`/`RRULE:`/mes en inglés visible con idioma español.
- `/focus` nunca retoma una sesión expirada; `finish` nunca registra más de lo planificado; `GET /focus/sessions?status=active` solo devuelve activas.

---

## 6. Ronda 4 — revisión en vivo local vs producción (19 oct 2026, mañana)

Comparación hecha en `http://localhost:5173` (rama `fix/ux-audit-2026-10-18`) y en `https://todo.reflexionia.com`, más el DOM de TickTick (`ticktick.com/webapp`, vista All). El lateral de TickTick sigue siendo el medido en la spec de UI: texto `#191919` sobre fondo claro, carril de iconos `#4772fa`.

### Hallazgos de esta pasada

| Id   | Qué                                                                   | Dónde                                                                                                                                                                                                         | Estado tras el arreglo                                                                                                                                                                                                               |
| ---- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R4-1 | `/smart/*` dejaba la app en blanco                                    | `rowsFromView` leía `.length` de `repeat_rule` cuando la vista no lo trae (`undefined`)                                                                                                                       | Corregido. `/smart/tomorrow` pinta la lista. Un error de pantalla ya no vacía `#root`                                                                                                                                                |
| R4-2 | El azul del lateral local no coincidía con producción ni con TickTick | Local había pasado a `#c5d6fc` / `#6f92f8`. Producción seguía en `#f2f5fe`. TickTick: lateral claro y carril `#4772fa`                                                                                        | Restaurado `--sidebar-bg: #f2f5fe` y `--rail-bg: #4772fa`                                                                                                                                                                            |
| R4-3 | Añadir tarea bien maquetado en local y no en producción               | En escritorio, `.screen-page input` (`max-width: 28rem`) ganaba a `.inline-add input`. El campo se quedaba en 448 px y Fecha / Abrir detalle, anclados al borde del formulario, quedaban sueltos a la derecha | El campo de alta ocupa todo el ancho de la lista y los iconos quedan dentro, a la derecha del texto                                                                                                                                  |
| R4-4 | Las listas inteligentes no tenían el campo «+ Añadir tarea»           | `TaskList` solo lo pintaba si había `createProjectId`                                                                                                                                                         | Las vistas que no son papelera ni completadas usan la bandeja                                                                                                                                                                        |
| R4-5 | Con el detalle abierto, `scrollWidth` 2206 a 1280                     | Un `input.sr-only` del detalle heredaba `width: 100%` y se salía del panel                                                                                                                                    | Excluido de esa regla. Con el detalle abierto, `scrollWidth === innerWidth` (1280)                                                                                                                                                   |
| N-1  | Calendario mensual, un día tarde                                      | `tasksOnCell` comparaba la fecha UTC                                                                                                                                                                          | Compara el día local (`calendarDateKey`). Hoy no se pinta en rojo. El chip con hora muestra `HH:mm`                                                                                                                                  |
| N-2  | `TRIGGER:` y `RRULE:` crudos                                          | Detalle                                                                                                                                                                                                       | «30 min antes», «Cada día laborable», etc. Sin `·` si el canal es push                                                                                                                                                               |
| N-3  | Fechas en inglés                                                      | `navigator.language`                                                                                                                                                                                          | El formato usa el idioma de ajustes (`es` por defecto), también el calendario y el campo Fecha                                                                                                                                       |
| N-4  | «Completad» cortado                                                   | Fila de completadas                                                                                                                                                                                           | Solo la fecha corta; el tooltip lleva «Completada el …»                                                                                                                                                                              |
| N-5  | Focus zombi y tiempo inflado                                          | API y página                                                                                                                                                                                                  | `actual_seconds` nunca pasa de lo planificado. Una sesión ya vencida se aborta; si el reloj llega a cero en pantalla, se termina. `?status=active` no devuelve terminadas ni expiradas. La página muestra racha, pomodoros y minutos |
| N-6  | Kanban                                                                | Tarjeta                                                                                                                                                                                                       | Checkbox junto al título, fecha y etiquetas debajo, input de sección al ancho de la columna, sin `alert` de WIP                                                                                                                      |
| N-7  | Ajustes de apariencia                                                 | Tema y acento                                                                                                                                                                                                 | Tema y densidad en control segmentado. Acento en círculos de color. Quitado el párrafo duplicado                                                                                                                                     |
| N-8  | Menú del detalle                                                      | Paridad                                                                                                                                                                                                       | Añadido «Iniciar foco» (la API ya admite `task_id`). Actividad ya estaba. Fijar y subtarea siguen pendientes                                                                                                                         |
| N-9  | Borrar con dos clics                                                  | Detalle                                                                                                                                                                                                       | Un clic, toast y Deshacer                                                                                                                                                                                                            |
| N-10 | `p1` / `!alta`                                                        | Parser                                                                                                                                                                                                        | Se mantiene (es más cómodo). Queda explicado en Ajustes → Captura                                                                                                                                                                    |
| N-11 | Agrupación                                                            | Listas inteligentes                                                                                                                                                                                           | Por defecto se agrupan por prioridad. Las notas ya no se ocultan. Falta la acción «Aplazar» del grupo Vencidas                                                                                                                       |
| N-12 | Contador de etiqueta                                                  | Página `/tag`                                                                                                                                                                                                 | La página ya no descarta notas, que el contador del lateral sí incluía                                                                                                                                                               |
| N-13 | Restos                                                                | Varios                                                                                                                                                                                                        | Nombres del lateral con elipsis y sin scroll horizontal. «No hay calendarios externos» es un enlace a ajustes. «Añadidas hace poco» solo cuenta pendientes. El asa de arrastre solo sale en orden manual                             |
| R4-6 | No se sabía qué commit había en producción                            | `GET /api/v1/health`                                                                                                                                                                                          | Ahora responde `{ status, commit }`. El deploy inyecta `GIT_COMMIT`                                                                                                                                                                  |

### Comprobado en el navegador

- Local, 1280 px: `/smart/tomorrow` muestra cabecera y campo de alta. El lateral es `rgb(242, 245, 254)` y el carril `rgb(71, 114, 250)`. Con el detalle abierto, `scrollWidth` 1280 = `innerWidth`.
- Producción, 19 oct 2026, commit `176cbc6` (`GET /api/v1/health`): Hoy, Mañana y el resto de listas inteligentes pintan. El bundle es `index-D_mrMx-o.js`. Lateral `rgb(242, 245, 254)`, carril `rgb(71, 114, 250)`.
- El campo de alta, al enfocarse en escritorio, mide el ancho de la lista (934 px a 1280) y los botones Fecha y Abrir detalle quedan dentro del campo (`right` 1246 frente a 1252).
- R4-7. `/login` pintaba el fondo lavanda solo en una columna de 24 rem, con blanco a los lados. Una regla vieja de `.auth-screen` en `styles.css` limitaba el `main`. Ahora el fondo ocupa el viewport (`1280×800`, tarjeta de 400 px centrada).

### Sigue abierto

- Agrupar vencidas con «Aplazar» en bloque (N-11).
- Fijar tarea y añadir subtarea desde el menú (N-8).
- Carpetas de listas y archivadas plegables.
- Reordenar de verdad con el asa (hoy solo se muestra en orden manual; el drop ya existía).
- Paridad del carril de TickTick (matriz, foco, avisos) y del orden All / Assigned / Summary.
- El contador de una etiqueta puede seguir desviado si el lateral cuenta subtareas y la página no. Hace falta el mismo recuento en los dos sitios con datos de producción.
