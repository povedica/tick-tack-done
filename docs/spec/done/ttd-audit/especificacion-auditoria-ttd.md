---
title: 'Especificación de auditoría — tick-tack-done (ttd)'
---

# Especificación de auditoría — tick-tack-done (ttd)

- **Aplicación:** https://todo.reflexionia.com
- **Repositorio:** https://github.com/povedica/tick-tack-done (commit `36f9209`, 21/10/2026 10:30 hora de Madrid)
- **Fecha de la auditoría:** 21/10/2026 (hora de Madrid)
- **Método:** dos recorridos por la interfaz en producción, con la cuenta del propietario, más una revisión estática del código (solo lectura).
- **Alcance:** solo lo que necesita atención inmediata: funcionalidad rota, pantallas con error, maquetación incorrecta, interfaz que no sigue los estilos de la propia app y datos incorrectos.

## Cómo leer este documento

- Cada hallazgo tiene un ID `TTD-AUD-NN` y lleva severidad, pantalla, elemento, pasos, resultado esperado, resultado actual, evidencia, causa en el código, propuesta de corrección y criterios de aceptación.
- **Confianza de la causa:** _Alta_ = verificada leyendo el código; _Media_ = muy probable, pero no se ha reproducido localmente; _Baja / No confirmada_ = hipótesis.
- Los textos de la interfaz se citan tal cual, entre comillas.
- Las rutas de código son relativas a la raíz del repositorio. `web/` = `apps/web/src/`, `api/` = `apps/api/src/`, `domain/` = `packages/domain/src/`.
- Las evidencias están en `evidencias/`. Las capturas de pantalla pueden ir con unos segundos de retraso respecto a la acción descrita (ver «Alcance y limitaciones»).

**Severidades**

- **Crítica:** datos incorrectos o funcionalidad principal rota.
- **Alta:** funcionalidad rota o muy visible.
- **Media:** maquetación o estilo incorrecto, o comportamiento confuso.
- **Baja:** detalle de pulido.

## Resumen

| ID         | Título                                                                                              | Severidad | Área                         |
| ---------- | --------------------------------------------------------------------------------------------------- | --------- | ---------------------------- |
| TTD-AUD-01 | La fecha «Cuándo» no aparece en las filas y «Mañana» sale vacía                                     | Crítica   | Tareas y fechas              |
| TTD-AUD-02 | La entrada rápida no interpreta rangos horarios («09:00-09:30»)                                     | Alta      | Tareas y fechas              |
| TTD-AUD-03 | Se añade 09:00 al elegir solo un día                                                                | Media     | Tareas y fechas              |
| TTD-AUD-04 | El detalle no muestra bien «Cuándo», no hay hora de fin y la duración no se refleja                 | Media     | Tareas y fechas              |
| TTD-AUD-05 | Menú «Más acciones» estrecho, con scroll horizontal y textos cortados                               | Alta      | Detalle de tarea             |
| TTD-AUD-06 | «Guardando…» durante segundos y «Creando…» al abrir una tarea                                       | Media     | Detalle de tarea             |
| TTD-AUD-07 | Ticky está enlazado, pero dice «no disponible»; página sin margen                                   | Alta      | Ticky (ttd)                  |
| TTD-AUD-08 | No existe ninguna pantalla para activar o configurar Ticky                                          | Alta      | Ticky (ttd)                  |
| TTD-AUD-09 | Completadas de la semana: 104 en Estadísticas frente a 314 en el Panel                              | Alta      | Datos y métricas             |
| TTD-AUD-10 | Tiempo de foco: «1,35 min» frente a 397 min                                                         | Alta      | Datos y métricas             |
| TTD-AUD-11 | El informe semanal sale vacío («Sin datos», «Fecha de cálculo no disponible»)                       | Alta      | Datos y métricas             |
| TTD-AUD-12 | «15 Atrasado» parece un recuento, pero es una puntuación                                            | Media     | Datos y métricas             |
| TTD-AUD-13 | /filters usa controles nativos sin estilo y etiquetas erróneas                                      | Media     | Listas, filtros y navegación |
| TTD-AUD-14 | /matrix: «Ámbito» desalineado, una «i» suelta y un cuadrante cortado                                | Media     | Listas, filtros y navegación |
| TTD-AUD-15 | Papelera: acciones a la izquierda del título y la barra de confirmación lo tapa                     | Media     | Listas, filtros y navegación |
| TTD-AUD-16 | Papelera: tras «Confirmar borrado» la fila y el contador no cambian                                 | Alta      | Listas, filtros y navegación |
| TTD-AUD-17 | El botón «Crear» de «Nueva lista» es nativo y no lleva estilo                                       | Media     | Listas, filtros y navegación |
| TTD-AUD-18 | Al borrar una lista se queda en /list/<id> y acaba en «No encontrado»                               | Media     | Listas, filtros y navegación |
| TTD-AUD-19 | Una URL desconocida redirige a /today sin ningún aviso de 404                                       | Media     | Listas, filtros y navegación |
| TTD-AUD-20 | /focus: sin anillo de temporizador y presets sin estado                                             | Media     | Foco y cuentas atrás         |
| TTD-AUD-21 | /countdowns: el título se parte («Cuenta / atrás») y el emoji se corta                              | Media     | Foco y cuentas atrás         |
| TTD-AUD-22 | Modo oscuro: las tarjetas de cuenta atrás son ilegibles                                             | Alta      | Foco y cuentas atrás         |
| TTD-AUD-23 | Modal «Nueva cuenta atrás» mal maquetado                                                            | Alta      | Foco y cuentas atrás         |
| TTD-AUD-24 | El menú «Nueva» de cuentas atrás no se cierra                                                       | Media     | Foco y cuentas atrás         |
| TTD-AUD-25 | Modo oscuro: contraste insuficiente en la barra de iconos, el elemento activo y el selector de tema | Media     | Tema y estilos               |
| TTD-AUD-26 | El botón de login usa un color fijo y no el acento                                                  | Baja      | Tema y estilos               |
| TTD-AUD-27 | Textos sin traducir en modo inglés                                                                  | Media     | Idioma (i18n)                |
| TTD-AUD-28 | ~70 acciones fallan en silencio                                                                     | Alta      | Robustez (código)            |
| TTD-AUD-29 | No hay gestión de sesión caducada (401)                                                             | Alta      | Robustez (código)            |
| TTD-AUD-30 | Un único ErrorBoundary global y solo en español                                                     | Media     | Robustez (código)            |
| TTD-AUD-31 | Pantallas sin estado de carga o de error                                                            | Media     | Robustez (código)            |
| TTD-AUD-32 | Detalles: «1 tareas», confirm() nativo, «Comprobando la sesión…» sin estilo                         | Baja      | Pulido                       |
| TTD-AUD-33 | Menú móvil oculto con destinos extraños (no confirmado)                                             | Baja      | Pulido                       |
| TTD-AUD-34 | 4 errores en la consola en el login (no analizados)                                                 | Baja      | Pulido                       |
| TTD-AUD-35 | La lista de tokens solo carga 50 filas y las renovaciones OAuth la llenan                           | Alta      | Tokens, MCP e integraciones  |
| TTD-AUD-36 | Los tokens caducados aparecen como «Activo»                                                         | Media     | Tokens, MCP e integraciones  |
| TTD-AUD-37 | Volver a autorizar una aplicación OAuth puede fallar por el nombre único del token                  | Alta      | Tokens, MCP e integraciones  |
| TTD-AUD-38 | La actividad del token no se entiende y está incompleta                                             | Media     | Tokens, MCP e integraciones  |
| TTD-AUD-39 | Los errores al revocar no se ven y los de crear son genéricos                                       | Media     | Tokens, MCP e integraciones  |
| TTD-AUD-40 | El secreto recién creado: el lector de pantalla lo lee y se pierde sin aviso                        | Media     | Tokens, MCP e integraciones  |
| TTD-AUD-41 | Permisos: «Gestionar» como «Escritura», falta «Cuenta atrás», sensibles sin marca                   | Media     | Tokens, MCP e integraciones  |
| TTD-AUD-42 | Consentimiento OAuth: sensibles marcados por defecto, etiquetas en crudo, sin estilo                | Alta      | Tokens, MCP e integraciones  |
| TTD-AUD-43 | Google: «Vuelve a conectar» sin botón de reconexión; Drive desconecta todo Google                   | Alta      | Tokens, MCP e integraciones  |
| TTD-AUD-44 | Telegram y Correo a tarea: estados provisionales y regenerar sin confirmación                       | Media     | Tokens, MCP e integraciones  |
| TTD-AUD-45 | Webhooks y feeds: rotar secreto sin confirmación y textos reutilizados                              | Baja      | Tokens, MCP e integraciones  |
| TTD-AUD-46 | «Revocados» sin estilo y sin el nombre de la aplicación                                             | Baja      | Tokens, MCP e integraciones  |

**Recuento:** Crítica 1 · Alta 16 · Media 23 · Baja 6 (46 hallazgos).

---

## Área 1 — Tareas y fechas

### TTD-AUD-01 — La fecha «Cuándo» no aparece en las filas y «Mañana» sale vacía

- **Severidad:** Crítica
- **Pantalla/URL:** panel de detalle de tarea, `/inbox`, `/smart/all`, `/smart/tomorrow` y barra lateral («Mañana»)
- **Elemento:** chip de fecha de la fila (`task-date`), lista inteligente «Mañana» y su contador

**Pasos para reproducir**

1. Abre una tarea sin fecha.
2. En el detalle, pulsa «Cuándo» y luego «Mañana». Aplica.
3. Recarga la página. El detalle muestra «22 oct, 09:00».
4. Ve a `/inbox` y a `/smart/all`.
5. Abre «Mañana» (`/smart/tomorrow`).

**Resultado esperado (requisito del propietario)**

- La fila muestra la fecha.
- Si la tarea tiene hora, se muestra la hora.
- Si tiene inicio y fin (p. ej. 09:00–09:30), se muestra el rango incluyendo la fecha de inicio, por ejemplo «22 oct, 09:00–09:30».
- La tarea aparece en «Mañana» y cuenta en la barra lateral.

**Resultado actual**

- La fila solo muestra «Bandeja», sin fecha.
- `/smart/tomorrow` muestra «0 tareas» y la barra lateral no tiene contador.
- Otras tareas, como «Comer con María 23 oct, 14:00», sí muestran fecha porque tienen `due_date`.

**Evidencia**

- ![](evidencias/TTD-AUD-01_a.png)
- ![](evidencias/TTD-AUD-01_b.png)

**Causa en el código (confianza Alta)**

- «Cuándo» guarda solo `start_date`: `web/features/tasks/TaskDetail.tsx:313-314`. El chip del detalle sí lee `start_date` (`:413-421`).
- El modelo de fila no tiene `startDate`, `durationMinutes` ni `isAllDay`: `web/features/tasks/model.ts:3-25`. Además mapea solo `due_date` (`:49`, `:72`) y `web/features/places/Places.tsx:1645` hace lo mismo.
- La fila pinta `row.dueDate`: `web/features/tasks/TaskList.tsx:244-248` y `:384-402`.
- `formatRowDate` (`TaskList.tsx:818-847`) tiene tres problemas:
  - usa la zona del navegador y no la de la tarea;
  - interpreta 00:00 como «sin hora»;
  - no admite hora de fin ni duración.
- Las listas «Mañana», «Próximos 7 días» y «Hoy» filtran con `due_range` solo sobre `dueDate`: `domain/filters/clause.ts:102-104` y `:239-249`. En la API se traduce a `dueDate` en `api/filters/where-from-clause.ts:38-39`, y el contador de la barra lateral usa el mismo cálculo.
- En cambio, «Hoy» (tablero) usa `startDate ?? dueDate` (`web/features/today/groups.ts:235`). Hay dos criterios distintos en la app.

