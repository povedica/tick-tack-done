> Documento aportado por el usuario como alcance. Contrastar sus referencias con el código.
> Peticiones explícitas de la conversación que prevalecen: mantener PR #57 abierta y usar la misma rama; Cerrar el día permanece fuera y no recupera enlace en Hoy; pruebas con datos sintéticos; publicar avances parciales.
> La fuente de producto anterior se encuentra actualmente en `docs/spec/done/especificacion-producto-v1.1.md`.

# tick-tack-done - Documento único de cambios: Hábitos, Plan del día, panel de tarea y Calendarios

**Fecha:** 2026-10-20 · **Proyecto:** tick-tack-done (React PWA + NestJS, repo github.com/povedica/tick-tack-done)
**Destinatario:** agentes de desarrollo (Codex, Cursor y otros). **Idioma de la app:** español (i18n existente).

Este documento **sustituye** al prompt anterior "Hoy: franja Plan del día + Hábitos en dos estados". Lo que aquí se mantiene de aquel prompt está ya incorporado; donde difieran, manda este documento. El cambio de fondo respecto al anterior: **Planificar y Replanificar dejan de ser dos acciones y pasan a ser una única entrada, "Plan del día"**.

## Instrucciones generales

- **Antes de escribir código, inspecciona la implementación actual.** Las referencias a rutas (`/plan/day`, `/cierre`, `/replan`) y mecanismos (ocultación de hábitos, persistencia local del plan aceptado) están verificadas contra el repo en main @ 4e89f7b (2026-10-20), pero el despliegue puede ir por detrás y el código se mueve: **reutiliza rutas, lógica y mecanismos existentes como base**, salvo en los cambios explícitos pedidos en este documento (la reutilización es el punto de partida, no un bloqueo al rediseño pedido); si la implementación difiere de lo descrito, **el código actual manda para los hechos técnicos** (rutas, mecanismos, estado real), pero esa diferencia no veta los cambios explícitos pedidos en este documento: las capturas y bocetos guían la dirección visual nueva aunque el estado actual difiera de ellas.
- **TickTick es la referencia de comportamiento**, no de pixel-perfect ni de catálogo de funciones. Cada bloque dice qué se toma, qué se adapta y qué se descarta, con el porqué.
- **KISS:** no añadir complejidad sin un caso real; **y no retirar capacidades existentes ni perder sus datos**. Posponer una función nueva no es lo mismo que quitar una que ya funciona.
- **Sistema de diseño:** tokens del tema, sin colores hardcodeados; verificar tema claro y oscuro, contraste AA, sin overflow horizontal de página en ningún viewport (salvo scroll horizontal intencional y contenido dentro de una vista, como el de Semana en móvil); accesible por teclado y lector de pantalla.
- **Sin datos de maqueta en producción:** cifras, fechas y nombres de los bocetos son muestra.
- Bocetos de referencia para el Bloque 3 (panel, escritorio y móvil) y el Bloque 4 (calendarios). Son propuestas de composición en tema claro con datos de muestra marcados: fechas, duraciones y campos vacíos ilustran estados, no datos comprobados.

---

## Bloque 1 - Hábitos

Basado en una revisión en vivo del módulo Hábitos de TickTick web (todas las vistas y acciones) y en el estado real de ttd verificado en el repo. Criterio: qué copiar, qué adaptar y qué descartar, con el porqué.

### 1.1 Estado real de ttd (verificado en repo, no solo captura)

- **Backend ya soporta:** objetivo por cantidad (`goal.target_count`), frecuencia por días de semana, hora de recordatorio, nota de motivación, archivado, y registro de check-ins **con cantidad y nota** (logs recuperables).
- **La web ya tiene:** tira semanal, sugerencias que crean el hábito preconfigurado, formulario de crear/editar, check-in que incrementa la cantidad, nota opcional tras marcar, panel de estadísticas (racha actual y mejor racha), heatmaps (agregado y por hábito), archivar (hoy con confirmación) y recuperar archivados, lista de archivados, estado vacío.

Consecuencia: **objetivo por cantidad y notas NO son trabajo nuevo: ya existen.** KISS aquí es no ampliarlas (sin los modos Auto/Manual/Completar de TickTick, sin ánimos), nunca retirarlas ni perder sus datos. Todo cambio de formulario debe conservar la edición de hábitos existentes con esos campos.

### 1.2 Qué toma ttd de TickTick (decisiones)

| De TickTick                                                             | Decisión                                                     | Porqué                                                                                                                                                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Check-in de 1 toque en los 7 puntos de la tarjeta                       | **Mantener**                                                 | Es el gesto central.                                                                                                                                                                    |
| Franja semanal con progreso agregado del día (anillo parcial / ✓ lleno) | **Adoptar** sobre la tira existente                          | Resumen de un vistazo; sin cambiar el contexto de la semana al tocar (confuso en TickTick).                                                                                             |
| Frecuencia por días de semana                                           | **Mantener** (ya existe)                                     | Cubre la mayoría de casos reales.                                                                                                                                                       |
| Frecuencias "N veces por semana" y "cada N días"                        | **No añadir en v1**                                          | Estados y cálculo de racha complejos; reabrir solo si se piden. Es no añadir, no retirar.                                                                                               |
| Racha y total acumulado                                                 | **Mantener** (ya existen)                                    | Motivación barata y legible.                                                                                                                                                            |
| Reto de N días (18/100)                                                 | **Adoptar simplificado**                                     | Pablo usa de verdad el de 100 días en TickTick. "Objetivo opcional de N días" con contador X/N y días restantes; sin medallas ni celebraciones.                                         |
| Objetivo por cantidad                                                   | **Conservar el existente** (cantidad + registro incremental) | Ya está en ttd. No adoptar los modos Auto/Manual/Completar de TickTick.                                                                                                                 |
| Calendario mensual clicable en el detalle                               | **Adoptar/verificar**                                        | La mejor pieza de TickTick: historial de un vistazo y corrección del pasado. ttd ya muestra heatmap por hábito; verificar si permite editar días pasados y, si no, habilitarlo.         |
| Confirmación al desmarcar                                               | **Adoptar**                                                  | Desmarcar borra el registro del día y debe avisar. Marcar nunca pide confirmación (se corrige desmarcando).                                                                             |
| Métricas del detalle                                                    | **Simplificar a 3**                                          | Racha actual, check-ins del mes, total (y X/N del reto si existe).                                                                                                                      |
| Secciones/grupos, toggle tarjeta/lista, exportar, ordenar               | **No añadir**                                                | Micro-opciones que no resuelven un problema actual de ttd. Decisión de no añadir complejidad, revisable si aparece la necesidad.                                                        |
| Archivar sin confirmación + "recuperar"                                 | **Adoptar**                                                  | Archivar es reversible y conserva historial: quitar la confirmación actual de ttd y usar toast deshacible. Borrar sí pide confirmación explícita (destruye historial, hay que decirlo). |
| Hábitos en la vista Hoy                                                 | **Mantener y reforzar**                                      | El hábito vive donde vive el día (ver 1.4). Coherente con el Bloque 2.                                                                                                                  |
| Recordatorio único opcional                                             | **Mantener** (ya existe)                                     | No añadir recordatorios múltiples ni constantes.                                                                                                                                        |
| Start Focus desde el hábito                                             | **No añadir**                                                | Cruza dominios (foco ≠ hábito).                                                                                                                                                         |
| Estilo de marca (✓ o icono)                                             | **No añadir**                                                | Siempre el check del lenguaje ttd.                                                                                                                                                      |
| Icono por hábito                                                        | **Solo emoji opcional**                                      | Coherente con las sugerencias actuales de ttd; sin pestañas icono/emoji/texto.                                                                                                          |
| Notas de check-in                                                       | **Conservar la existente** (opcional)                        | Ya está en ttd. Sin popup forzado por defecto y sin los 5 ánimos de TickTick.                                                                                                           |

### 1.3 Pantallas del módulo

**Principal de Hábitos**

- Tira semanal con el círculo de hoy mostrando progreso agregado: anillo parcial si falta algún hábito de hoy, ✓ lleno si todos hechos. Días pasados: ✓ hecho, trama si tocaba y no se hizo, atenuado si no tocaba.
- Lista plana de hábitos activos (sin secciones). Tarjeta: emoji opcional, nombre, "⚡N totales · 🔥racha" y los 7 puntos de la semana. Punto del día: en hábitos booleanos, un toque marca; desmarcar exige una acción explícita con confirmación, nunca un segundo toque accidental. En hábitos por cantidad, el toque conserva el comportamiento actual de incremento/edición: un segundo toque nunca resetea la cantidad ni borra la nota sin una acción explícita del usuario. Días no programados atenuados y no marcables.
- Sugerencias solo en estado vacío (o fila discreta); al pulsar, crear con nombre, emoji y frecuencia ya rellenos (comportamiento actual).
- Menú por tarjeta: Editar · Archivar · Borrar.

**Crear / editar** - un solo formulario, sin pestañas:

1. Nombre (obligatorio) + emoji opcional.
2. Frecuencia: selector de días L–D (por defecto todos).
3. Objetivo por cantidad (existente): número objetivo por día. Mantener editable.
4. Reto opcional: "Completar N días" (sugerir 21/30/100); si existe, tarjeta y detalle muestran X/N y días restantes.
5. Recordatorio opcional: una hora.
   Al editar, cambiar frecuencia u objetivo nunca toca el historial.

**Detalle del hábito**

- Métricas: racha actual · check-ins del mes · total (y X/N del reto).
- Calendario mensual navegable: programados con trama, hechos con ✓, hoy resaltado; editar un día pasado permite registrar también cantidad y nota, no solo marcar/desmarcar booleano; desmarcar pide confirmación ("Se borrará el registro de ese día").
- Acciones: Editar · Archivar · Borrar.
- Notas por check-in listadas por fecha (existentes; conservar).

**Archivar y borrar**

- Archivar: sin confirmación, toast deshacible; desaparece de Principal y Hoy, conserva historial; su recordatorio se desactiva y se reactiva al recuperar.
- Vista "Archivados" (acceso discreto desde cabecera): Recuperar y Borrar.
- Borrar: confirmación que diga literalmente que se borra también todo el historial. Irreversible.

### 1.4 Hábitos en la vista Hoy

Coherente con el lenguaje de las filas de tarea de Hoy:

- Cabecera **"Hábitos"** con chevron de colapsar (como las secciones de prioridad) y contador `X/Y hoy` (X completados de Y programados hoy). Colapsable y recuerda su estado.
- Filas con el mismo alto, padding, tipografía y separadores que las filas de tarea: check **redondo** con borde accent (al completar, relleno accent y nombre tachado en secundario), nombre, y a la derecha **minibarra de progreso**, contador `n/objetivo` y hora del recordatorio si aplica.
- **Conservar la semántica actual de registro según el tipo de hábito:** el gesto actual sobre la fila/check hace exactamente lo que hace hoy (booleano = marca; cantidad = incremento). Un tap no completa de golpe un objetivo de cantidad si hoy no lo hace.
- Solo hábitos programados para hoy, en su propio grupo, sin mezclarse con tareas.
- **Dos estados vacíos diferenciados:**
  - _Sin hábitos creados:_ una única **fila fantasma** (borde discontinuo, altura de fila) `+ Añadir un hábito`, toda clickable hacia el flujo de crear; a la derecha, acción discreta **"Ocultar"** que **reutiliza el mecanismo de ocultación existente** (el de "Ahora no"), con su misma duración y almacenamiento.
  - _Con hábitos creados pero ninguno programado hoy:_ fila discreta de estado ("Hoy no hay hábitos programados"), sin CTA de crear; el contador de sección no aplica.