**Propuesta de corrección**

1. Añadir `startDate`, `isAllDay` y `durationMinutes` a `RowModel` (`rowFromTask`, `rowFromView` y el mapper de `Places.tsx`).
2. Renderizar la fecha de la fila con un único formateador compartido basado en `taskWhen`/`formatDueChip` (`groups.ts`):
   - fecha efectiva = `start_date ?? due_date`;
   - hora solo si `!is_all_day`;
   - rango `HH:MM–HH:MM` si hay duración o fin;
   - siempre en la zona de la tarea.
3. Cambiar los filtros de fecha relativa (`today`, `tomorrow`, `next_7_days`, `no_date`, `between`) para usar `coalesce(start_date, due_date)`, tanto en `domain/filters/clause.ts` como en `api/filters/where-from-clause.ts`.

**Criterios de aceptación**

- Una tarea con solo `start_date` = mañana aparece en `/smart/tomorrow` y suma 1 al contador de «Mañana» de la barra lateral.
- La fila muestra «Mañana» o «22 oct» sin hora si la tarea es de día completo, «Mañana 09:00» si tiene hora y «Mañana 09:00–09:30» si tiene duración de 30 min.
- La fecha mostrada coincide con la zona de la tarea, aunque el navegador esté en otra zona.
- Hay tests unitarios del formateador y del filtro con los casos: solo inicio, solo vencimiento, ambos, día completo y rango.

### TTD-AUD-02 — La entrada rápida no interpreta rangos horarios

- **Severidad:** Alta
- **Pantalla/URL:** entrada rápida (barra «Añadir tarea a «Bandeja»») y `/inbox`
- **Elemento:** el parser de lenguaje natural

**Pasos para reproducir**

1. En la bandeja, escribe `TEST AUDIT time mañana 09:00-09:30` y pulsa Intro.

**Resultado esperado**

- Título «TEST AUDIT time».
- Inicio mañana a las 09:00, fin 09:30 (duración 30 min).
- La fila muestra «Mañana 09:00–09:30».

**Resultado actual**

- Título «TEST AUDIT time-09:30».
- Fecha 22 oct 09:00, sin rango.
- La fila muestra «Bandeja de ent… Mañana 09:00» (el nombre de la lista está truncado).
- En `/smart/tomorrow` aparece «Bandeja Mañana 09:00», con la cabecera «1 tareas».

**Evidencia**

- ![](evidencias/TTD-AUD-02_a.webp)
- ![](evidencias/TTD-AUD-02_b.webp)

**Causa en el código (confianza Alta)**

- `extendWithTime` (`domain/nlp/parse.ts:971-990`) consume «09:00» y se detiene ante «-», porque solo corta si el siguiente carácter es una letra o un número.
- No existe ningún patrón de rango (`HH:MM-HH:MM`, «de 9 a 9:30», «9:00–9:30»). La duración solo se reconoce con la sintaxis `~30m` (`DURATION`, `parse.ts:342-343` y `:374-390`).
- `BARE_TIME` (`parse.ts:326`) exige empezar en un límite de palabra, así que «-09:30» se queda en el título.

**Propuesta de corrección**

- Añadir un patrón de rango tras la hora: `(\d{1,2})(?::(\d{2}))?\s*[-–a]\s*(\d{1,2})(?::(\d{2}))?`, y también «de X a Y».
- El patrón debe fijar la hora de inicio, calcular `durationMinutes = fin − inicio` (rechazar si es ≤ 0 o > 24 h) y consumir todo el span, incluido el separador.
- Al crear la tarea, enviar `duration_minutes`.

**Criterios de aceptación**

- `mañana 09:00-09:30`, `mañana 9:00–9:30` y `mañana de 9 a 9:30` producen el título sin restos, inicio 09:00 y duración 30.
- `tomorrow 9am-10am` funciona en inglés.
- `09:30-09:00` no genera duración negativa.
- Hay tests en `parse.spec.ts` para todos estos casos.

### TTD-AUD-03 — Se añade 09:00 al elegir solo un día

- **Severidad:** Media
- **Pantalla/URL:** selector de fecha (detalle → «Cuándo»)

**Pasos para reproducir**

1. Abre el selector de fecha de una tarea sin fecha.
2. Pulsa «Mañana».
3. Aplica.

**Resultado esperado:** tarea de día completo, sin hora.

**Resultado actual:** la tarea queda con «22 oct, 09:00».

**Evidencia:** ![](evidencias/TTD-AUD-01_a.png)

**Causa en el código (confianza Alta)**

- El selector recibe `allDay: task.is_all_day` (`TaskDetail.tsx:305`).
- `is_all_day` vale `false` por defecto (`apps/api/prisma/schema.prisma:443`).
- `setDay(key, false)` aplica la hora por defecto `'09:00'`: `web/components/DatePopover.tsx:73-75`, `:91-97` y `:219`.

**Propuesta de corrección:** si la tarea no tenía fecha, los atajos de día («Hoy», «Mañana», «+7 días», clic en el calendario) deben fijar `allDay: true`. La hora solo se añade si el usuario la elige.

**Criterios de aceptación**

- Si eliges solo un día, la tarea es de día completo y la fila no muestra hora.
- Si la tarea ya tenía hora, cambiar de día conserva esa hora.

### TTD-AUD-04 — El detalle no muestra bien «Cuándo», no hay hora de fin y la duración no se refleja

- **Severidad:** Media
- **Pantalla/URL:** panel de detalle de tarea
- **Elemento:** chip «Cuándo», selector de fecha y «Duración»

**Pasos para reproducir**

1. Abre la tarea creada en TTD-AUD-02.
2. Observa el chip «Cuándo» y el chip con bandera.
3. Abre el selector de fecha.
4. En «Duración», elige 30 min y pulsa «OK».
5. Recarga la página.

**Resultado esperado**

- «Cuándo» muestra la fecha y la hora de inicio.
- El selector permite indicar una hora de fin o una duración.
- Tras guardar, el chip y la fila muestran el rango.

**Resultado actual**

- «Cuándo» aparece vacío, mientras que la fecha aparece en el chip con bandera.
- El selector solo tiene un campo «Hora», sin fin.
- Tras «Duración 30 min» + «OK», ni el chip ni la fila cambian después de recargar (**no confirmado**: puede ser un retraso de la captura).
- El texto «90 min» se parte en dos líneas.

**Evidencia**

- ![](evidencias/TTD-AUD-04_a.webp)
- ![](evidencias/TTD-AUD-04_b.webp)
- ![](evidencias/TTD-AUD-04_c.webp)

**Causa en el código**

- La entrada rápida guarda la fecha como `due_date`, no como `start_date`. Por eso «Cuándo» (que lee `start_date`, `TaskDetail.tsx:413-421`) aparece vacío. Confianza Media: el composer envía `request.dueDate` (`web/features/tasks/TaskComposer.tsx:101`).
- Las filas no muestran la duración porque `RowModel` no la incluye (`model.ts:3-25`). Confianza Alta.

**Propuesta de corrección**

- Unificar el modelo «Cuándo / Vencimiento»:
  - la entrada rápida y «Cuándo» escriben `start_date` (y `due_date` solo si hay una fecha límite explícita);
  - el chip del detalle muestra `start ?? due`.
- Añadir un campo «Hasta» o «Duración» en el selector.
- Hacer que el texto de duración no se parta (`white-space: nowrap`).

**Criterios de aceptación**

- Tras crear una tarea con «mañana 09:00-09:30», el chip «Cuándo» muestra «Mañana, 09:00–09:30».
- Cambiar la duración se refleja en el chip y en la fila sin recargar y también después de recargar.

---

## Área 2 — Detalle de tarea

### TTD-AUD-05 — Menú «Más acciones» estrecho, con scroll horizontal y textos cortados

- **Severidad:** Alta
- **Pantalla/URL:** panel de detalle → botón «⋯ Más acciones»

**Pasos para reproducir**

1. Abre cualquier tarea.
2. Pulsa «⋯».

**Resultado esperado:** un menú vertical con todas las acciones legibles, sin scroll horizontal.

**Resultado actual**

- Popover estrecho, con barra de scroll horizontal y una rejilla de dos columnas recortada.
- Etiquetas cortadas: «Añadir subtarea», «Copiar enlace», «Vincular tarea padre».
- Acciones que no se ven: «Convertir en nota», «Exportar», «Imprimir», «Actividad de la tarea», «Posponer una semana».

**Evidencia**

- ![](evidencias/TTD-AUD-05_a.png)
- ![](evidencias/TTD-AUD-05_b.webp)

**Causa en el código (confianza Alta)**

- `.menu-group { display:flex; align-items:center }` coloca los botones en fila: `web/features/today/today.css:1284-1290`.
- El menú tiene un ancho fijo, `.popover-menu { width:220px }` (`today.css:613-616`).
- Además, `.popover { overflow:auto }` (`today.css:590-598`).
- El componente es `web/features/tasks/DetailMenu.tsx:158-208`.

**Propuesta de corrección**

- Añadir `.popover-menu .menu-group { flex-direction:column; align-items:stretch }`.
- Hacer que `.popover-row` ocupe el 100 % del ancho, con un `min-width` de unos 240 px y `max-width: calc(100vw - 24px)`.
- Quitar el scroll horizontal (`overflow-x:hidden`).

**Criterios de aceptación**

- Todas las acciones se ven en una sola columna, con icono y texto completos, en escritorio y en pantallas de 360 px.
- No hay barra de scroll horizontal.
- Se puede navegar con el teclado (flechas, Escape).

### TTD-AUD-06 — «Guardando…» durante segundos y «Creando…» al abrir una tarea

- **Severidad:** Media
- **Pantalla/URL:** panel de detalle

**Pasos para reproducir**

1. Edita cualquier campo de una tarea: el indicador muestra «Guardando…» durante varios segundos.
2. Abre una tarea: antes de que carguen los datos se ve «Creando…».

**Resultado esperado**

- «Guardando…» desaparece en cuanto el servidor confirma el cambio.
- Mientras carga el detalle se ve un estado de carga («Cargando…» o un esqueleto).

**Resultado actual:** «Guardando…» se queda varios segundos y al abrir una tarea aparece «Creando…».

**Evidencia**

- ![](evidencias/TTD-AUD-06_a.png)
- ![](evidencias/TTD-AUD-06_b.png)

**Causa en el código (confianza Alta)**

- La mutación `save` espera (`await refresh()`) dentro de `onSuccess` (`TaskDetail.tsx:96-104`). `refresh()` invalida y vuelve a pedir unas 20 consultas (`web/features/tasks/refresh.ts:4-27`), y `saving={save.isPending}` (`TaskDetail.tsx:281`) sigue en verdadero mientras tanto.
- El estado de carga usa `messages.saving`, que vale «Creando…» (`TaskDetail.tsx:145-149` y `web/i18n/es.ts:20`).

**Propuesta de corrección**

- En `onSuccess`, lanzar `void refresh()` sin esperar.
- Usar una clave `loading` y un esqueleto con el estilo del panel.

**Criterios de aceptación**

- «Guardado» aparece menos de 500 ms después de la respuesta del PATCH.
- Al abrir una tarea nunca se ve «Creando…».

---

## Área 3 — Ticky (lado ttd)

> Ticky es un módulo opcional, igual que Cuentas atrás o Foco: un asistente de IA conectado por API a un servicio externo de agentes. Este apartado cubre solo lo que corresponde a ttd. La parte de Ticky se tratará más adelante.

### TTD-AUD-07 — Ticky está enlazado, pero dice «no disponible»; página sin margen

- **Severidad:** Alta
- **Pantalla/URL:** `/ticky`, la barra de iconos y el detalle de tarea (botón «Ayúdame con esta tarea», que lleva a `/ticky?task=<id>`)

**Pasos para reproducir**