- Eliminar la tarjeta actual de estado vacío (emoji/planta, textos motivacionales, chips de sugerencias y botones grandes) de Hoy; las sugerencias viven en el módulo Hábitos.

### 1.5 Casos límite

- Cambio de frecuencia con historial: los ✓ pasados no cambian y el historial no se reescribe. Cada registro conserva la frecuencia efectiva en su fecha (guardar la frecuencia vigente por registro o por periodo). Si la implementación actual no lo soporta, anótalo como requisito a resolver antes de tocar el cálculo de racha; no recalcular la historia con la frecuencia nueva.
- Días no programados no rompen racha. La racha no cae porque el día de hoy aún esté pendiente mientras el día no termine: se evalúa con los días programados cumplidos hasta ayer, y hoy suma cuando se completa.
- Desmarcar hoy: confirmación; recalcula racha y progreso de la tira.
- Reto cumplido (N/N): mostrar "Completado", dejar de contar días restantes, sin resetear.
- Zona horaria: el check-in cuenta para el día civil local en que se pulsa; no recalcular historial.
- Borrar el último hábito: volver al estado vacío original (sugerencias incluidas).
- Medianoche: sin ventanas de gracia en v1.
- Al editar hábitos existentes con cantidad/notas, los datos previos se conservan y siguen editables.

### 1.6 Criterios de aceptación

1. Marcar hoy con un toque desde la tarjeta y desde Hoy; ✓ y progreso de la tira se actualizan en ambos.
2. Desmarcar (hoy o pasado) siempre con confirmación; revierte racha y contadores.
3. Detalle con racha, mes y total reales y calendario mensual clicable que corrige el pasado.
4. Archivar oculta sin confirmación (toast deshacible) conservando historial; Recuperar lo devuelve tal cual.
5. Borrar pide confirmación explícita sobre la pérdida del historial.
6. Los hábitos existentes con objetivo por cantidad y notas siguen funcionando y editándose; no se pierde ningún dato.
7. Estado vacío de Hoy como fila fantasma con "Ocultar" (mecanismo existente); estado "sin hábitos hoy pero sí creados" diferenciado; contador `X/Y hoy` con datos.
8. Hábitos de hoy como grupo propio en Hoy, marcables, sin mezclarse con tareas.

### 1.7 Fuera de alcance (v1)

- Secciones/grupos, vista lista alternativa, exportación, ordenaciones.
- Start Focus / pomodoro desde el hábito.
- Frecuencias "N veces por semana" y "cada N días".
- Modos de registro Auto/Manual/Completar, ánimos en notas, medallas/celebraciones, estilos de marca.
- Recordatorios múltiples o constantes.
- Estadísticas globales del módulo.

---

## Bloque 2 - Plan del día: una sola entrada (Planificar y Replanificar unificados)

### 2.1 Decisión de producto (acordada con Pablo, 2026-10-20)

- **Un único punto de entrada: "Plan del día".** Desaparece la decisión artificial "¿pulso Planificar o Replanificar?". La entrada mira el estado y abre lo que toca:
  - Si **todavía no hay plan** para hoy: el flujo de creación (wizard actual).
  - Si **ya hay plan**: el plan actual con lo pendiente, la capacidad que queda y los conflictos, para **ajustarlo** sin empezar de cero y sin tocar lo completado.
- **Unificar la entrada no es unificar el flujo.** Por la mañana eliges desde el backlog; al ajustar corriges un plan roto. Esa diferencia se resuelve dentro del flujo, no con dos botones.
- **Sin penalización por ajustar.** Replanificar cuando el día cambia es el comportamiento correcto; castigarlo incentiva abandonar el plan. **La puntuación/racha no se toca en este MVP.**
- **Visibilidad sin regañina:** mostrar "Plan guardado a las 8:15 · 2 ajustes". Solo cuentan **cambios reales guardados**; abrir o mirar el plan no cuenta.
- **Antes de aplicar un ajuste, mostrar qué cambia** y conservar lo demás por defecto (misma filosofía borrador-hasta-Aplicar del wizard actual).
- Se mantiene **"Cerrar el día"** como acción separada: cerrar no es planificar.

### 2.2 Hechos verificados de la implementación actual (repo main @ 4e89f7b, 2026-10-20)

Contrastar de nuevo contra el repo al empezar; el despliegue puede ir por detrás de main.

- **Wizard:** ruta `/plan/day` → `PlanDayPage` (`apps/web/src/features/planning/`). Crea sesión con `startPlan({today:true, overdue:true, inbox:false, undated:false})`. Tarjeta por tarea con decisiones `done / plan_day / later(fecha) / someday / cancel / trash / skip`, decisiones en borrador, **preview de efectos** y `apply` al final. Ya cumple el requisito de "borrador hasta Aplicar".
- **Replan ligero:** ruta `/replan` → `ShutdownPage kind="replan"` (`apps/web/src/features/closing/`). API propia: `POST /api/v1/planning/replan/sessions` (RF-2670), sugerencias con motivo (`suggested.reason`), decisiones `done / plan_day / someday / cancel`, apply con `expected_revision` (RF-2671). Muestra carga hoy → mañana.
- **Cierre:** ruta `/cierre` → mismo componente `kind="shutdown"` (RF-2651).
- **Hoy:** si no hay plan o no está aceptado, enlace "Planificar mi día"; si lo hay, sección con carga (`task_minutes / available_minutes`, mismo origen que el medidor), recuento de tareas sin duración, enlaces a `/cierre` y `/replan` (flag `day_replan`) y las primeras 5 tareas del plan.
- **El "plan aceptado" de hoy vive en localStorage** (`tick-tack-done.plan.accepted`) y los ids del plan salen de `reviewDaily()` (`task_ids`). **No hay persistencia de servidor de cuándo se guardó el plan ni cuántos ajustes lleva**: el requisito "Plan guardado a las H:MM · N ajustes" necesita persistencia nueva (ver decisiones abiertas).
- Estadísticas: existe "Racha de días productivos" en Estadísticas; no hay penalización por replanificar hoy, y no se introduce.

### 2.3 Franja "Plan del día" en Hoy (sustituye al banner "Planificar mi día")

Una franja compacta con el lenguaje de una fila de tarea: fondo de superficie (token), borde fino y radio estándar, altura natural de fila en escritorio. De izquierda a derecha:

1. Icono calendario con check, color accent.
2. Título **"Plan del día"** en negrita.
3. Carga del día: `X h Y min de Z h`, donde **Z es la capacidad real configurada por el usuario** (la que ya usa el medidor actual; misma fuente de datos y cálculo, sin recalcular).
4. Aviso de fiabilidad: chip de advertencia `⚠ N tareas sin duración` **solo si hay tareas de hoy sin estimación** (N = recuento real). Si todas tienen duración, no se muestra.
5. Si hay plan guardado hoy: texto discreto "Guardado a las H:MM · N ajustes" (ver 2.4).
6. Acciones a la derecha:
   - **Una única acción destacada** (relleno accent): "Planificar" si no hay plan; "Plan del día" si ya existe (abre el ajuste, ver 2.4). **No hay enlace "Replanificar"** en ningún sitio.
   - **"Cerrar el día"**: acción secundaria de texto, contraste suficiente en ambos temas.

Eliminar: fondo tintado, subtítulo explicativo, chevron, paddings de tarjeta grande.

**Responsive, sin alto rígido:** en escritorio cabe en una línea; en móvil el contenido **envuelve** (título+carga, aviso, acciones) y "Cerrar el día" va dentro de un menú secundario ("⋯") para que no compita con la acción principal.

**Carga desconocida o error:** estado de carga o degradar sin el dato; **nunca presentarla como 0 ni como jornada completa**. No renderizar el chip de "sin duración" hasta conocer el recuento real.

### 2.4 Flujo unificado

1. **Entrada única desde la franja.** Sin plan aceptado hoy → wizard `/plan/day` tal cual. Con plan aceptado → vista de ajuste del plan actual.
2. **Vista de ajuste (replan evolucionado):** reusar la maquinaria de sesión de replan (sugerencias + decisiones + apply con revisión) sobre el plan vigente: pendientes de hoy, capacidad restante, conflictos de sobrecarga. Lo completado no se toca. Las decisiones siguen siendo borrador con **preview de cambios** hasta Aplicar, igual que el wizard; lo no tocado se conserva.
3. **Contador de ajustes y horas de guardado:** registrar en servidor cada aplicación con sus cambios reales. Campos claros por día: `initial_applied_at` (primera vez que se guarda el plan), `last_applied_at` y `adjustment_count` (aplicaciones posteriores que cambian algo real). El primer plan no cuenta como ajuste, una aplicación sin cambios tampoco, y `adjustment_count` cuenta aplicaciones con cambios, no tareas modificadas. Abrir o mirar no cuenta. El apply debe ser idempotente y seguro en concurrencia (revisiones esperadas, como ya hace replan con `expected_revision`).
4. **Ruta `/replan`:** queda como redirect a la entrada unificada durante una versión y luego se retira; ningún enlace muerto.
5. **Feature flag:** `day_replan` no debe apagar la planificación básica. Con el flag desactivado se conservan las capacidades actuales (wizard y plan en Hoy); el gating, si procede, se limita a la vista de ajuste. Revisar usos en Ajustes (`FeaturesPage`).

### 2.5 Decisiones abiertas para el agente de desarrollo (resolver con el código en la mano)

- ¿Converger wizard y replan en un único tipo de sesión de planificación, o mantener dos sesiones tras una entrada común? KISS: **mantener ambas sesiones** en MVP; la unificación es de entrada y de lenguaje, no de backend.
- Dónde persistir `initial_applied_at` / `last_applied_at` / `adjustment_count` (la tabla de sesiones de planning existente es el candidato natural).
- Texto exacto de la entrada y del estado ("Guardado a las…"), coherente con i18n (`apps/web/src/i18n/extra.ts`).

### 2.6 Criterios de aceptación

1. El banner tintado ya no existe; en su lugar está la franja compacta con estilo de fila.
2. En Hoy solo hay una acción de planificación; no existe el dilema Planificar/Replanificar.
3. La capacidad mostrada es la configurada por el usuario, no una constante; el chip "N tareas sin duración" aparece solo cuando N > 0 y es correcto; con carga desconocida no se muestra 0 ni completo.
4. Sin plan: la entrada abre el wizard actual tal cual. Con plan: abre el plan vigente para ajustar, con completadas intactas.
5. Ajustes en borrador con preview de cambios antes de aplicar; lo no tocado se conserva.
6. Se muestra "Guardado a las H:MM · N ajustes" con N = `adjustment_count`: aplicaciones posteriores al primer plan que aplican cambios reales; mirar no cuenta y el primer plan no cuenta.
7. Puntuación y racha sin cambios. "Cerrar el día" sigue existiendo como acción separada y `/cierre` no se rompe.
8. `/replan` redirige o se retira sin enlaces muertos; el flag `day_replan` solo gobierna la vista de ajuste, nunca la planificación básica.
9. Verificado en escritorio y móvil, tema claro y oscuro, sin overflow; en móvil las acciones secundarias van en el menú "⋯".