1. Pulsa el icono de Ticky en la barra de iconos, o el botón ✨ en el detalle de una tarea.

**Resultado esperado**

- Si Ticky no está activo, los accesos no aparecen o llevan a su pantalla de ajustes con un mensaje claro.
- La página respeta la maquetación común.

**Resultado actual**

- La página dice «Ticky todavía no está disponible en esta cuenta.».
- Los enlaces siguen visibles.
- La página no tiene el margen de las demás pantallas.

**Evidencia:** ![](evidencias/TTD-AUD-07_a.png)

**Causa en el código (confianza Alta)**

- `moduleEnabled` devuelve `true` para todos los módulos salvo matrix, focus y countdowns, así que Ticky se muestra siempre: `web/shell/modules.ts:23` y `:31-33`.
- El enlace del detalle se pinta sin ninguna condición: `web/features/tasks/DetailHeader.tsx:55-62`.
- El mensaje aparece cuando `flags.ui` es falso: `web/features/ticky/TickyPage.tsx:144-151`. Ese valor viene de variables de entorno del servidor (`api/modules/ticky/ticky-flags.ts:11-27`, todas en `false` en `.env.example:83-88`).
- `.ticky-page` no usa `.screen-page`: `web/features/ticky/ticky.css:1-9` frente a `web/components/ui.css:168-175`.

**Propuesta de corrección:** ver la especificación funcional de más abajo (activación por usuario, ocultar los accesos y mostrar el estado del servidor). Usar `screen-page` en la página.

**Criterios de aceptación**

- Con Ticky desactivado no aparece ni en la barra de iconos ni en el detalle.
- `/ticky` lleva a los ajustes de Ticky con el motivo concreto.
- La página tiene los mismos márgenes que el resto.

### TTD-AUD-08 — No existe ninguna pantalla para activar o configurar Ticky

- **Severidad:** Alta
- **Pantalla/URL:** `/settings/*`

**Resultado actual**

- No hay ninguna entrada de Ticky en Ajustes (`web/app.tsx:183-201` y `web/features/places/Places.tsx:1833-1871`).
- En «Funciones» (`web/features/settings/FeaturesPage.tsx:11-19`) solo aparecen `countdowns, focus, matrix, when_deadline, day_load, day_closing, day_replan`.
- Los paneles `TickySettings.tsx` (permisos y preferencias) y `TickyRoutines.tsx` (rutinas) existen, pero solo se renderizan dentro de `TickyPage` _después_ del corte por «no disponible» (`TickyPage.tsx:157-158`). Por tanto, no se pueden usar.

**Causa en el código (confianza Alta):** los flags de usuario (`api/auth/feature-flags.ts:3-26` y `web/features/settings/feature-flags.ts:4-38`) no incluyen `ticky`. Los flags de Ticky son solo de entorno (`ticky-flags.ts`).

**Propuesta de corrección:** implementar la especificación funcional siguiente.

**Criterios de aceptación:** ver la especificación funcional.

### Especificación funcional — Ajustes de Ticky en ttd

**Objetivo:** que Ticky se comporte como cualquier otro módulo opcional. El usuario debe poder activarlo o desactivarlo y configurar desde ttd todo lo que sea configurable, sin tocar variables de entorno.

**Ruta y navegación**

- Nueva ruta `/settings/ticky`, dentro del grupo de módulos de Ajustes en `Places.tsx` (cerca de la línea 1833).
- Enlace desde «Funciones».

#### F-1 — Activación por usuario

- Añadir el flag `ticky` en ambos `feature-flags.ts`, en `KEYS` de `FeaturesPage` y en `moduleEnabled`.
- Proteger `/ticky` con `FeatureRoute`.
- Valor por defecto: desactivado.
- **Criterio de aceptación:** al desactivarlo desaparecen el icono, el botón ✨ del detalle, la entrada de la paleta de comandos y las rutinas. Al activarlo vuelven a aparecer sin recargar.

#### F-2 — Mensajes sobre el estado del servidor

La pantalla distingue con mensajes propios entre:

- (a) el administrador no ha configurado el servicio (falta la URL o la clave de firma);
- (b) el administrador lo ha desactivado o hay un corte de emergencia (kill switch);
- (c) el servicio no responde (comprobación de salud fallida);
- (d) el usuario no lo ha activado.

`/api/v1/ticky/flags` debe devolver además `configured` y `reachable`.

**Criterio de aceptación:** cada caso muestra su texto y una acción, por ejemplo «Activar» o «Reintentar». El mensaje «no disponible en esta cuenta» desaparece.

#### F-3 — Conexión

Esta sección solo se muestra si el despliegue permite configurarla desde la app. Si no, se muestra solo el estado.

- **Campos:** URL del servicio y credencial.
- **Secretos:** se guardan solo en el servidor y se muestran enmascarados (`••••1234`). No se devuelven nunca en GET.
- **Botón «Probar conexión»:** hace una llamada de salud desde la API y muestra la latencia y la versión.
- **Criterio de aceptación:** un secreto nunca aparece completo en respuestas, registros ni en el DOM, y «Probar conexión» informa del éxito o del error con un mensaje claro.

#### F-4 — Modelo o agente por defecto

- Selector alimentado por `GET /api/v1/ticky/models` (existe: `api/modules/ticky/ticky.service.ts:567-582`), con «Sin IA» como opción.
- Se guarda como preferencia del usuario. Hoy solo existe un selector dentro del chat (`TickyPage.tsx:268`).
- **Criterio de aceptación:** el modelo elegido se usa por defecto en conversaciones nuevas y se puede cambiar en cada mensaje.

#### F-5 — Permisos y preferencias

Reutiliza `TickySettings` y añade los campos que ya existen en `TickyAuthority` (`apps/api/prisma/schema.prisma:1337-1358`) pero que la interfaz no muestra:

- `paused` (pausar);
- `revoked` (revocar el acceso);
- `readEnabled`;
- `estimateLearningEnabled`;
- `coachingSilence` y `reminderSilence`.

Se mantienen los campos actuales: autonomía A0–A2, listas permitidas (máximo 10), bandeja de captura, permisos explícitos y jornada.

**Criterio de aceptación:** cada cambio se guarda con `PATCH /ticky/authority` y muestra «Guardado». Si el guardado falla, se muestra el error y se restaura el valor anterior.

#### F-6 — Rutinas

- Mover `TickyRoutines` a los ajustes: plan diario y revisión semanal, hora, zona, modo de prueba, pausar y editar.
- **Criterio de aceptación:** las rutinas se pueden gestionar con Ticky activo aunque no se haya abierto nunca el chat.

#### F-7 — Memorias

- Lista de las memorias guardadas, con opción de borrar. Los endpoints ya existen (`api/modules/ticky/ticky.controller.ts:254-283`), pero no hay interfaz.
- **Criterio de aceptación:** el usuario puede ver y borrar cada memoria, con confirmación propia (no `confirm()`).

#### F-8 — Telegram

- Conmutador para usar Ticky desde Telegram, condicionado a que la integración de Telegram esté conectada y a que el servidor lo permita.
- **Criterio de aceptación:** el conmutador está deshabilitado y explica el motivo cuando falta alguna de las dos condiciones.

#### F-9 — Idioma

- Todos los textos de `TickyPage`, `TickySettings`, `TickyRoutines`, `ProposalReview` y `ticky/api.ts` pasan a `i18n` (ES/EN). Hoy están fijos en español: ver TTD-AUD-27.
- **Criterio de aceptación:** en modo inglés no queda ningún texto en español.

#### F-10 — Accesos

- Cuando Ticky está desactivado, el icono, el botón ✨ y los atajos se ocultan. Si se entra directamente a `/ticky`, se redirige a `/settings/ticky`.

---

## Área 4 — Datos y métricas

### TTD-AUD-09 — Completadas de la semana: 104 en Estadísticas frente a 314 en el Panel

- **Severidad:** Alta
- **Pantalla/URL:** `/statistics` (Semana) y `/dashboard`

**Pasos para reproducir**

1. Abre Estadísticas → Semana (19–25 oct).
2. Abre el Panel («Jardín digital»).

**Resultado esperado:** la misma métrica, con el mismo periodo y la misma etiqueta, da el mismo número.

**Resultado actual**

- Estadísticas: «Completadas 104 · Periodo anterior: 210».
- Panel: «Completadas hoy 0 · 314 en 7 días».

**Evidencia**

- ![](evidencias/TTD-AUD-09_a.png)
- ![](evidencias/TTD-AUD-09_b.png)

**Causa en el código (confianza Media-Alta)**

- Estadísticas usa la semana de calendario de lunes a domingo (`web/features/statistics/range.ts:31-38` y `domain/stats/aggregate.ts:196-220`) y excluye las tareas canceladas.
- El Panel usa una ventana móvil de 7×24 h (`domain/dashboard/kpis.ts:97` y `:118-120`).
- 314 ≈ 104 + la mayor parte de las 210 de la semana anterior, lo que encaja con esa diferencia de ventanas.

**Propuesta de corrección:** usar una sola definición de la ventana (o etiquetar con claridad «últimos 7 días» frente a «esta semana») y la misma regla de exclusión en las dos pantallas.

**Criterio de aceptación:** con el mismo periodo, las dos pantallas muestran el mismo número, y un test compartido del dominio fija la regla.

### TTD-AUD-10 — Tiempo de foco: «1,35 min» frente a 397 min

- **Severidad:** Alta
- **Pantalla/URL:** `/statistics` y `/focus`

**Resultado actual**

- Estadísticas: «Tiempo de foco 1,35 min · 2 Pomodoros».
- `/focus`: 397 minutos y «Pomodoros 3».

**Evidencia**

- ![](evidencias/TTD-AUD-10_a.png)
- ![](evidencias/TTD-AUD-20_a.png)

**Causa en el código (confianza Alta)**

- Estadísticas suma `actualSeconds/60` del rango (`aggregate.ts:459-467`) y lo formatea sin redondear (`web/features/statistics/text.ts:184-187`); de ahí salen los decimales.
- `/focus` muestra el total histórico, sin filtro de fechas (`api/modules/focus/focus.controller.ts:212-218` y `web/features/product/ProductPages.tsx:92`).
- Que 2 pomodoros completados sumen 1,35 min es sospechoso: puede que `actualSeconds` no se registre bien al completar un pomodoro. **No confirmado.**

**Propuesta de corrección**

- Redondear en `duration()`.
- Etiquetar `/focus` como «Total» o filtrarlo por el mismo periodo.
- Revisar cómo se calcula `actual` al terminar una sesión (`focus.controller.ts`, alrededor de la línea 328).

**Criterio de aceptación:** nunca se muestran minutos con decimales, y las cifras de ambas pantallas cuadran para el mismo periodo.

### TTD-AUD-11 — El informe semanal sale vacío

- **Severidad:** Alta
- **Pantalla/URL:** `/reports/weekly`

**Resultado actual:** «Sin detalle diario verificable para esta semana.», «Sin datos» en Completadas, Hábitos y Foco, y «Fecha de cálculo no disponible».

**Evidencia:** ![](evidencias/TTD-AUD-11_a.png)

**Causa en el código (confianza Alta)**

- La automatización `writeReport` guarda solo `{summary, observations}`, sin `days`, `calculated_at` ni `metrics_version`: `api/modules/automations/automations.controller.ts:299-318`.
- Además, calcula la semana empezando en domingo y en UTC, mientras que el informe usa el lunes en hora local (`api/modules/reports/reports.controller.ts:122` y `:223-274`).
- La página necesita `days.length === 7` y `calculated_at` (`web/features/product/WeeklyPages.tsx:56-58`, `:127` y `:202-204`).

**Propuesta de corrección:** hacer que la automatización llame al mismo constructor que `POST /reports/weekly` y migrar o regenerar los informes antiguos.

**Criterio de aceptación:** el informe de la semana en curso muestra completadas, creadas, hábitos, foco y la fecha de cálculo.

### TTD-AUD-12 — «15 Atrasado» parece un recuento, pero es una puntuación

- **Severidad:** Media
- **Pantalla/URL:** chip superior de la barra lateral y del Panel, frente al aviso «Vencidas»

**Resultado actual:** el chip dice «1 día · 15 Atrasado» y el aviso de vencidas dice «11».

**Evidencia:** ![](evidencias/TTD-AUD-12_a.png)

**Causa en el código (confianza Alta)**

- «15» es la puntuación de control sobre 100, y «Atrasado» significa que es menor que 50 (`web/features/statistics/ControlSummary.tsx:55` y `:102-111`, `text.ts:143`).
- «11» es el número de tareas vencidas (`api/reading/overdue.ts:16-34`).

**Propuesta de corrección:** mostrar «15/100 · Atrasado», o un icono de puntuación, en el chip.

**Criterio de aceptación:** el chip no se puede confundir con un número de tareas.

---

## Área 5 — Listas, filtros y navegación

### TTD-AUD-13 — /filters usa controles nativos sin estilo y etiquetas erróneas

- **Severidad:** Media
- **Pantalla/URL:** `/filters`

**Resultado actual**

- Botones grises nativos («Añadir condición», «Añadir grupo», «Vista previa», «Guardar»).
- El selector del campo tiene la etiqueta «Palabra».
- El selector «Modo» es más ancho que los demás.

**Evidencia:** ![](evidencias/TTD-AUD-13_a.png)

**Causa en el código (confianza Alta)**

- Se usan `<button>` nativos en lugar del componente `Button`: `web/features/views/components/FiltersPage.tsx:198`, `:214`, `:224` y `:232`.
- `.condition` no tiene CSS (`FiltersPage.tsx:266`).
- `.habit-form` estira los selects al 100 % (`web/styles.css:294-320`).
- Etiquetas incorrectas: `fieldKeyword` («Palabra») se usa como etiqueta del selector de campo (`:267-269`), y `combinatorAnd` («Y») como etiqueta de los combinadores (`:149-151` y `:166-168`).

**Propuesta de corrección**

- Usar `Button` y los estilos de select de `ui.css`.
- Añadir `.condition { display:flex; gap }`.
- Usar etiquetas específicas («Campo», «Combinar con»).

**Criterio de aceptación:** los controles tienen el mismo aspecto que en Ajustes, en tema claro y oscuro, y cada select tiene una etiqueta correcta.

### TTD-AUD-14 — /matrix: «Ámbito» desalineado, una «i» suelta y un cuadrante cortado

- **Severidad:** Media
- **Pantalla/URL:** `/matrix`

**Resultado actual**

- «Ámbito» aparece encima del select.
- Hay una «i» cortada en el borde derecho.
- El cuadrante inferior derecho está cortado.
- En modo oscuro el select es nativo y blanco.

**Evidencia**

- ![](evidencias/TTD-AUD-14_a.png)
- ![](evidencias/TTD-AUD-14_b.webp)

**Causa en el código (confianza Alta, salvo el corte del cuadrante)**

- La regla `.screen-page label:not(.task-check-hit){flex-direction:column}` (`web/components/ui.css:1925-1931`) tiene más especificidad que `.matrix-scope` (`web/features/matrix/matrix.css:9-13`).
- El botón de información es la letra «i» literal: `web/features/matrix/MatrixBoard.tsx:177-187`.
- El corte del cuadrante probablemente viene de `.quad-grid > .quad { overflow:hidden }` (`ui.css:317-320`). Confianza Media.

**Propuesta de corrección**

- Añadir `.screen-page .matrix-scope { flex-direction:row }`.
- Usar el icono `<Info/>` de lucide.
- Quitar el `overflow:hidden` o hacer scroll interno por cuadrante.
- Dar estilo al select en modo oscuro.

**Criterio de aceptación:** la cabecera ocupa una sola línea, se ven los cuatro cuadrantes completos y el select se ve bien en ambos temas.

### TTD-AUD-15 — Papelera: acciones a la izquierda del título y la barra de confirmación lo tapa

- **Severidad:** Media
- **Pantalla/URL:** `/smart/trash`

**Resultado actual**

- «Restaurar» y «Eliminar» aparecen a la izquierda del título.
- Al pulsar «Eliminar», la barra de confirmación tapa el título tachado.

**Evidencia**

- ![](evidencias/TTD-AUD-15_a.png)
- ![](evidencias/TTD-AUD-15_b.png)

**Causa en el código (confianza Alta)**

- `TrashActions` se renderiza en el hueco del checkbox: `web/features/tasks/TaskList.tsx:291-306`.
- La fila tiene altura fija (`today.css:134-143`) y los botones de confirmación son de tamaño completo (`TaskList.tsx:716-742`).

**Propuesta de corrección:** mover las acciones al final de la fila (zona de metadatos) y mostrar la confirmación como un popover o en una línea propia.

**Criterio de aceptación:** el título se lee siempre completo y las acciones están alineadas a la derecha.

### TTD-AUD-16 — Papelera: tras «Confirmar borrado» la fila y el contador no cambian

- **Severidad:** Alta
- **Pantalla/URL:** `/smart/trash`

**Resultado actual:** después de «Confirmar borrado», la fila sigue ahí y el contador sigue en «28 tareas» hasta que recargas.

**Evidencia:** ![](evidencias/TTD-AUD-16_a.png)

**Causa en el código (confianza Baja — no confirmada)**

- Las claves de caché sí coinciden: `['smart-list-tasks','trash',…]` y `['smart-lists']` se invalidan en `refresh.ts:13` y `:17`.
- Pero `api.purgeTask(...).then(...)` no gestiona el error (`TaskList.tsx:304`). Si la petición `DELETE /api/v1/tasks/trash/:id` falla, la fila se queda sin ningún aviso.
- Hay que comprobar la petición en la pestaña de red del navegador.

**Propuesta de corrección**

- Quitar la fila de la caché de forma optimista.
- Gestionar el error con un aviso y restaurar la fila.
- Invalidar `['smart-lists']`.

**Criterio de aceptación:** la fila desaparece y el contador baja de inmediato. Si la petición falla, aparece un aviso de error y la fila vuelve.

### TTD-AUD-17 — El botón «Crear» de «Nueva lista» es nativo y no lleva estilo

- **Severidad:** Media
- **Pantalla/URL:** barra lateral → «+» en Listas o Etiquetas

**Resultado actual:** el botón «Crear» es gris, cuadrado y nativo.

**Evidencia:** ![](evidencias/TTD-AUD-17_a.webp)

**Causa en el código (confianza Alta):** hay `<button type="submit">` sin clase en `web/shell/Sidebar.tsx:395` y `:584`, y no existe ninguna regla `.nav-create button` (`web/shell/shell.css:112-113` y `:816`, `ui.css:822-829`).

**Propuesta de corrección:** usar `<Button size="sm" variant="primary">`.

**Criterio de aceptación:** el botón usa el estilo de la app en ambos temas.

### TTD-AUD-18 — Al borrar una lista se queda en /list/<id> y acaba en «No encontrado»

- **Severidad:** Media
- **Pantalla/URL:** `/list/<id>`

**Pasos para reproducir**

1. Abre una lista.
2. En su menú, elige borrarla y confirma.

**Resultado esperado:** la app redirige a la Bandeja o a «Hoy» y muestra un aviso.

**Resultado actual:** la URL sigue siendo `/list/<id>`, con la cabecera «0 tareas», y más tarde aparece «No encontrado / Esa página no existe o ya no está.».

**Evidencia:** ![](evidencias/TTD-AUD-18_a.webp)

**Causa en el código (confianza Alta):** después de `deleteProject` no se navega a ninguna parte y no se gestiona el error (`web/shell/Sidebar.tsx:868-878`).

**Propuesta de corrección:** si la ruta actual es la de esa lista, `navigate('/inbox', {replace:true})` y mostrar un aviso con opción de deshacer, si existe.

**Criterio de aceptación:** después de borrar no se ve nunca la pantalla «No encontrado».

### TTD-AUD-19 — Una URL desconocida redirige a /today sin ningún aviso de 404

- **Severidad:** Media
- **Pantalla/URL:** `/does-not-exist`

**Resultado actual:** redirige sin decir nada a `/today?group=priority`.

**Evidencia:** ![](evidencias/TTD-AUD-19_a.webp)

**Causa en el código (confianza Alta):** `<Route path="*" element={<Navigate to="/today" replace />}>` en `web/app.tsx:203`. El parámetro `group=priority` sale de la vista guardada de «Hoy».

**Propuesta de corrección:** crear una página 404 con estilo propio y un enlace a «Hoy».

**Criterio de aceptación:** una ruta inexistente muestra una 404 y la URL no cambia.

---

## Área 6 — Foco y cuentas atrás

### TTD-AUD-20 — /focus: sin anillo de temporizador y presets sin estado

- **Severidad:** Media
- **Pantalla/URL:** `/focus`

**Resultado actual**

- Se ve «25:00» como texto plano, sin anillo de progreso.
- Los botones 15/25/50 no tienen estilo ni marcan cuál está seleccionado.

**Evidencia:** ![](evidencias/TTD-AUD-20_a.png)

**Causa en el código (confianza Alta)**

- El temporizador es un `<p className="detail-title">` (`ProductPages.tsx:106`).
- `.focus-ring` existe en `web/shell/shell.css:677-693`, pero ningún componente lo usa.
- No hay estilo para `.ui-button[aria-pressed='true']` (los presets están en `ProductPages.tsx:107-121`).
- Las llamadas `.then` sin gestión de error están en `:114`, `:144`, `:156` y `:171`.

**Propuesta de corrección**

- Crear un componente de anillo SVG con los tokens de color.
- Añadir un estilo para el estado pulsado.
- Gestionar los errores.

**Criterio de aceptación:** el anillo muestra el progreso, el preset activo se distingue y todo funciona en ambos temas.

### TTD-AUD-21 — /countdowns: el título se parte y el emoji se corta

- **Severidad:** Media
- **Pantalla/URL:** `/countdowns`

**Resultado actual**

- El título se parte en «Cuenta / atrás».
- El emoji ⏳ de las tarjetas aparece recortado.

**Evidencia:** ![](evidencias/TTD-AUD-21_a.png)

**Causa en el código**

- Título (confianza Alta): `<h1>` dentro de un flex sin `nowrap` ni `flex-shrink:0` (`web/features/countdowns/CountdownsPage.tsx:86-87` y `countdowns.css:1-17`).
- Emoji (confianza Media): está dentro de `.countdown-title`, que limita a 2 líneas con `overflow:hidden` (`CountdownCard.tsx:30-33` y `countdowns.css:139-146`).

**Propuesta de corrección:** añadir `white-space:nowrap` al h1 y sacar el emoji del bloque recortado.

**Criterio de aceptación:** el título ocupa una línea en escritorio y el emoji se ve completo.

### TTD-AUD-22 — Modo oscuro: las tarjetas de cuenta atrás son ilegibles

- **Severidad:** Alta
- **Pantalla/URL:** `/countdowns` con el tema oscuro

**Resultado actual:** texto blanco sobre fondo rosa pastel. «Cumple mes» y «días · hasta 19 nov 2026» no se pueden leer.

**Evidencia:** ![](evidencias/TTD-AUD-22_a.webp)

**Causa en el código (confianza Alta)**

- Los colores de las tarjetas son pasteles fijos, sin variante oscura: `web/features/countdowns/countdowns.css:99-134`.
- En el tema oscuro, `--ink` es `#fff` (`web/styles/tokens.css:114-115`).

**Propuesta de corrección:** definir tokens `--countdown-<color>-bg/-ink` en `tokens.css`, con variante `[data-theme='dark']`, o usar `color-mix` sobre `--surface`.