---

## Bloque 3 - Panel de detalle de tarea (sidebar de edición)

Revisado por Pablo el 2026-10-20 sobre boceto: compactar metadatos (quitar el bloque gris), panel redimensionable arrastrando el borde, "Ayúdame" solo icono. Sobre el boceto v2, Pablo aprueba la composición y pide dos ajustes más (22:19): **borde azul muy fino (el azul de acento del tema) en los items de recurrencia, estimación y fecha límite**, y **especial cuidado con los detalles del editor del cuerpo de la tarea** (punto 4). El resto de la propuesta le encaja y se conserva. Referencia de comportamiento: TickTick web (inspeccionado el 2026-10-20): una única fila compacta de fecha (icono + fecha relativa en rojo si vencida + iconos de recordatorio/repetición + bandera de prioridad), título y descripción editables inline sin botón de edición, y su asistente IA como icono sin texto. Bocetos adjuntos (escritorio y móvil).

### 3.1 Actual vs esperado

**Actual (captura de Pablo):** la cabecera del panel la ocupa la fecha en rojo con un cuadro rojo a la izquierda; debajo tres botones grandes ("Cuándo", "Fecha límite", "Algún día") sin valor visible; título después; la descripción muestra `\n` literales; "Editar descripción" es un botón con aspecto de etiqueta; el checklist trunca textos con "..." y tiene filas muy separadas; la recurrencia flota suelta entre etiquetas y adjuntos; "Adjuntos" aparece duplicado (título y botón); "Ayúdame con esta tarea" es un enlace de texto bajo la fecha; el ancho del panel es fijo.

**Esperado:** el panel se lee como una tarea, no como una colección de controles: checkbox + título primero, una sola línea de metadatos compacta, cuerpo (descripción) con protagonismo y edición directa, y ancho ajustable.

### 3.2 Cambios

1. **Panel redimensionable.** El borde izquierdo del panel permite arrastrar para ensancharlo/estrecharlo (cursor `col-resize`, grip visible al hover). Como punto de partida, mínimo ~320px y máximo ~60% del viewport; **validar estos límites contra el espacio central de la lista y pantallas pequeñas** y ajustarlos si el contenido lo pide. **El redimensionado debe ser accesible por teclado** (separador enfocable, flechas para ensanchar/estrechar, con role/aria de separator), no solo con ratón. Persistir el ancho elegido (mismo mecanismo de persistencia local que ya use la app). En móvil el detalle sigue a pantalla completa, sin drag.

2. **Metadatos compactos, sin bloque gris ni botones grandes.** Eliminar el bloque/pastilla gris y los tres botones "Cuándo / Fecha límite / Algún día". Sustituir por UNA línea de chips pequeños (~26px) bajo el título, que envuelve si no cabe:
   - **Programada para**: icono calendario + valor ("dom 3 may · 19:00"); si está vencida, el aviso relativo en rojo dentro del mismo chip ("· vencida hace 6 meses"). Abre el selector de fecha actual.
   - **Recurrencia**: chip con icono de repetición y texto corto ("semanal · dom") junto a la fecha. Solo si la tarea es recurrente, y siempre colgando de la fecha programada (nunca huérfano).
   - **Estimación** y **Fecha límite**: chips fantasma (sin relleno) cuando están vacíos; con valor cuando existen. Son campos independientes de la fecha programada: no fusionar su semántica.
   - **Borde de los chips de recurrencia, estimación y fecha límite: muy fino (1px) y en el azul de acento del tema** (token de acento, no un color hardcodeado), con o sin valor; vacíos llevan además texto gris para leerse como pendientes. Decisión explícita de Pablo sobre el boceto v2. Verificar contraste AA del borde y del texto en tema claro y oscuro.
   - **"Algún día"** deja de ser botón: pasa a ser una opción dentro del selector de fecha (conservar el comportamiento actual de esa acción; solo cambia dónde vive).
   - Ojo: en la captura el chip "1h" es una **etiqueta** del usuario, no una estimación; no derivar el valor de Estimación a partir de etiquetas.

3. **Título y completar arriba.** El checkbox de completar (borde coloreado según prioridad, como en las filas de lista) va junto al título. Eliminar el cuadro rojo suelto de la cabecera actual. La fecha deja de ser cabecera del panel: el aviso de vencida vive en su chip (punto 2).

4. **Descripción con protagonismo y edición directa.** Quitar el botón "Editar descripción". La descripción se edita inline al hacer click (como TickTick) con icono lápiz como affordance: visible al hover en escritorio, visible siempre (pequeño, gris) en móvil. El texto envuelve al ancho del panel y crece en vertical; nada de truncar. Al ensanchar el panel, la descripción gana ese espacio.

   **Cuidado del editor del cuerpo (petición expresa de Pablo).** El editor inline debe respetar el texto del usuario en cada detalle, conservando la semántica y capacidades actuales: no convertirlo en un editor más complejo ni retirar funciones existentes. En concreto:
   - **Texto y saltos de línea:** los saltos se conservan tal cual al editar, guardar y releer; el editor no introduce ni oculta `\n` literales (relacionado con el punto 10: su origen se investiga antes de tocar datos).
   - **Selección y deshacer:** selección, portapapeles y deshacer/rehacer funcionan con el comportamiento nativo esperado; el foco y el cursor no saltan al aplicar cambios.
   - **Listas y checklist:** si el cuerpo ya admite listas o ítems, se conservan y se editan igual; pegar texto con listas o saltos los mantiene, sin artefactos (nada de HTML visible ni caracteres escapados).
   - **Pegado:** pegar conserva el contenido del portapapeles como texto fiel; sin transformaciones sorpresivas.
   - **Guardado sin pérdida de borradores:** los cambios se guardan de forma fiable (autoguardado o al salir de la edición); cerrar el panel, cambiar de tarea o recargar con cambios sin guardar nunca pierde el borrador: se conserva o se avisa antes de descartarlo.
   - **Accesibilidad:** editable por teclado, con foco visible y etiquetado para lector de pantalla, manteniendo la semántica actual.

5. **"Ayúdame con esta tarea": solo icono.** Icono de chispa (sparkles) en color accent en la barra de utilidad superior, junto a prioridad/menú/cerrar. Sin texto. Con `aria-label="Ayúdame con esta tarea"` y tooltip en escritorio. (TickTick hace lo mismo: su asistente es un icono sin texto.)

6. **Checklist denso y legible.** Filas de ~32-34px (densidad de las filas de tarea). Los textos largos envuelven a dos líneas; no truncar con "...". Conservar cabecera con contador "X/Y" y barra de progreso.

7. **Adjuntos sin duplicar.** Una sola sección "Adjuntos": zona discontinua compacta "Suelta un archivo o **Adjuntar**". Eliminar el botón adicional con el mismo nombre.

8. **Prioridad visible.** La bandera de la barra de utilidad refleja la prioridad actual de la tarea (rellena/coloreada si la tiene), no un icono neutro ambiguo.

9. **Secciones y ritmo.** Etiquetas pequeñas en mayúsculas para Checklist, Etiquetas y Adjuntos, con separación vertical constante. La descripción no necesita rótulo (es el cuerpo). Conservar la barra inferior (lista, formato, comentarios, menú) tal cual.

10. **`\n` literales en la descripción: investigar antes de tocar.** La inspección en TickTick (2026-10-20) muestra los MISMOS `\n` literales en la misma tarea dentro de ticktick.com, así que el dato importado ya trae los `\n` como texto: no es (solo) un problema del render de ttd. Antes de normalizar nada, revisar el origen del dato y decidir: (a) migración que convierta `\n` literal en salto real, o (b) que el render los interprete. Cualquiera de las dos debe respetar texto intencional del usuario (no romper código o literales escritos a propósito). **No hacer cambio silencioso de datos.**

### 3.3 Casos límite

- Tarea sin fecha, sin estimación, sin fecha límite y sin recurrencia: solo chips fantasma, una sola línea discreta; nada de bloques vacíos.
- Título largo: envuelve; el checkbox queda alineado a la primera línea.
- Panel en su ancho mínimo: los chips envuelven a dos líneas; la descripción sigue legible; sin scroll horizontal.
- Ancho persistido: al cerrar y reabrir el panel (y al recargar) se conserva el ancho elegido.
- Descripción vacía: placeholder "Añadir descripción" en gris que inicia la edición al click.
- Checklist vacío: solo "+ Añadir ítem", sin barra de progreso.
- Tema oscuro: chips, fantasma y zona de adjuntos con tokens del tema, contraste AA en ambos temas.

### 3.4 Criterios de aceptación

1. No existen los tres botones grandes ni el bloque gris de metadatos; la línea de chips muestra siempre el valor actual de cada campo.
2. El panel se redimensiona arrastrando el borde dentro de los límites validados, también con teclado, y el ancho persiste tras recargar.
3. "Ayúdame con esta tarea" se lanza desde un icono sin texto, con aria-label y tooltip; no hay ningún enlace de texto bajo la fecha.
4. La descripción se edita inline sin botón "Editar descripción", envuelve al ancho del panel y nunca se trunca; al ensanchar el panel gana espacio.
5. El checkbox de completar está junto al título con el color de prioridad; no hay cuadro rojo suelto en cabecera.
6. Los ítems del checklist muestran su texto completo (envuelven) con filas de ~34px.
7. "Adjuntos" aparece una sola vez; la acción se llama "Adjuntar".
8. La bandera de prioridad refleja el estado actual de la tarea.
9. Escritorio y móvil, tema claro y oscuro, sin overflow en ningún viewport.
10. El origen de los `\n` literales está investigado y documentado antes de cualquier normalización; el cambio elegido no altera texto intencional del usuario.
11. Los chips de recurrencia, estimación y fecha límite llevan borde 1px del azul de acento (token del tema), legible y AA en ambos temas.
12. El editor del cuerpo conserva saltos, listas, pegado y selección sin artefactos; ningún camino (cerrar, cambiar de tarea, recargar) pierde un borrador sin avisar.

### 3.5 Fuera de alcance

Fuera de alcance significa no añadir ni rehacer; nada de esto retira capacidades que ya existan.

- Editor de texto enriquecido para la descripción (markdown renderizado completo, toolbar).
- Cambios en comentarios, actividad o adjuntos más allá del punto 7.
- Cualquier cambio en el modelo de datos de tareas (salvo la posible normalización de `\n` del punto 10, solo tras investigar y decidir).
- El resto de vistas (lista, kanban, Hoy) salvo lo tratado en los Bloques 1 y 2.

### 3.6 Nota de grounding

- No se ha inspeccionado el código del repo para este bloque: las rutas/estados actuales del selector de fecha, "Algún día" y la persistencia de ancho deben reutilizarse tal como estén implementados; si difieren de lo descrito, manda el código actual.

---