**Criterio de aceptación:** el contraste es de al menos 4,5:1 (WCAG AA) en todas las variantes de color y en ambos temas.

### TTD-AUD-23 — Modal «Nueva cuenta atrás» mal maquetado

- **Severidad:** Alta
- **Pantalla/URL:** `/countdowns` → «Nueva» → tipo

**Resultado actual**

- Los checkboxes y radios aparecen centrados encima de su texto («Recordatorios», «Modo de cálculo», «Mostrar el día D en Hoy»).
- Los selects son nativos.
- El campo de fecha muestra «mm/dd/yyyy» aunque la interfaz esté en español.
- El modal es cuadrado.

**Evidencia**

- ![](evidencias/TTD-AUD-23_a.webp)
- ![](evidencias/TTD-AUD-23_b.webp)

**Causa en el código**

- Maquetación (confianza Alta): `.countdown-dialog label { display:grid }` apila el input y el texto (`countdowns.css:178-182`). Los checkboxes sueltos de `CountdownDialog.tsx:240-260` no están dentro de un `fieldset`, así que no reciben el `display:flex` de `countdowns.css:186-189`.
- Formato de fecha (confianza Media): `<input type="date">` (`CountdownDialog.tsx:112`) muestra el formato del navegador, no el `lang="es"` de la página. En el navegador de la auditoría se vio «mm/dd/yyyy».
- Selects (confianza Alta): son nativos (`:122`, `:137`, `:158`).

**Propuesta de corrección**

- Añadir `.countdown-dialog label:has(input[type=checkbox], input[type=radio]) { display:flex; align-items:center; gap }`.
- Usar el `DatePopover` de la app o un campo con el formato del idioma.
- Usar los estilos de select de `ui.css`.

**Criterio de aceptación:** cada casilla queda alineada a la izquierda de su texto, la fecha sale en formato dd/mm/aaaa en español y el modal sigue el estilo de los demás.

### TTD-AUD-24 — El menú «Nueva» de cuentas atrás no se cierra

- **Severidad:** Media
- **Pantalla/URL:** `/countdowns`

**Resultado actual**

- El desplegable «Nueva» sigue abierto después de guardar.
- No responde a Escape.
- Puede quedar abierto a la vez que el menú «…» de una tarjeta.

**Evidencia**

- ![](evidencias/TTD-AUD-24_a.webp)
- ![](evidencias/TTD-AUD-24_b.webp)

**Causa en el código (confianza Alta)**

- Es un `<details>` nativo que nadie cierra: `CountdownsPage.tsx:101-117`. Las tarjetas también usan `<details>` (`CountdownCard.tsx:44-45`).
- Además, el botón «Agrupar por tipo» usa el icono «…» (`MoreHorizontal`, `CountdownsPage.tsx:119-130`), lo que confunde.

**Propuesta de corrección:** usar el componente `Popover` de la app, que gestiona Escape, el clic fuera y el cierre al elegir. Cambiar el icono de agrupar.

**Criterio de aceptación:** el menú se cierra al elegir una opción, con Escape y al hacer clic fuera, y solo puede haber un menú abierto a la vez.

---

## Área 7 — Tema y estilos

### TTD-AUD-25 — Modo oscuro: contraste insuficiente en la barra de iconos, el elemento activo y el selector de tema

- **Severidad:** Media
- **Pantalla/URL:** barra de iconos, barra lateral y `/settings/appearance` con el tema oscuro

**Resultado actual**

- Los iconos de la barra de iconos son gris oscuro sobre casi negro.
- El elemento activo («Hoy») es blanco sobre gris claro.
- El conmutador «Oscuro» es azul sobre azul.
- El select de la matriz es blanco y nativo.

**Evidencia**

- ![](evidencias/TTD-AUD-25_a.webp)
- ![](evidencias/TTD-AUD-25_b.webp)
- ![](evidencias/TTD-AUD-25_c.webp)

**Causa en el código**