## Bloque 4 - Calendarios: coherencia visual y maquetación de las 8 vistas

Dirección visual aprobada por Pablo el 2026-10-20 (22:35) sobre bocetos de Semana/Agenda escritorio y Mes/Agenda móvil. Basado en sus 8 capturas (de su versión local, más reciente que repo y despliegue: **verificar todo contra el repo antes de tocar código**) y en inspección en vivo de TickTick webapp (Agenda, Mes, Semana, Día) y demos de FullCalendar (Month, Week timeGrid, List); solo esas dos referencias se han inspeccionado.

### 4.1 Principio rector

El problema no es de funciones sino de armonía: las 8 vistas no comparten lenguaje entre sí ni con el resto de ttd. La solución es un sistema común (barra de herramientas, franja de todo el día, celdas, chips, marcas de tipo) con el tratamiento que cada escala necesita. **Las 8 vistas se conservan todas; ninguna pierde información ni capacidades.**

### 4.2 Barra de herramientas unificada (las 8 vistas)

Sustituye a los 8 enlaces de texto de vistas, el checkbox suelto y el botón "Calendario" actuales, que es lo que más rompe la armonía:

- **Escritorio:** navegación ‹ Hoy › · título del periodo con caret (abre mini-calendario para saltar a cualquier fecha) · número de semana · conmutador segmentado Día / Semana / Mes / Agenda + "Más ▾" (Año, Trimestre, Varias semanas, Varios días) · botón ＋ en acento · menú ⋯.
- **Móvil:** flechas ‹ › compactas con **Hoy visible entre ellas** (no escondido en ⋯), título con caret, conmutador reducido a la vista activa con desplegable, ＋ y ⋯. Todo cabe en 390px compactando controles.
- La navegación temporal (‹ ›, Hoy, salto por mini-calendario) es la misma en todas las vistas: mejora pedida por Pablo.

### 4.3 Franja de "Todo el día" a ancho completo

En TickTick y FullCalendar los elementos de todo el día van en una franja a ancho completo sobre la rejilla horaria; en ttd hoy se comprimen dentro de la columna aunque sobre ancho (señalado por Pablo). Regla: en Día, Semana y Varios días, franja horizontal sobre la rejilla que ocupa el ancho del calendario, con chips apilables: **cada elemento usa el ancho útil de su propia columna de fecha** (ni atraviesa la semana entera ni se comprime dentro de su columna habiendo ancho); un elemento multi-día abarca solo sus fechas reales. La franja crece con el contenido y solo colapsa ("+n más") ante desborde real. En Mes y Varias semanas, los de todo el día son chips en su celda; en Agenda llevan la etiqueta "Todo el día" en acento.

### 4.4 Marca por tipo real: tarea vs evento

La Agenda (y el resto de vistas) mezcla tareas y eventos de calendario (confirmado por Pablo). Regla única:

- **Tarea:** checkbox interactivo de completar.
- **Evento de calendario:** mini-icono de calendario de línea fina en la misma columna y caja que el checkbox, en el color de su calendario/fuente, no interactivo; tocar la fila abre el detalle. Es el mismo lenguaje de la marca sutil de TickTick que Pablo citó como referencia.
- **La marca sigue al tipo real del registro en ttd; nunca se infiere del título ni de si tiene hora.** Un evento a las 00:00 sigue siendo un evento con hora: se muestra con su "00:00", no se convierte en todo el día.
- El color identifica la lista/origen; la forma de la marca distingue el tipo (el tipo nunca depende solo del color: accesibilidad).
- En las capturas de Pablo todas las filas mostraban checkbox (cumpleaños incluidos) con bordes azules y rojos cuyo significado está pendiente de confirmar: no cambiar la semántica de esos registros; la asignación de marcas sale del tipo real en los datos.

### 4.5 Vista por vista

**Agenda.** Agrupar por mes y por día (número grande + letra de día, "hoy" en acento). Cada elemento en una fila con la hora a la izquierda (o "Todo el día" en acento), el rango horario en una sola línea sin cortes incómodos; títulos largos ajustan línea sin truncar. Barra de color por lista y marca por tipo (4.4). Es el horario marcado de TickTick sin el peso de sus tarjetas, con la fila fina de FullCalendar List. Bocetos: Agenda escritorio y móvil.

**Día, Semana y Varios días (rejillas horarias).** Encabezado de columnas con número grande y pill de acento en hoy; franja de todo el día (4.3); bloques con borde de acento a la izquierda y hora en pequeño dentro del bloque; línea de "ahora" en acento cuando es hoy (Día); número de semana junto al título (Semana). Varios días hereda la composición de Semana con menos columnas. Bocetos: Semana y Día escritorio, Varios días móvil.

**Mes.** Celdas estilo FullCalendar: chips con hora y título por elemento, barras continuas para multi-día, "+n más" solo ante desborde real (nunca habiendo espacio) y abriendo siempre el detalle completo del día, círculo de acento en el día actual, números de semana en el margen, días de otros meses atenuados. Boceto: Mes escritorio.

**Varias semanas.** Hereda las celdas de Mes con alto de fila compacto y selector de rango en el título. Es la vista intermedia entre Mes y Semana: mismo lenguaje, sin componente nuevo.

**Año.** Doce mini-meses como mapa, con altura natural (sin tarjetas con vacío inferior): pill de acento con número legible en el día actual, puntos discretos de densidad bajo los días con elementos, clic en un día para saltar a la vista Día. Cabeceras L M X J V S D centradas sobre su columna; matemática de calendario con librería, semana empezando en lunes. Boceto: Año.

**Trimestre.** No existe en TickTick: construir como variante del componente Año (tres mini-meses grandes con más aire), con números de semana y puntos/chips ligeros. Sin componente nuevo.

### 4.6 Adaptación móvil (no es el escritorio encogido)

- **Agenda:** misma estructura que escritorio (es la vista más natural en móvil); columna de hora estrecha, títulos con ajuste de línea legible, sin truncar.
- **Día / Varios días:** columnas con franja de todo el día superior y rejilla vertical.
- **Semana:** la semana completa con scroll horizontal suave (~3,5 días visibles, indicador de deslizamiento); no se reduce a 3 días ni pierde columnas.
- **Mes:** rejilla con puntos de densidad (un punto por elemento, color por tipo/origen) en vez de chips; al tocar un día, panel inferior con la lista completa de ese día.
- **Año / Trimestre / Varias semanas:** heredan los componentes de escritorio con tipografía y celdas ajustadas y scroll vertical.
- Barra superior móvil según 4.2, con Hoy visible.

### 4.7 Sistema visual

Tokens del tema siempre: el azul de acento como token (en el tema actual es #4772FA; si el tema cambia, el calendario lo sigue), fondos suaves del tema, chips con borde fino de acento coherentes con los aprobados en el panel (Bloque 3), esquinas redondeadas discretas, tipografía del sistema. Nada de colores hardcodeados. Contraste AA y navegación por teclado en todas las vistas (conmutador, mini-calendario, franjas, "+n más").

### 4.8 Casos límite

- Día sin elementos: celda o franja vacía sin adornos; Agenda sigue el patrón actual para días vacíos (verificar repo).
- Solapamiento de bloques horarios: columnas paralelas dentro de la misma hora (patrón FullCalendar).
- Elementos multi-día: barra continua en Mes/Varias semanas; en rejillas horarias pasan a la franja de todo el día solo si son todo-el-día reales.
- "+n más": solo con desborde real, abre el detalle completo del día y nunca es un checkbox ni un control confundible con una tarea.
- Zona horaria: los elementos se muestran en la zona local del usuario; un 00:00 no implica todo-el-día.
- Pantallas muy estrechas (<360px): la barra móvil compacta más, pero Hoy sigue visible.

### 4.9 Criterios de aceptación

1. Las 8 vistas comparten la barra de herramientas unificada; en móvil Hoy es visible sin abrir menús.
2. Los elementos de todo el día van en la franja superior en Día/Semana/Varios días, cada uno con el ancho útil de su fecha (multi-día solo en sus fechas reales); nunca comprimidos en su columna habiendo ancho.
3. Cada fila/bloque muestra su marca por tipo real: checkbox en tareas, icono de calendario en eventos; ningún evento es completable y ningún tipo se infiere del título ni de la hora.
4. Agenda: horario en una línea, títulos sin truncar, agrupación por día/mes, "hoy" en acento.
5. "+n más" solo ante desborde real y siempre abre el detalle completo del día.
6. Año: día actual legible en pill, puntos de densidad, clic a Día; Trimestre como variante del Año.
7. Todo con tokens del tema (acento incluido), AA en claro y oscuro, teclado y lector de pantalla, sin overflow horizontal de página en ningún viewport (el scroll horizontal contenido de Semana móvil es intencional).
8. Ninguna vista pierde información ni capacidades respecto a la versión actual; las 8 vistas siguen accesibles.
9. Un evento a las 00:00 se muestra con su hora, no como todo-el-día.
10. Semana móvil: scroll horizontal con la semana completa, sin perder columnas.

### 4.10 Fuera de alcance

- Crear/editar eventos desde el calendario, drag & drop de elementos, integraciones de calendarios externos: no ampliarlas ni rehacerlas; **si ya existen, se conservan tal cual** (fuera de alcance significa no tocarlas, nunca retirarlas).
- Cambios en el modelo de datos de tareas/eventos: la marca por tipo usa el tipo ya existente.
- Vistas nuevas más allá de las 8 actuales.
- El significado de los bordes de colores observados en las capturas (azul/rojo): se conserva tal cual hasta confirmarlo; no es parte de este cambio.

### 4.11 Nota de grounding

- Las capturas de Pablo son de su versión local, más reciente que repo y despliegue: verificar rutas, nombres de vistas y componentes contra el repo antes de implementar; para hechos técnicos manda el código actual, sin que eso vete los cambios visuales pedidos (las capturas guían la dirección nueva).
- Referencias inspeccionadas en vivo (2026-10-20): TickTick webapp y demos de FullCalendar, únicamente.
- Bocetos de referencia (escritorio: Semana, Día, Mes, Agenda, Año; móvil: Agenda, Varios días, Mes, Semana) con marca "Boceto con datos de muestra": los elementos con hora son ilustrativos; los de todo el día y los cumpleaños vienen de las capturas reales de Pablo.

## Verificación final (los cuatro bloques)

- Escritorio y móvil (PWA), tema claro y oscuro, con tokens, sin colores hardcodeados de bocetos (el acento es siempre el token del tema).
- Contraste AA; todas las acciones accesibles por teclado y lector de pantalla (incluido el redimensionado del panel y la navegación del calendario).
- Sin overflow horizontal de página en ningún viewport (salvo el scroll horizontal intencional y contenido de Semana móvil); el contenido envuelve y el texto de la descripción, del checklist y de los títulos de calendario se muestra siempre completo, sin ellipsis ni truncado.
- Calendarios: las 8 vistas conservadas y accesibles, marcas tarea/evento por tipo real, franja de todo el día sin compresión.
- Nada de texto o cifras de maqueta en el build.
- Fuera de lo descrito en este documento, nada más cambia: el resto de Hoy (secciones de prioridad, filas, chips, quick-add, cabecera), el resto de vistas y los flujos existentes quedan igual.