- Elemento activo (confianza Alta): `.sidebar .nav-link.is-active { background: rgb(255 255 255 / 0.62); color: var(--ink) }`, con color fijo (`web/shell/shell.css:236-240`). También hay un hover fijo en `:232-234`. En oscuro, `--ink` es blanco.
- Barra de iconos (confianza Media): `--rail-bg` es igual que `--bg` (#242424) en el tema oscuro (`tokens.css:105-107`).
- Conmutador (confianza Media): usa `--accent-soft`/`--accent-ink` en `ui.css:1634-1639`.

**Propuesta de corrección:** pasar los colores fijos a tokens con variante oscura y revisar el contraste de `--accent-ink` sobre `--accent-soft`.

**Criterio de aceptación:** contraste AA en los elementos activos, al pasar el ratón y en los iconos, en ambos temas.

### TTD-AUD-26 — El botón de login usa un color fijo y no el acento

- **Severidad:** Baja
- **Pantalla/URL:** `/login` y `/register`

**Causa en el código (confianza Alta):** `background: #4772fa` en lugar de `var(--accent)` (`web/features/auth/auth.css:72`), mientras que el hover sí usa `var(--accent-hover)`. Otros colores fijos que deberían salir de tokens:

- color por defecto de listas y etiquetas: `Sidebar.tsx:360` y `:548`, `TagPicker.tsx:100`;
- paletas duplicadas: `Sidebar.tsx:47`, `TagActions.tsx:31-38`, `Places.tsx:77-82`.

**Propuesta de corrección:** usar tokens en todos estos puntos.

**Criterio de aceptación:** con un acento distinto del índigo, el botón de login usa ese acento.

---

## Área 8 — Idioma (i18n)

### TTD-AUD-27 — Textos sin traducir en modo inglés

- **Severidad:** Media
- **Pantalla/URL:** `/today`, `/countdowns`, `/ticky`, el Panel y la pantalla de error

**Resultado actual (EN)**

- En `/today` se ve «¡Vence hoy!».
- Todo `/countdowns` está en español: «Cuenta atrás», «Activos», «Archivados», «Nueva», «Agrupar por tipo», «Cargando cuentas atrás…».

**Evidencia:** ![](evidencias/TTD-AUD-27_a.webp)

**Causa en el código (confianza Alta): textos fijos en el código**

- **Hoy:** `web/features/today/TaskGroup.tsx:280-286` («¡Vence hoy!», «Vence mañana», «Vence en N días») y `TodayPage.tsx:645` y `:742`.
- **Cuentas atrás:**
  - `CountdownsPage.tsx:87-158`;
  - `CountdownDialog.tsx` (13 líneas, entre ellas `:74`, `:214`, `:218`, `:248` y `:258`);
  - `CountdownCard.tsx:38`, `:45` y `:73`;
  - `presentation.ts:5-21`.
- **Ticky:**
  - `TickyPage.tsx:163-321`;
  - `ProposalReview.tsx:78-133`;
  - `TickySettings.tsx:32-194`;
  - `TickyRoutines.tsx:121-277`;
  - `ticky/api.ts:180-244`, con errores mostrados en español.
- **Otros:**
  - `dashboard/ProjectContext.tsx:14`;
  - `shell/ErrorBoundary.tsx:21` y `:28`.
- **Estadísticas:** `ControlSummary.tsx:193-206` traduce frases españolas de la API con expresiones regulares, que se rompen si cambia el texto del servidor.

**Propuesta de corrección**

- Mover todo a `i18n/` (o a los ficheros de textos de cada módulo).
- Hacer que la API devuelva códigos en vez de frases.
- Ampliar `i18n/keys.spec.ts` con una comprobación que impida textos visibles fijos en JSX (lint o test).

**Criterio de aceptación:** recorriendo la app en inglés no aparece ningún texto en español.

---

## Área 9 — Robustez (hallazgos del código)

### TTD-AUD-28 — ~70 acciones fallan en silencio

- **Severidad:** Alta
- **Pantalla/URL:** transversal

**Descripción**

- Hay unas 70 llamadas del tipo `void api.x().then(fn)` sin gestión del error y sin `.catch`, y no existe un manejador global de `unhandledrejection`.
- Si la API falla, el usuario no recibe ningún aviso y la interfaz no cambia.

**Ejemplos (confianza Alta)**

- **Hoy:** `web/features/today/TodayPage.tsx:390` (editar), `:394` (mover a la papelera) y `:396` (deshacer).
- **Detalle de tarea:** `web/features/tasks/TaskDetail.tsx:521-540` (checklist y subtareas).
- **Lista de tareas:** `TaskList.tsx:195` (borrado en bloque) y `:304` (eliminar de la papelera).
- **Barra lateral:** `web/shell/Sidebar.tsx:443`, `:819`, `:843`, `:857` y `:872` (mover, renombrar, cambiar color, archivar y borrar listas).
- **Cerrar sesión:** `web/shell/AccountMenu.tsx:69` y `Sidebar.tsx:719`.
- **Foco, calendario e integraciones:** `ProductPages.tsx:114-532`. Por ejemplo, `connectGoogle` (`:403`) no hace nada si la URL no es de Google.
- **Ajustes:** `MoreSettings.tsx:103`, `:140`, `:270`, `:300` y `:338`; `InboundEmailCard.tsx:43` y `:84`; `FeaturesPage.tsx:123`.

**Propuesta de corrección**

- Crear un helper `runAction(promise, {success, error})` que muestre un aviso (`action-toast`) en caso de error, y usarlo en todas esas llamadas.
- Añadir una regla de ESLint que prohíba `.then` sin manejador de rechazo.

**Criterio de aceptación**

- Simulando un 500 en cada endpoint aparece un aviso de error y la interfaz vuelve a su estado anterior.
- Lint no admite llamadas nuevas sin gestión del error.

### TTD-AUD-29 — No hay gestión de sesión caducada (401)

- **Severidad:** Alta

**Descripción (confianza Alta)**

- Ni `web/api.ts` ni `packages/sdk/src` gestionan una respuesta 401.
- La sesión solo se comprueba al arrancar (`web/features/auth/RequireSession.tsx:20-27`). Además, cualquier error en esa comprobación, sea de red o un 5xx, marca la sesión como anónima (`:24-25`).
- Si la cookie caduca mientras se usa la app, todo falla sin aviso (ver TTD-AUD-28).

**Propuesta de corrección**

- Interceptar los 401 en el SDK y redirigir a `/login?next=<ruta>`.
- En el arranque, distinguir un 401 de un error de red y ofrecer reintentar.

**Criterio de aceptación**

- Al caducar la sesión, la siguiente acción lleva al login y, tras entrar, se vuelve a la misma ruta.
- Sin red, la app no te desconecta.

### TTD-AUD-30 — Un único ErrorBoundary global y solo en español

- **Severidad:** Media

**Descripción (confianza Alta)**

- `ScreenBoundary` envuelve toda la app (`web/main.tsx:42-44`), aunque su comentario dice que «evita que una pantalla rota tumbe toda la app».
- Un error de render sustituye la app entera (sin barra lateral) por un texto solo en español (`web/shell/ErrorBoundary.tsx:21` y `:28`).
- No se reinicia al navegar.

**Propuesta de corrección:** colocar un boundary por ruta dentro de `AppShell`, reiniciarlo al cambiar de `location.pathname`, traducir los textos y registrar el error.

**Criterio de aceptación:** un error en una pantalla mantiene visibles la barra lateral y la navegación, y al cambiar de ruta la app se recupera.

### TTD-AUD-31 — Pantallas sin estado de carga o de error

- **Severidad:** Media

**Descripción (confianza Alta)**

- `ProductPages.tsx` tiene 10 consultas sin estado de carga ni de error:
  - Foco: `:42-54`;
  - ajustes de Calendario: `:188-190`;
  - Integraciones: `:393-398`. Si falla la consulta, la píldora muestra «desconectado» igualmente (`:433-439`).
- Sin estado de error: `matrix/MatrixBoard.tsx:107-129` (un error parece una matriz vacía), `views/components/FiltersPage.tsx:29-30`, `settings/FeaturesPage.tsx`, `settings/WorkdaySettings.tsx:18`, `views/components/CommandPalette.tsx` y `shell/IconRail.tsx`.

**Propuesta de corrección:** usar en todas un patrón común: esqueleto mientras carga, `EmptyState` si no hay datos y alerta con «Reintentar» si hay error.

**Criterio de aceptación:** con la API caída, cada pantalla muestra un error y la opción de reintentar, y nunca datos falsos.

---

## Área 10 — Pulido

### TTD-AUD-32 — Detalles: «1 tareas», confirm() nativo, «Comprobando la sesión…» sin estilo

- **Severidad:** Baja

**Resultado actual**

- La cabecera dice «1 tareas».
- Al borrar una cuenta atrás aparece el `confirm()` nativo del navegador («¿Eliminar «TEST AUDIT countdown»?»).
- Al cargar una URL directamente se ve «Comprobando la sesión…» sin estilo durante varios segundos.
- Las filas de la barra lateral muestran «0 días · — Sin datos» mientras cargan.

**Evidencia**

- ![](evidencias/TTD-AUD-32_a.webp)
- ![](evidencias/TTD-AUD-32_b.webp)

**Causa en el código (confianza Alta)**

- No se distingue el plural: `ViewPages.tsx:231` con `taskCount: '{count} tareas'` (`i18n/extra.ts:64`).
- `window.confirm` se usa en `CountdownsPage.tsx:71`, en hábitos (`HabitsPage.tsx:67`, `HabitDetailPage.tsx:121` y `:262`, `HabitCard.tsx:106`) y en planificación (`PlanDayPage.tsx:167`, `WeeklyPages.tsx:238`).
- El texto de carga de la sesión es un `<p className="ui-muted">` sin maquetación: `RequireSession.tsx` (alrededor de la línea 37) y `AuthPages.tsx:39`.

**Propuesta de corrección:** usar `Intl.PluralRules`, un diálogo de confirmación propio y una pantalla de carga con el logotipo.

**Criterio de aceptación:** dice «1 tarea», no se usa ningún `confirm()` nativo y la pantalla de carga está maquetada.

### TTD-AUD-33 — Menú móvil oculto con destinos extraños (no confirmado)

- **Severidad:** Baja

**Resultado actual (solo visto en el DOM, no en pantalla)**

- En el menú móvil oculto, un segundo «Funciones» lleva a `/settings/automations`.
- «Tokens y MCP» lleva a `/tag/3cc24f31-…`.

**Causa en el código:** no encontrada. El menú «Más» móvil (`Sidebar.tsx:709-730`) solo enlaza a Apariencia y Cerrar sesión. Puede tratarse de listas o etiquetas del propio usuario con esos nombres. **No confirmado.**

**Criterio de aceptación:** en un móvil real, cada enlace lleva a su destino.

### TTD-AUD-34 — 4 errores en la consola en el login (no analizados)

- **Severidad:** Baja
- **Pantalla/URL:** `/login`

**Resultado actual:** la consola del navegador mostró 4 errores. No se leyeron. **No confirmado.**

**Criterio de aceptación:** el login carga sin errores en la consola.

---

## Área 11 — Tokens, MCP e integraciones

Revisión de `/settings/tokens` («Tokens y MCP»), `/oauth/consent`, `/settings/integrations` y `/settings/webhooks`, hecha a partir de la propuesta de otro agente («Especificación funcional y de UI: Tokens, MCP e Integraciones», v2) y de sus tres bocetos. Todo se ha verificado leyendo el código en el commit `36f9209`. Lo que necesita navegador está en «Pendiente de comprobar en navegador», al final de esta área. El veredicto completo, propuesta por propuesta, está en `revision-propuesta-tokens-mcp.md`.

**Contexto técnico necesario para leer los hallazgos**

- Los tokens manuales y los _access tokens_ OAuth (ChatGPT, Claude…) se guardan en la misma tabla `PersonalAccessToken`. Los de OAuth se distinguen solo por `oauthClientId` (`schema.prisma:785-786`).
- Un _access token_ OAuth caduca a la hora (`api/auth/oauth.service.ts:49`). En cada renovación se revoca el anterior y se crea una fila nueva con el mismo nombre (`oauth.service.ts:369-390`). Un cliente activo genera, por tanto, hasta unas 24 filas revocadas al día.
- La revocación de una fila OAuth revoca en cascada toda su familia de _refresh_ (`api/auth/tokens.service.ts:128-158` y `api/auth/oauth-refresh.ts:43-65`), dentro de una transacción. Esto funciona bien.

### TTD-AUD-35 — La lista de tokens solo carga 50 filas y las renovaciones OAuth la llenan: los tokens antiguos desaparecen

- **Severidad:** Alta
- **Pantalla/URL:** `/settings/tokens` y `/tokens`
- **Elemento:** lista de tokens y plegable «Revocados (N)»

**Pasos para reproducir**

1. Conectar ChatGPT (u otro cliente OAuth) y usarlo durante uno o dos días.
2. Abrir «Tokens y MCP».

**Resultado esperado:** se ven todos los tokens activos y el número de revocados es el real.

**Resultado actual (deducido del código)**

- La pantalla pide una sola página: `tokensApi.listTokens()` sin cursor (`web/features/tokens/components/TokensPage.tsx:113`). El servidor devuelve 50 filas por defecto (`api/http/cursor.ts:15-18`), ordenadas por fecha de creación descendente (`tokens.service.ts:50-66`). `next_cursor` se ignora y no hay «Cargar más».
- Cada renovación OAuth crea una fila nueva y revoca la anterior (`oauth.service.ts:369-390`). En unas 48 horas de uso, las 50 primeras filas son casi todas renovaciones de ChatGPT.
- Consecuencias:
  - un token manual creado antes **deja de aparecer** aunque siga activo;
  - «Revocados (N)» (`TokensPage.tsx:448-453`) cuenta solo lo que hay en la página y mezcla rotaciones automáticas con revocaciones hechas por el usuario.
- La cifra «Revocados (24)» del boceto coincide con lo que produce un día de renovaciones horarias.

**Evidencia:** código (sin captura). El número real de filas en producción está pendiente de comprobar (ver la lista de pendientes).

**Causa en el código (confianza Alta en la lógica, Media en el impacto real):** `TokensPage.tsx:113`, `tokens.service.ts:43-67`, `http/cursor.ts:15-18` y `oauth.service.ts:369-390`.

**Propuesta de corrección**

- **API:**
  - añadir a `GET /me/tokens` un filtro `status=active|revoked`;
  - devolver un motivo de revocación (`revoked_reason: user | rotated | reuse`) o, como mínimo, excluir de «Revocados» las filas revocadas por rotación (las que tienen un _refresh_ con `rotatedAt`);
  - devolver el total de revocados calculado en el servidor.
- **UI:** paginar con `next_cursor` («Cargar más») en activos y revocados.

**Criterios de aceptación**

- Con más de 50 filas, todos los tokens activos siguen visibles.
- «Revocados» no incluye las rotaciones automáticas, o las agrupa en una línea («ChatGPT · 23 renovaciones»).
- El número entre paréntesis coincide con el de la base de datos.

### TTD-AUD-36 — Los tokens caducados aparecen como «Activo»

- **Severidad:** Media
- **Pantalla/URL:** `/settings/tokens`
- **Elemento:** indicador de estado de la fila

**Resultado esperado:** un token caducado se marca como «Caducado» y no cuenta como activo.

**Resultado actual**

- El estado depende solo de `revoked_at` (`TokensPage.tsx:343-356`).
- `TokenDto` no incluye `expires_at` (`tokens.service.ts:280-291`), aunque la columna existe (`schema.prisma:784`) y la guarda ya rechaza los tokens caducados (`api/auth/api-auth.guard.ts:149-155`).
- Todo _access token_ OAuth caduca a la hora. Si el cliente deja de renovarlo (por ejemplo, porque se desconectó), la fila sigue saliendo como «Activo» para siempre.

**Causa en el código (confianza Alta):** `tokens.service.ts:280-291` y `TokensPage.tsx:345`.

**Propuesta de corrección:** exponer `expires_at` en `TokenDto` y mostrar «Caducado» (indicador neutro). Mantener «Revocar» en los caducados, porque pueden tener un _refresh_ vivo.

**Criterio de aceptación:** un _access token_ OAuth sin renovar se ve como «Caducado» a la hora de emitirse. Un token sin caducidad sigue «Activo».

### TTD-AUD-37 — Volver a autorizar una aplicación OAuth puede fallar por el nombre único del token

- **Severidad:** Alta
- **Pantalla/URL:** flujo OAuth (`/oauth/authorize` → `/oauth/consent` → `/oauth/token`)
- **Elemento:** emisión del _access token_

**Pasos para reproducir (no ejecutados; requieren un cliente real)**

1. Conectar ChatGPT.
2. Antes de que se revoque el _access token_ actual (o con uno caducado y sin revocar), volver a conectar ChatGPT desde la propia aplicación.

El mismo fallo debería darse si:

- existe un token manual llamado «ChatGPT»;
- o se conectan dos clientes que no declaran nombre y no redirigen a chatgpt.com, porque ambos reciben el nombre «OAuth».

**Resultado esperado:** la segunda autorización funciona.

**Resultado actual (deducido del código)**

- Hay un índice único parcial sobre `(owner_id, name)` para tokens no revocados. No tiene en cuenta la caducidad ni distingue los tokens OAuth (`prisma/migrations/20261018084502_personal_access_token_active_name/migration.sql:2-4`).
- `issueOauthAccess` intenta resolver el conflicto reintentando con «ChatGPT-1», «ChatGPT-2»… (`tokens.service.ts:180-217`). Lo hace **dentro de la misma transacción** que el canje del código (`oauth.service.ts:293-310` y `:430-436`).
- En PostgreSQL, después de un error de unicidad la transacción queda abortada, así que los reintentos no pueden funcionar. El usuario vería un error al conectar.
- El nombre lo pone el servidor cuando el cliente no lo declara: «ChatGPT» si la URL de vuelta es de chatgpt.com y «OAuth» en el resto de casos (`oauth.service.ts:659-665`).

**Causa en el código (confianza Media: la lógica es clara, pero no se ha reproducido):** el índice citado más `tokens.service.ts:180-217`.

**Propuesta de corrección**

- Excluir los tokens OAuth del índice único (`WHERE oauth_client_id IS NULL`). También valdría elegir el nombre libre antes del `INSERT` o usar un `SAVEPOINT` por intento.
- Al emitir un acceso nuevo para el mismo par usuario+cliente, revocar el anterior si ya ha caducado.

**Criterios de aceptación**

- Autorizar dos veces seguidas el mismo cliente funciona.
- Con un token manual llamado «ChatGPT», la conexión de ChatGPT funciona.
- Hay un test de integración que cubre ambos casos.

### TTD-AUD-38 — La actividad del token no se entiende y está incompleta

- **Severidad:** Media
- **Pantalla/URL:** `/settings/tokens` → «Actividad»
- **Elemento:** lista `.token-activity`

**Resultado actual**

- **Peticiones:** cada entrada se pinta como «Acceso · Petición · hora» (`TokensPage.tsx:432-444`). Se descarta lo que la API ya devuelve en `changes`: método, ruta y resultado (`allowed`, `scope_missing` o `rate_limited`) (`api/auth/token-audit.ts:12-34`). Un 403 por falta de permiso o un 429 parecen idénticos a un acceso correcto.
- **Ciclo de vida OAuth:** se guarda con `entity_type = 'oauth_token'` y acciones `created`, `updated` o `deleted` (`token-audit.ts:37-58`). `entityLabel` no conoce `oauth_token` (`TokensPage.tsx:626-636`), así que se ve «Eliminado · oauth_token» en lugar de «Token revocado» o «Reutilización detectada».
- **Paginación y estados:** sin paginación (se ignora `next_cursor`, `tokens.service.ts:269-276`), sin estado de carga y sin estado de error. Solo existe el caso «vacío» (`TokensPage.tsx:428-431`).
- **Efecto de las renovaciones:** en las aplicaciones OAuth, la actividad de una fila cubre como mucho una hora, porque el _access token_ cambia cada hora. La historia queda repartida entre filas revocadas.

**Causa en el código (confianza Alta):** las líneas citadas.

**Propuesta de corrección**

- **Solo frontend:**
  - pintar «MÉTODO ruta» y el resultado («Permitida», «Sin permiso», «Límite»);
  - traducir las entradas del ciclo de vida («Token emitido», «renovado», «revocado», «Reutilización detectada» en color de peligro);
  - añadir esqueleto, error con «Reintentar» y «Cargar más».
- **Con cambio de API:** para ver la actividad de una aplicación entera, añadir un filtro por cliente, p. ej. `GET /me/activity?client_id=`.

**Criterios de aceptación**

- Una petición rechazada por permisos se ve como «Sin permiso» con su ruta.
- Ninguna entrada muestra identificadores internos (`oauth_token`, `http_request`).
- La lista pagina.

### TTD-AUD-39 — Los errores al revocar no se ven y los de crear son genéricos

- **Severidad:** Media
- **Pantalla/URL:** `/settings/tokens`

**Resultado actual**

- **Al revocar:** el error de `revoke` guarda «No se ha podido guardar el token.» (`TokensPage.tsx:147-156`, `i18n/es.ts:155`). Ese mensaje solo se pinta dentro del formulario de creación (`TokensPage.tsx:323`). Con el formulario cerrado, que es lo normal al revocar, **no aparece nada**: la banda de confirmación sigue abierta y el botón vuelve a su estado normal.
- **Al crear:** el 409 `token_name_taken` (`tokens.service.ts:117-123`) se muestra con el mismo texto genérico (`TokensPage.tsx:143-145`), sin decir que el nombre ya existe.
- La confirmación cita `token.name` (`TokensPage.tsx:401`), mientras que el título de la fila usa `client_name ?? name` (`:351`). En las filas OAuth pueden no coincidir (por ejemplo, «ChatGPT-1»).

**Relación:** distinto de TTD-AUD-28. Aquí sí hay gestión del error, pero el mensaje se pinta donde no se ve.

**Propuesta de corrección**

- Mostrar el error dentro de la banda de confirmación (`role="alert"`) con «No se ha podido revocar. Inténtalo de nuevo.».
- Mapear el 409 a «Ya tienes un token activo con ese nombre» junto al campo y llevar el foco a él.

**Criterio de aceptación:** simulando un 500 al revocar, aparece el error en la propia fila. Un nombre repetido muestra el mensaje específico.

### TTD-AUD-40 — El secreto recién creado: el lector de pantalla lo lee en voz alta y se pierde sin aviso

- **Severidad:** Media
- **Pantalla/URL:** `/settings/tokens` → crear token
- **Elemento:** banda `.token-secret`

**Resultado actual**

- La banda tiene `role="status"` e incluye el propio secreto (`TokensPage.tsx:238-240`). Un lector de pantalla lo anuncia en voz alta automáticamente.
- La banda desaparece sin aviso si se pulsa «Actividad» en cualquier fila (`setSecret(null)` en `:381`) o si se revoca cualquier token (`:151`). El secreto se pierde y no se puede volver a ver.

**Causa en el código (confianza Alta):** las líneas citadas.

**Propuesta de corrección**

- Anunciar solo «Token creado. Se muestra una sola vez.» en una región `aria-live` separada.
- Poner el secreto en un campo de solo lectura.
- Que la banda solo se cierre con una acción explícita, confirmando si no se ha copiado.

**Criterio de aceptación**

- Con un lector de pantalla no se lee el secreto.
- Abrir la actividad o revocar otro token no borra la banda.

### TTD-AUD-41 — Permisos: «Gestionar» aparece como «Escritura», falta «Cuenta atrás» y los permisos sensibles no se marcan

- **Severidad:** Media
- **Pantalla/URL:** `/settings/tokens` (formulario y tabla de permisos de cada fila)

**Resultado actual**

- **«Gestionar» como «Escritura»:** `groupedScopes` trata `manage` igual que `write` (`TokensPage.tsx:536`). `webhooks:manage` y `automations:manage` se muestran como «Escritura» en la tabla, aunque en el formulario se llaman «Gestionar» (`:83-89`).
- **Falta «Cuenta atrás»:** el formulario no ofrece el grupo, aunque `countdowns:read` y `countdowns:write` existen (`api/auth/scopes.ts:21-22`). Un token para un agente que gestione cuentas atrás no se puede crear desde la UI.
- **Permisos sensibles sin marca:** `webhooks:manage`, `automations:manage` y `profile:write` no se distinguen visualmente.

**Causa en el código (confianza Alta):** `TokensPage.tsx:22-107` y `:522-561`.

**Propuesta de corrección**

- Añadir un nivel «Gestionar» en `groupedScopes`.
- Añadir el grupo «Cuenta atrás» (lectura y escritura).
- Marcar los permisos sensibles con ⚠ y un texto alternativo.
- Sacar `groupedScopes` a una utilidad compartida con la pantalla de consentimiento.

**Criterios de aceptación**

- `webhooks:manage` se lee como «Gestionar».
- Se puede crear un token con `countdowns:write`.
- Los tres permisos sensibles llevan la marca.
- Hay un test unitario del agrupado.

### TTD-AUD-42 — Consentimiento OAuth: permisos sensibles marcados por defecto, etiquetas en crudo y pantalla sin estilo

- **Severidad:** Alta
- **Pantalla/URL:** `/oauth/consent`

**Resultado actual**

- **Sensibles por defecto:** todos los permisos pedidos llegan ya marcados (`web/features/auth/ConsentPage.tsx:63-64`). Si el cliente no pide `scope`, el servidor le ofrece por defecto también `webhooks:manage` y `automations:manage` (`api/auth/scopes.ts:70-92`, `OAUTH_DEFAULT_SCOPES`). No hay ninguna advertencia de permiso sensible.
- **Etiquetas en crudo:** los permisos que no están en `SCOPE_LABEL` se muestran con su identificador (`ConsentPage.tsx:13-37` y `:121`). Por ejemplo `countdowns:write`, `tasks:create`, `ticky:proposals:write` o `notifications:self:write`.
- **Scopes internos anunciados:** el descubrimiento OAuth anuncia a cualquier cliente todos los `API_SCOPES`, incluidos los internos (`api/auth/oauth-discovery.controller.ts:66` y `:87`). Un cliente externo puede pedirlos y aparecen en el consentimiento.
- **Sin estilo de la app:** botones `<button>` nativos (`ConsentPage.tsx:126-142`), `main.today` y casillas sueltas (`:93-125`). La página va dentro del `AppShell` (`web/app.tsx:182`).
- **Sin estados:** no hay estado de carga, y «Permitir» y «Denegar» no se bloquean mientras se envía la decisión.
- **Idioma:** se toma de `navigator.language` (`ConsentPage.tsx:40`), no del idioma elegido por el usuario.

**Causa en el código (confianza Alta):** las líneas citadas.

**Propuesta de corrección**

- Desmarcar por defecto los permisos sensibles, o al menos marcarlos con ⚠.
- Quitar `webhooks:manage` y `automations:manage` de `OAUTH_DEFAULT_SCOPES`.
- Excluir `ticky:*` y `notifications:self:write` de `scopes_supported` y de lo que se puede conceder a clientes externos.
- Usar `Button` y la utilidad de permisos compartida; añadir estados de carga y de envío.
- Usar el idioma del usuario.
- Mantener intacto el techo de `grantApprovedScopes` (`api/auth/oauth-grants.ts:34-58`).

**Criterios de aceptación**

- Un cliente que no pide `scope` no recibe permisos sensibles sin que el usuario los marque a mano.
- Ningún permiso aparece con su identificador interno.
- La pantalla usa los componentes y tokens visuales de la app, en claro y oscuro.

### TTD-AUD-43 — Google: el aviso «Vuelve a conectar» lleva a una pantalla sin botón de reconexión, y «Desconectar» en Drive desconecta todo Google

- **Severidad:** Alta
- **Pantalla/URL:** `/settings/calendar` (tarjeta de calendarios de Google) → `/settings/integrations`

**Pasos para reproducir**

1. Tener Google conectado sin el permiso de Calendar.
2. En Calendario aparece «Vuelve a conectar Google desde Ajustes > Integraciones».
3. Seguir el enlace.

**Resultado esperado:** en Integraciones hay un botón «Reconectar Google».

**Resultado actual**

- Google cuenta como «conectado» si hay un _refresh token_ (`api/modules/integrations/integrations.controller.ts:212`).
- Con Google conectado, la pantalla solo ofrece «Desconectar» (`ProductPages.tsx:442-460`). No hay reconexión: hay que desconectar y volver a conectar.
- El enlace sale de `GoogleCalendarsCard.tsx:79-83`.
- «Desconectar» en la fila Drive llama a `disconnectGoogle` (`ProductPages.tsx:486-496`). Desconecta también Calendar, sin confirmación y sin decirlo.
- La nota `?google=connected` o `?google=error` no se limpia de la URL (`ProductPages.tsx:392` y `:420-425`). Al recargar, se vuelve a mostrar.

**Relación:** los fallos silenciosos de estas llamadas ya están en TTD-AUD-28. La falta de estado de carga y error, en TTD-AUD-31. Aquí se añade el flujo que no se puede completar.

**Propuesta de corrección**

- Mostrar «Reconectar» (que llame a `googleConnect`) cuando Google está conectado. Si es posible, mostrar el estado «Necesita atención» cuando falte el permiso de Calendar.
- Pedir confirmación en «Desconectar» indicando la consecuencia: «También se desconectará Drive y el calendario».
- Limpiar el parámetro de la URL después de mostrar la nota.

**Criterios de aceptación**

- Desde el aviso de Calendario se puede reconectar Google en dos clics.
- Desconectar desde Drive avisa de que afecta a todo Google.

### TTD-AUD-44 — Telegram y Correo a tarea: estados provisionales y una regeneración sin confirmación que invalida la dirección

- **Severidad:** Media
- **Pantalla/URL:** `/settings/integrations`

**Resultado actual**

- **Telegram:** mientras carga, la descripción dice «Próximamente» y aparece un botón «Próximamente» desactivado (`ProductPages.tsx:506` y `:539-543`). Después cambia a «Conectada». El botón «Próximamente» se muestra también cuando Telegram está configurado pero no vinculado: no hay forma de vincularlo desde aquí.
- **Correo a tarea:**
  - mientras carga, aparece el texto de «sin dirección» (`InboundEmailCard.tsx:34-36`);
  - si la consulta falla, la píldora dice «Estado: Parada» (`:24-28`);
  - «Regenerar» sustituye la dirección al momento (`api/auth/me.service.ts:283-289`) **sin pedir confirmación** (`InboundEmailCard.tsx:39-49`). Solo «Revocar» la pide (`:65-95`). La dirección antigua deja de crear tareas sin aviso.

**Corrección a la propuesta:** la propuesta dice que «Regenerar dirección mantiene confirmación inline». No es así hoy.

**Propuesta de corrección**

- No pintar ningún texto de estado hasta que la consulta haya respondido; usar un esqueleto mientras tanto.
- Ofrecer «Vincular» en Telegram cuando esté configurado.
- Pedir confirmación al regenerar con el texto de `inboundRevokeBody`.

**Criterios de aceptación**

- Al recargar, no se ve «Próximamente» ni «Parada» antes del estado real.
- Regenerar la dirección pide confirmación.

### TTD-AUD-45 — Webhooks y feeds de calendario: rotar el secreto sin confirmación y textos reutilizados

- **Severidad:** Baja
- **Pantalla/URL:** `/settings/webhooks` y `/settings/calendar`

**Resultado actual**

- **Rotar secreto:** «Rotar secreto» invalida el anterior sin confirmación (`MoreSettings.tsx:294-305`).
- **Banda compartida:** el secreto nuevo se muestra en la misma banda que el de creación, arriba del todo y lejos de la fila (`:214-234`).
- **Errores fuera de sitio:** el error de «Probar» se pinta en el formulario de creación (`:283-290`).
- **Sin estado de carga:** la lista no tiene estado de carga.
- **Etiqueta reutilizada:** en los feeds de calendario, el botón para copiar la URL dice «Copiar secreto» (`ProductPages.tsx:268`, reutiliza `webhookCopySecret`).

**Relación:** que pausar y rotar fallen en silencio ya está en TTD-AUD-28 (`MoreSettings.tsx:270` y `:300`).

**Propuesta de corrección**

- Confirmación inline al rotar el secreto.
- Mostrar el secreto y los errores en la fila afectada.
- Usar un texto propio, «Copiar URL», en los feeds.

**Criterio de aceptación:** rotar pide confirmación y el resultado aparece en la propia fila. El botón del feed dice «Copiar URL».

### TTD-AUD-46 — «Revocados» se muestra como una lista sin estilo y sin el nombre de la aplicación

- **Severidad:** Baja
- **Pantalla/URL:** `/settings/tokens` → «Revocados (N)»

**Resultado actual**

- `.token-revoked` no tiene ninguna regla CSS: es un `<details>` con viñetas nativas (`TokensPage.tsx:448-466`).
- Muestra `token.name`, no el cliente.
- No distingue «revocado por mí» de «renovado automáticamente» (ver TTD-AUD-35).

**Propuesta de corrección:** una tabla compacta con nombre, origen («Manual» u «OAuth · cliente») y fecha. Mostrar 10 filas y «Ver todos».

**Criterio de aceptación:** el bloque usa los estilos de lista de la app, en claro y oscuro.

### Valoración de la propuesta y de los bocetos

**Bocetos revisados** (datos de muestra; no son evidencias de producción):

- ![](evidencias/PROPUESTA_boceto-1_tokens-escritorio.jpg)
- ![](evidencias/PROPUESTA_boceto-2_estados-escritorio.jpg)
- ![](evidencias/PROPUESTA_boceto-3_movil.jpg)

**Adoptar tal cual (solo frontend)**

- Lista con separadores finos y filas que se despliegan, en lugar de tarjetas; indicador de estado como punto + texto. Encaja con las listas de tareas y con `tokens.css`: `--content-max` (46rem) y `--tap` (2,75rem) existen (`tokens.css:97` y `:99`), y los cortes a 639, 699, 800 y 900 px y el de 1024 px (`min-width`) también.
- Actividad con método, ruta y resultado, y entradas de ciclo de vida traducidas (TTD-AUD-38).
- Instrucciones por modo de conexión: _bearer_ para Cursor, OAuth para ChatGPT y Claude.
- Reglas del secreto: no meterlo en `role="status"` y avisar antes de cerrar la banda (TTD-AUD-40).
- Errores en la propia fila y mensaje específico para el 409 (TTD-AUD-39).
- Consentimiento con los componentes de la app (TTD-AUD-42).
- Grupo «Cuenta atrás» en el formulario y marca ⚠ en los permisos sensibles (TTD-AUD-41).

**Necesita trabajo de backend antes de poder pintarse**

| Dato del boceto                                | Situación hoy                                                                                     | Qué hace falta                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| «Último uso» por token                         | Existe (`last_used_at`, con precisión de 1 min, `api-auth.guard.ts:37` y `:263-277`)              | Nada                                                                                                     |
| «Último uso» y «Autorizada el…» por aplicación | No existe                                                                                         | Agregar por `oauthClientId` en `GET /me/oauth/grants` (nuevo)                                            |
| «1 token activo», «1 renovación vigente»       | No existe; además los caducados se cuentan como activos                                           | `expires_at` en el DTO y recuento de familias de _refresh_ en el servidor                                |
| «Caduca / Caducado el…»                        | La columna existe; crear no la acepta y el DTO no la devuelve                                     | `expires_in_days` en `POST /me/tokens` y `expires_at` en `TokenDto`                                      |
| Alias editable («nota de ejemplo»)             | No existe                                                                                         | Columna nueva y `PATCH /me/tokens/{id}`. **Valor dudoso:** el nombre ya es texto libre; se puede aplazar |
| «Origen no disponible» / «Otros accesos»       | No existe                                                                                         | **No recomendado** (ver riesgos)                                                                         |
| «Revocados (24)»                               | El recuento es solo de la página cargada y mezcla rotaciones                                      | Recuento y motivo en el servidor (TTD-AUD-35)                                                            |
| Actividad por token con «×12» y «Sin permiso»  | Los datos existen en `changes`                                                                    | Solo frontend. Por aplicación, filtro por cliente en la API                                              |
| «Revocar acceso» de una aplicación entera      | Revocar una fila ya corta su familia de _refresh_, pero no otras autorizaciones del mismo cliente | `POST /me/oauth/grants/{clientId}/revoke` (nuevo, en transacción, verificando el propietario)            |

**Riesgos y correcciones a la propuesta**

- **«Otros accesos» resuelve un caso que prácticamente no se da.**
  - Un `OauthClient` solo se borra al eliminar la cuenta de su dueño (`api/auth/account.service.ts:157`). Los clientes de registro dinámico (`ownerId` nulo) no se borran nunca.
  - Por tanto, el origen se puede derivar con seguridad de `oauthClientId`: con cliente, es OAuth; sin cliente, es manual.
  - Recomendación: no añadir la columna `origin` ni la sección «Otros accesos», y quitar la fila «token_heredado» del boceto.
- **«Aplicación sin nombre declarado» nunca se dará.** `OauthClient.name` es obligatorio y, si el cliente no envía `client_name`, el servidor pone «ChatGPT» u «OAuth» (`oauth.service.ts:659-665`). Sí conviene indicar que el nombre es declarado por la aplicación, como propone el documento.
- **Las renovaciones horarias cambian el modelo de las filas de aplicación.** Mostrar los «tokens vigentes» de una aplicación enseñará siempre uno que cambia cada hora, y su actividad durará como mucho una hora. La vista por aplicación debería agregar por cliente desde el principio, no por token «con selector».
- **Secreto mostrado una sola vez:** de acuerdo. Además, no debe perderse por acciones ajenas (TTD-AUD-40).
- **Confirmación al revocar:** se mantiene. El texto que cita la propuesta («dejará de funcionar en cuanto lo revoques») no es el actual, que es «deja de funcionar al momento» (`i18n/extra.ts:459`). La confirmación ya existe, pero su error no se ve (TTD-AUD-39).
- **Choque de nombres entre tokens:** «Revocar aplicación» y «volver a autorizar» dependen de que el nombre único no bloquee la emisión (TTD-AUD-37). Hay que arreglarlo antes de la nueva sección.
- **Bloque JSON de MCP en móvil:** la propuesta da por hecho que hay scroll horizontal (F6). El CSS usa `white-space: pre-wrap` (`components/ui.css:1721-1731`), así que el bloque debería partirse en líneas. **No confirmado:** pendiente de mirar en un móvil.
- **Claude:** está en el selector y reutiliza el texto de ayuda de OAuth. No se puede verificar en el código si funciona con Claude; no se abre un hallazgo.
- **Restricción por listas** (`listRestricted`, `listIds`): existe en el modelo, pero no en la UI. Es una mejora, no un fallo.

**Pendiente de comprobar en navegador (para Pablo)**

1. Número de filas en «Tokens y MCP» y si falta algún token manual antiguo (TTD-AUD-35).
2. Volver a autorizar ChatGPT cuando ya hay una conexión activa (TTD-AUD-37). Es una acción real sobre la cuenta.
3. El bloque JSON de MCP en un móvil de unos 360 px de ancho.
4. Parpadeo de Telegram y Correo a tarea al recargar Integraciones.
5. Pantalla de consentimiento en modo oscuro y en inglés.
6. Lector de pantalla con la banda del secreto.
7. Menú móvil: el enlace «Tokens y MCP» → `/tag/…` (TTD-AUD-33). El menú de Ajustes enlaza bien a `/settings/tokens` (`features/places/Places.tsx:1839-1866`). Probablemente sea una etiqueta del propio usuario con ese nombre; sigue sin confirmar.

---

## Ya corregido: formato de error OAuth (PR #59)

- **Qué pasaba:** al conectar el conector MCP, el endpoint OAuth devolvía `429` con un cuerpo `{"error":{"code":"rate_limited",...}}`, que no cumple RFC 6749, porque `error` debe ser una cadena.
- **Corrección:** está en el commit `47a4245a` (PR #59, 21/10/2026 10:09 hora de Madrid).
  - `api/http/api-exception.filter.ts:182-184` devuelve `{error, error_description}` en `/oauth/token`, `/oauth/register` y `/oauth/revoke` (`api/auth/oauth-error.ts:35-83`).
  - El 429 pasa a ser `temporarily_unavailable`.
  - OAuth tiene ahora su propio límite por IP: 60 peticiones cada 15 min (`api/auth/attempt-limiter.ts:13`).
- **Pregunta abierta:**
  - La IP del cliente se toma de `req.ip` con `TRUST_PROXY_HOPS=1` (`api/security/runtime-config.ts:33-40`).
  - Si delante del Caddy de borde hay otro proxy o CDN, todos los clientes podrían compartir un mismo límite por IP.
  - Además, el registro dinámico cuenta también los registros correctos: 5 cada 15 min (`api/auth/oauth.service.ts:88-89`).
  - Conviene comprobarlo en producción.
- **Comprobación del 21/10/2026 (hora de Madrid):**
  - Las respuestas de producción solo llevan `via: 1.1 Caddy`, sin cabeceras de una CDN como Cloudflare.
  - `deploy/production/todo.caddy` envía `/api/*` y `/oauth/*` directamente a `todo-api:3000`.
  - Con un único Caddy de borde, `TRUST_PROXY_HOPS=1` es correcto. El riesgo de que todos los clientes compartan un mismo límite por IP es bajo, salvo que haya un balanceador por delante que no se vea en las cabeceras.
  - Matiz: ChatGPT y otros clientes alojados salen desde IP compartidas de su proveedor. Con una sola cuenta no es un problema; con muchos usuarios, el límite de 60 cada 15 min por IP podría quedarse corto.
  - Detalle menor: cada petición rechazada por el límite de un token escribe también una fila de actividad (`api/auth/api-auth.guard.ts:111-123`).

---

## Alcance y limitaciones

- La app no tiene una página de notas independiente; las notas solo existen como tipo de tarea, así que no se auditaron por separado.
- La mayoría de las páginas de Ajustes se revisaron leyendo su texto, sin probar a fondo cada formulario.
- El diseño adaptable (responsive) se comprobó con zoom del navegador, no en dispositivos reales.
- Se crearon datos de prueba con el prefijo «TEST AUDIT» (tareas, una cuenta atrás y una lista) y se borraron al terminar.
- Las capturas pueden ir con unos segundos de retraso respecto a la acción descrita. Algunos estados (p. ej. TTD-AUD-04, duración) se marcan como no confirmados por ese motivo.
- La revisión de código se hizo en solo lectura sobre el commit `36f9209`. En el frontend, `vitest` (93 tests), `tsc` y `eslint` pasan sin errores. Los tests de la API no se pudieron ejecutar en el entorno de auditoría (Node 20 en lugar de ≥22).
- Las capturas de un mismo problema hechas en los dos recorridos se han unificado en un único hallazgo.
