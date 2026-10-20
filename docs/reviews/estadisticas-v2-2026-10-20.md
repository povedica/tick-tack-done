# Auditoría de Estadísticas v2 — 20 de octubre de 2026

> La auditoría inicial que sigue describe `main` antes de las correcciones. Su veredicto queda sustituido por el [cierre y las evidencias de la PR #54](cierre-estadisticas-v2-2026-10-20.md). Se conserva para trazabilidad.

## 1. Veredicto y evidencia

**Con bloqueantes; F0–F4 no pueden darse por cerradas.** Existe la estructura de la funcionalidad, pero fallan privacidad por scopes, métricas, filtros, navegación histórica y varios requisitos visuales obligatorios.

Fuente: `docs/spec/done/spec-estadisticas-tick-tack-done-v2-2026-10-20-2623ef3e.md`. Revisión de `main` y `origin/main`, ambos en `7774826b3bc463e6636cef63d920f43d169d9abf`, implementación `ae2e413`, PR #52. No se modificó implementación, no se hicieron commits, merges ni deploys. Los cambios documentales preexistentes del usuario se conservaron. RF utilizados por la implementación: RF-2321–2324; regresión relevante: RF-1204, RF-1303, RF-1602 y RF-2201–2204.

✅ significa comprobado por lectura de código o por las pruebas indicadas, **no certificación visual en navegador**. ⚠️ significa implementación parcial o aceptación todavía sin verificar. ❌ identifica incumplimiento comprobable. N/A identifica alcance excluido o aplazado expresamente.

### Verificación ejecutada

- `pnpm typecheck`: correcto en Node 26/Docker.
- Compilación de API + `pnpm --filter api openapi:generate`: correctas; `apps/api/openapi.json` sin diff.
- `pnpm lint`: falla. Error nuevo en `packages/domain/src/stats/aggregate.ts:446` (`prefer-optional-chain`); otros tres en Ticky preexistente.
- `pnpm test`: falla por dos tests web de `features/settings/feature-flags.spec.ts`; ese archivo no fue modificado por #52. Dominio: 233 tests correctos, cobertura global de líneas 84,23 %. SDK: 9 tests correctos. Web: 68 correctos, 2 fallidos. No certificar toda la suite API como verde: la ejecución recursiva termina al fallar web.
- `aggregate.ts`: **18,88 % de líneas**, 48 % de ramas, 21,73 % de funciones. `score.ts`: 90,69 % de líneas, 79,41 % de ramas, 75 % de funciones.
- Integración dirigida a `v1-v2.e2e-spec.ts` y `habits.e2e-spec.ts`: 12 correctos, 10 fallidos y un rechazo no manejado; la BD local carece de `tasks.version` (Prisma P2022). Resultado contaminado por esquema local desactualizado; no atribuirlo a esta PR ni certificar regresión. No se aplicaron migraciones.
- Reproducciones directas de funciones TS en el host Node 23: completitud KPI 100 % / serie 200 %; rango anterior ignorado; stock histórico omitido; hábito semanal 100 % en motor existente / 14,3 % en Estadísticas; redondeo de foco total 1 min / suma diaria 0.
- **No ejecutado:** QA visual en navegador, capturas de las cuatro pestañas, contraste medido, medición con datos reales de Pablo, apertura del CSV en hoja de cálculo ni presupuesto gzip. Las reproducciones directas no sustituyen una prueba HTTP autenticada.

## 2. Tabla de cumplimiento F0–F4

| Fase | Estado     | Resultado                                                                                                                                                                          |
| ---- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F0   | ⚠️ Parcial | Foco de narrativa/tarjeta comparte valor y dashboard usa hoy; hábitos divergen, semana de Reportes es UTC, tarjetas no profundizan y reportes antiguos conservan payload anterior. |
| F1   | ⚠️ Parcial | Rutas, seis KPI, gráficos y rejilla existen; rango histórico, filtros, completitud diaria, mejor momento y vencidas están incompletos o incorrectos.                               |
| F2   | ⚠️ Parcial | Tendencia, histograma, timeline y heatmap existen; rejilla anual solo recibe sesiones del rango, no hay selección de día y las distribuciones omiten tiempo.                       |
| F3   | ⚠️ Parcial | Puntuación única y 12 niveles; hábitos no reutiliza su motor, faltan antifraude, histórico y ajuste de ocultación.                                                                 |
| F4   | ⚠️ Parcial | CSV/JSON y tabla de tendencia; exportación puede descuadrar, faltan otras tablas y QA visual obligatorio.                                                                          |
| §10  | ⚠️ Parcial | Base de tokens/rejilla/Recharts correcta; estados, interacción, accesibilidad, formato y visualizaciones pendientes.                                                               |

### Matriz funcional, requisito por requisito

| Referencia / requisito                       | Estado | Evidencia o falta                                                                                                                                                                        |
| -------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §2.2.1 foco narrativa/tarjeta                | ✅     | `reports.controller.ts:163,173,207`: mismo `focusMinutes`. Solo reportes regenerados; los guardados no se migran.                                                                        |
| §2.2.2 tendencia explicada                   | ⚠️     | `trend_label` en nuevos payloads; histórico anterior cae al número sin comparación.                                                                                                      |
| §2.2.3 hábitos con contexto                  | ⚠️     | Tarjeta done/expected, pero frecuencia se interpreta mal; narrativa sigue usando hábitos de hoy del snapshot.                                                                            |
| §2.2.4 carga de Reportes                     | ✅     | `ProductPages.tsx:240,260`: carga separada del vacío.                                                                                                                                    |
| §2.2.5 tarjetas con profundización           | ❌     | `ProductPages.tsx:285`: CountCard y artículos sin enlaces; enlace general no cumple el drill-down.                                                                                       |
| §2.2.6–10 visuales generales                 | N/A    | Referenciados a auditoría general: pila/borde, botón, tendencia vacía, calendario, duplicación de creadas. Algunos rótulos mejoran, no se exige rediseño aquí.                           |
| §2.2.11 contradicción de Logros              | ✅     | `ProductPages.tsx:185–205`: estado y acción Activar/Desactivar diferenciados; enlace a Estadísticas.                                                                                     |
| §2.2.12 tendencia Jardín                     | N/A    | Auditoría general; esta PR además añade etiqueta comparativa.                                                                                                                            |
| §2.2.13 consistencia de foco                 | ⚠️     | Jardín calcula hoy con MetricsService; `/focus/stats` sigue acumulando todo el histórico sin etiqueta temporal explícita en la línea de Foco. Su rediseño visual queda fuera.            |
| §2.2.14–15 visuales Hábitos/móvil general    | N/A    | No exigir aquí rediseño de check-in, Reportes o Jardín. Componente compartido del heatmap sí se evalúa donde §10 lo exige.                                                               |
| §5 entrada temporal sidebar                  | ✅     | Sidebar/navigation incluye Estadísticas separada de Reportes.                                                                                                                            |
| §5 entrada móvil Más                         | ✅     | `shell/BottomBar.tsx` incluye la ruta.                                                                                                                                                   |
| §5 cuatro rutas y pestaña URL                | ✅     | `app.tsx:165–166`; `/statistics/:tab`.                                                                                                                                                   |
| §5 rango/filtros en URL y atrás              | ⚠️     | Parámetros presentes, pero rangos predefinidos ignoran from/to y cambios usan replace; atrás no deshace rango/filtro.                                                                    |
| §5 enlaces bidireccionales Reportes          | ✅     | Enlaces presentes en ambas pantallas.                                                                                                                                                    |
| §6.1 cinco rangos, lunes, máximo dos años    | ⚠️     | Opciones y lunes correctos; histórico roto; custom sin validación UX, API limita después de generar todos los días.                                                                      |
| §6.1 persistencia URL/localStorage           | ⚠️     | Solo se guarda la clave del rango; no fechas custom, filtros ni pestaña. URL inicial no se normaliza.                                                                                    |
| §6.1 filtros multiselección y chips          | ⚠️     | Entradas de IDs de lista/etiqueta, select único de prioridad; chips genéricos y eliminación por grupo. No selector de entidades ni multiselección completa.                              |
| §6.1 exportar y Reporte semanal              | ⚠️     | Enlace y descarga presentes; errores/totales de exportación pendientes.                                                                                                                  |
| §6.1 frase honesta                           | ✅     | API publica frase del rango y la web la muestra. Puede diferir del KPI Completadas porque distingue las planificadas, como requiere D2.                                                  |
| §6.2 KPI Completadas + variación             | ✅     | Conteo y delta frente a rango equivalente; excepción TZ de foco anterior no afecta al conteo de tareas.                                                                                  |
| §6.2 KPI completitud D2                      | ✅     | Solo dueDate en rango, completadas en rango; canceladas excluidas.                                                                                                                       |
| §6.2 KPI foco/pomodoros                      | ⚠️     | Presente; filtros y redondeo divergen entre representaciones.                                                                                                                            |
| §6.2 KPI hábitos                             | ❌     | Frecuencia semanal se descarta; porcentaje ponderado por días, no media simple por hábito.                                                                                               |
| §6.2 racha productiva actual/mejor año       | ⚠️     | Usa query.to como hoy: semana/mes/año incluyen futuro y pueden dar actual=0 aunque hoy lleve racha.                                                                                      |
| §6.2 KPI logro y detalle                     | ⚠️     | Nivel/progreso/desglose presentes; faltan umbral visible y fórmula completa.                                                                                                             |
| §6.2 KPI clicables conservan contexto        | ⚠️     | Cinco KPI navegan; logro usa botón de detalle a Tareas, donde no existe detalle de logro.                                                                                                |
| §6.2 tendencia día/semana según rango        | ⚠️     | Siempre buckets diarios, incluso año; no agrupación semanal.                                                                                                                             |
| §6.2 mejor momento                           | ❌     | API devuelve `best_moment` al nivel raíz; componente lo busca dentro de summary, muestra bandas a cero y ningún día.                                                                     |
| §6.3 tendencia Tareas                        | ⚠️     | Presente; agrupación anual pendiente.                                                                                                                                                    |
| §6.3 serie tasa por semana/mes               | ❌     | Serie diaria con numerador incorrecto; no agrupación semanal/mensual requerida.                                                                                                          |
| §6.3 distribuciones lista/etiqueta/prioridad | ⚠️     | Presentes; canceladas con completedAt aún cuentan, etiquetas duplican contribuciones y prioridades salen en inglés.                                                                      |
| §6.3 puntualidad media/mediana               | ⚠️     | Funciones presentes; all-day usa 24 h absolutos y vacío se presenta como 100 % tarde.                                                                                                    |
| §6.3 edad media/mediana                      | ✅     | Función pura y tarjeta con ambas métricas.                                                                                                                                               |
| §6.3 evolución vencidas                      | ❌     | Omite tareas ya completadas del histórico, cuenta antes de creación y UI solo muestra último bucket en lista.                                                                            |
| §6.3 precisión estimaciones                  | N/A    | D6 aplaza a F4+.                                                                                                                                                                         |
| §6.4 tendencia foco/pomodoros                | ⚠️     | Presente, con redondeos no reconciliados y sin agrupación por semana/mes.                                                                                                                |
| §6.4 timeline día seleccionado               | ❌     | Día fijado a query.to; sin selector/deep-link/popover; implementación HTML, no SVG.                                                                                                      |
| §6.4 mejor hora                              | ⚠️     | Histograma existe; usa rango activo, no mes explícito; gráfico no muestra tabla alternativa.                                                                                             |
| §6.4 heatmap anual/detalle                   | ❌     | Consulta solo rango activo antes de construir año; sin onSelect conectado.                                                                                                               |
| §6.4 distribución lista/etiqueta/tarea       | ⚠️     | Sin tarea solo aparece en by_task; by_list no suma todo el tiempo; etiquetas pueden contabilizar varias veces una sesión.                                                                |
| §6.4 calidad                                 | ✅     | Completadas/(completadas+abandonadas) e interrupciones por sesión presentes.                                                                                                             |
| §6.4 filtros cabecera/tipo sesión            | ❌     | Etiqueta ID contra nombre, prioridad ignorada; no control de tipo en web; helpers descartan descansos incluso si API los selecciona.                                                     |
| §6.5 tarjetas hábito/nombre/icono/color      | ✅     | Presentes, incluyendo heatmap compartido entre pestañas de Estadísticas.                                                                                                                 |
| §6.5 rachas/% equivalentes a hábitos         | ❌     | Motor duplicado sin frecuencia semanal ni anclaje de racha actual al presente.                                                                                                           |
| §6.5 línea global                            | ⚠️     | Gráfico existe, cálculo afectado por frecuencia.                                                                                                                                         |
| §6.5 ranking y día más flojo                 | ❌     | API calcula campos que UI no renderiza; día flojo ignora días sin logs y no limita al rango.                                                                                             |
| §6.5 filtros ignorados e indicación          | ✅     | Hábitos no aplica filtros; muestra aviso cuando están activos. Cabecera sigue mostrando los controles.                                                                                   |
| §7.1 owner/deleted/recurrentes               | ⚠️     | Filtros de propietario y borrado en tablas principales; cuenta ocurrencias existentes, sin expandir series. No filtra actor ni assignee; relaciones de foco no excluyen tareas borradas. |
| §7.1 zona horaria/fechas                     | ⚠️     | Fechas de tareas usan tz; foco anterior y Reportes usan límites UTC; all-day suma 24 h.                                                                                                  |
| §7.1 hábitos: reutilizar motor               | ❌     | No usa `habitStats` ni `readStoredHabit`; también introduce lógica distinta en MetricsService.                                                                                           |
| §7.2 seis endpoints                          | ✅     | overview/tasks/focus/habits/achievement/export presentes, registrados y en OpenAPI.                                                                                                      |
| §7.2 MetricsService compartido               | ⚠️     | Lo usan Reportes, dashboard y stats para foco; hábitos Estadísticas siguen otra implementación; snapshot/narrativa no usan el mismo cálculo semanal.                                     |
| §7.2 agregación servidor SQL                 | ⚠️     | Agregación en servidor, pero lee todas las tareas/logs y agrega en JS; no SQL date_trunc/buckets.                                                                                        |
| §7.2 caché bajo demanda/índices              | ⚠️     | Sin tabla precalculada, como D4; índice foco presente, no índice task owner/completedAt propuesto. Rendimiento no medido.                                                                |
| §7.2 OpenAPI/SDK                             | ⚠️     | Regeneración sin diff y rutas en schema; sin DTOs de respuesta (`content?: never`), cliente devuelve JsonObject; export no tiene método en resources.ts.                                 |
| §8 fórmula pública                           | ⚠️     | Pesos y desglose API, caso 66 puntos testeado; UI muestra subtotales sin todos los pesos/contadores ni regla clamp a cero.                                                               |
| §8 doce niveles/umbral/progreso              | ⚠️     | Doce niveles en dominio y progreso; umbral siguiente no visible en UI.                                                                                                                   |
| §8 antifraude acciones propias               | ❌     | loadTasks solo owner; no actor de completado ni exclusión de asignadas a otros para penalización.                                                                                        |
| §8 tiempo real/histórico diario              | ⚠️     | Recalcula por consulta, web cachea 5 minutos sin invalidaciones de mutaciones; no histórico diario/curva.                                                                                |
| §8 puntuación única Jardín                   | ✅     | `/me/achievements` delega a `StatsService.achievement`, igual que `/stats/achievement`.                                                                                                  |
| §8 desactivar en Ajustes                     | ⚠️     | Flag por defecto true y PATCH existentes; control solo en Jardín, no Ajustes; KPI sigue visible como Desactivado.                                                                        |
| §9 cálculo local sin terceros                | ✅     | Cálculo servidor y Recharts en bundle; sin telemetría nueva/CDN en este módulo.                                                                                                          |
| §9 multiusuario y actividad propia           | ⚠️     | ownerId presente; propiedad no prueba autoría de actividad en listas compartidas.                                                                                                        |
| §9 exportación local                         | ⚠️     | Descarga directa sin registro adicional explícito; payload se genera en servidor, no localmente en navegador como pide la spec.                                                          |
| §9 stats:read en endpoints/tokens/consent    | ✅     | Decorador en seis endpoints; API_SCOPES, tokens y consentimiento lo incluyen.                                                                                                            |
| §9 títulos requieren tasks:read              | ❌     | Foco y export JSON incluyen task_title/by_task.label con solo stats:read.                                                                                                                |

### Matriz visual §10

| Sección / requisito                           | Estado   | Evidencia o falta                                                                                                                                                               |
| --------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10.1 tokens de color/cambio tema y acento     | ✅       | chart-theme usa getComputedStyle y MutationObserver de data-theme/data-accent. Tokens --chart-1…8 en claro/oscuro.                                                              |
| 10.1 tipografía/espaciado sin valores nuevos  | ⚠️       | Base usa tokens; gráficos usan fontSize 10/11/12, radios y medidas literales sin tokenizar todos los valores.                                                                   |
| 10.2 ancho/12 columnas/KPI 3×2 y 2×3          | ✅       | CSS 1080px, 12 columnas, breakpoint 1024 y KPI responsive. Verificado en código, sin captura.                                                                                   |
| 10.2 sticky escritorio/móvil                  | ⚠️       | Cabecera sticky escritorio y estática móvil; tabs móvil tampoco son sticky.                                                                                                     |
| 10.3 cabecera desktop/móvil                   | ⚠️       | Flex-wrap general, sin organización móvil explícita por filas; segmented no tiene regla que garantice ajuste a 390px. Riesgo de desbordamiento, no medido.                      |
| 10.3 filtros/selector/acciones                | ⚠️       | Botón y menú export existen; formulario IDs reemplaza multiselección; chips no muestran nombres; sin spinner.                                                                   |
| 10.4 tabs URL/teclado/respaldo                | ⚠️       | role/tab aria-selected y navegación por click; sin patrón de flechas/roving focus ni respaldo localStorage.                                                                     |
| 10.5 tarjetas sólidas/KPI                     | ✅       | Fondo/borde sólido/radio/padding y jerarquía de tokens.                                                                                                                         |
| 10.5 variación/unidad/referencia              | ⚠️       | Flechas y color, pero variaciones en puntos se rotulan %, sin texto de período anterior; sparkline opcional ausente (no es gap).                                                |
| 10.5 logro/fórmula/medalla                    | ⚠️       | Award y details; no popover, umbral ni detalle funcional.                                                                                                                       |
| 10.6 comunes: ejes, fondo, fechas, tooltip    | ⚠️       | Base de tokens y ejes sin caja; tooltip genérico no incluye siempre numerador/denominador; ISO en timeline/heatmap.                                                             |
| 10.6 leyenda interactiva                      | ❌       | Trend tiene Legend sin handler de ocultación; foco multiserie no tiene leyenda.                                                                                                 |
| 10.6 animación <=300ms/reduced motion         | ❌       | CSS desactiva skeleton y barra propia; Recharts no recibe isAnimationActive condicionado ni duración requerida.                                                                 |
| 10.6 huecos sin interpolar ceros              | ⚠️       | Tasa tiene connectNulls=false; varios vacíos se materializan como ceros y no hay estados específicos por gráfico.                                                               |
| 10.6.1 tendencia protagonista/alto/adaptación | ⚠️       | Barras+línea y 260px; no buckets semanales para año ni 200px móvil.                                                                                                             |
| 10.6.2 tasa área/objetivo 80%/tooltip         | ⚠️       | Área success y eje 0–100; falta referencia 80 %, tooltip con fracción y métrica correcta.                                                                                       |
| 10.6.3–4 barras distribuciones/prioridad      | ⚠️       | Horizontales, top8+Otros, colores; etiquetas prioridad inglesas, sin unidad minutos, Otros no reservado siempre a chart-8.                                                      |
| 10.6.5 puntualidad                            | ⚠️       | Barra 100% y media/mediana; sin datos muestra falsamente Tarde 100%.                                                                                                            |
| 10.6.6 área apilada de vencidas               | ❌       | OverdueList muestra tres números del último punto; no área ni evolución.                                                                                                        |
| 10.6.7 foco min/pomodoros                     | ✅       | Barras y línea con dos ejes en código; limitaciones generales de leyenda/a11y ya anotadas.                                                                                      |
| 10.6.8 timeline SVG/hoy/detalle               | ❌       | HTML con posiciones absolutas; sin detalle ni regla hoy, corte de medianoche incorrecto.                                                                                        |
| 10.6.9 histograma/hora destacada              | ⚠️       | Etiqueta mejor hora y 24 valores; no aceptación visual medida.                                                                                                                  |
| 10.6.10 heatmap anual                         | ⚠️       | SVG lunes-domingo, 10/gap3/rx2, 5 niveles y leyenda; faltan meses, tooltip humano/unidades/pomodoros/cuartiles, detalle y scroll inicial reciente. Año incompleto por consulta. |
| 10.6.11 tarjetas hábitos                      | ⚠️       | Tarjeta, métricas y color; rachas incorrectas; hábito sin logs muestra Sin datos de heatmap en vez del año vacío.                                                               |
| 10.6.12 línea global hábitos                  | ✅       | Línea/área success 0–100 presente; exactitud del dato evaluada en F3.                                                                                                           |
| 10.6.13 edad texto/estimaciones               | ✅ / N/A | Edad media/mediana en tarjeta; precisión pomodoro aplazada por D6.                                                                                                              |
| 10.7 wireframes                               | ⚠️       | Estructura parcial; faltan visualizaciones y controles descritos. Capturas no ejecutadas.                                                                                       |
| 10.8 es-ES/números/duraciones/plurales        | ⚠️       | Duraciones humanas; usa String para decimales/miles, prioridades inglesas, ISO y plurales concatenados. Solo navegación/scope nuevo pasan por i18n.                             |
| 10.9 carga con silueta                        | ⚠️       | Skeleton genérico para todas las pestañas; no silueta de cada bloque.                                                                                                           |
| 10.9 vacío inicial/filtrado con acción        | ❌       | No distinción sistemática ni enlaces accionables por bloque; puntualidad inventa 100% tarde.                                                                                    |
| 10.9 error/reintento por bloque               | ⚠️       | Reintento por query de pestaña; un error elimina todos los bloques de esa pestaña.                                                                                              |
| 10.9 generación export                        | ⚠️       | Texto Generando, sin spinner ni tratamiento de error visible.                                                                                                                   |
| 10.10 rangos/paseo histórico/atrás            | ❌       | Rangos predefinidos ignoran fechas URL, replace elimina historial de cambios.                                                                                                   |
| 10.10 filtros persistentes/ignorar hábitos    | ⚠️       | URL y aviso presentes; localStorage no persiste filtros.                                                                                                                        |
| 10.10 KPI a detalle                           | ⚠️       | Mayoría navegan; logro dirige a Tareas sin detalle propio.                                                                                                                      |
| 10.10 hover/tap/targets/scroll-snap           | ⚠️       | Tooltip de Recharts; controles rango 32px/tabs 36–40px bajo 44px; scroll-snap declarado sin puntos por semana; sin detalle táctil heatmap.                                      |
| 10.10 día seleccionado/URL/popover/Esc        | ❌       | No existe estado seleccionado ni popover de sesión/día.                                                                                                                         |
| 10.10 teclado/focus                           | ⚠️       | Botones tabulables; faltan flechas tabs/segmented, heatmap enfocables y popovers.                                                                                               |
| 10.11 tablas alternativas todos los gráficos  | ❌       | DataTable solo en TrendChart; falta tasa, foco, histograma, hábitos, heatmap y timeline.                                                                                        |
| 10.11 role img/resumen/tooltip no único dato  | ⚠️       | Role/label genéricos, sin resumen estadístico; heatmap/timeline dependen de title.                                                                                              |
| 10.11 contraste AA y no solo color            | ⚠️       | Borde de nivel0, flechas y formas presentes; contraste no medido, sin QA claro/oscuro.                                                                                          |
| 10.11 reduced motion                          | ❌       | Animaciones SVG de Recharts no se desactivan desde CSS reducido existente.                                                                                                      |
| 10.12 servidor <500ms y datos reales          | ⚠️       | No medido; múltiples lecturas históricas y bucles O(días×tareas/logs).                                                                                                          |
| 10.12 TanStack staleTime/placeholder          | ⚠️       | 5 min y keepPreviousData; sin atenuación de datos anteriores durante fetch.                                                                                                     |
| 10.12 prefetch pestañas                       | ✅       | Prefetch de tasks/focus/habits por rango/filtros. También hay consultas adicionales fuera de Resumen.                                                                           |
| 10.12 heatmap sin virtualización              | ✅       | SVG de un año, sin virtualización.                                                                                                                                              |
| 10.12 lazy/bundle ~60KB                       | ⚠️       | Charts cargan lazy; presupuesto gzip no medido.                                                                                                                                 |
| 10.13 Recharts3 + SVG propio                  | ⚠️       | Recharts3 y heatmap SVG; timeline HTML.                                                                                                                                         |
| 10.13 reutilizar componente hábitos existente | ⚠️       | YearHeatmap compartido entre pestañas; `/habits` existente sigue usando su heatmap anterior. Su rediseño general está fuera, la unificación explícita no está completada.       |
| 10.14 oscuro/acento/densidad                  | ⚠️       | Reacción a tema/acento presente; sin reglas de densidad de tarjetas/filas de Estadísticas ni contraste medido.                                                                  |
| 10.15 QA visual obligatorio                   | ⚠️       | No verificable en esta revisión sin ejecutar la matriz visual; no certificada.                                                                                                  |

### Decisiones D1–D10

| Decisión                           | Estado | Resultado                                                                                        |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| D1 entradas separadas              | ✅     | Reportes y Estadísticas separados.                                                               |
| D2 solo tareas con fecha           | ⚠️     | KPI cumple; serie diaria incumple.                                                               |
| D3 stats:read                      | ✅     | Registrado/aplicado; privacidad de títulos incumple §9.                                          |
| D4 sin stats_daily inicial         | ✅     | Bajo demanda, sin tabla nueva. No hay datos de latencia para activar la condición de precálculo. |
| D5 visible y ocultable en Ajustes  | ⚠️     | Default true, desactivable en Jardín; no ocultación desde Ajustes.                               |
| D6 estimaciones después            | N/A    | No bloquea F0–F4.                                                                                |
| D7 Recharts3/SVG                   | ⚠️     | Heatmap sí; timeline no SVG.                                                                     |
| D8 sidebar temporal                | ✅     | Implementado, menú de cuenta no exigible mientras no exista.                                     |
| D9 ocho tonos/prioridades          | ⚠️     | Tokens y prioridad correctos en código; Otros/Sin tarea no reservan sistemáticamente chart-8.    |
| D10 una puntuación/Jardín enlazado | ✅     | Mismo StatsService y enlace corregido.                                                           |

## 3. Bloqueantes reproducibles

Las rutas de archivo de esta sección son relativas a la raíz del repositorio. Los pasos HTTP/navegador son reproducciones propuestas a partir del código; solo los casos marcados como ejecutados se probaron con funciones reales.

1. **P1 — títulos sin tasks:read.** `apps/api/src/modules/stats/stats.controller.ts:79` protege foco solo con stats:read; `stats.service.ts:279,306` devuelve título. Con PAT que tenga únicamente stats:read y una sesión vinculada a tarea, solicitar `/api/v1/stats/focus?from=2026-10-19&to=2026-10-25&tz=Europe%2FMadrid`: by_task.label y timeline.task_title revelan contenido. `/stats/export?format=json` hereda la fuga. Falta comprobación/redacción condicionada a tasks:read.

2. **P1 — frecuencia de hábitos incompatible.** `stats.service.ts:591` y `metrics.service.ts:88` descartan strings; el modelo real usa monday…sunday. Crear hábito solo lunes y un check-in de lunes: semana 19–25 da 1/7=14,3 % frente a 1/1=100 % del motor existente. Reproducción de funciones ejecutada. Las metas por semana también pierden period/timesPerPeriod. Afecta F0/F1/F3.

3. **P1 — navegación histórica no funciona.** `apps/web/src/features/statistics/range.ts:44` calcula siempre período actual; `StatisticsPage.tsx:135` solo cambia from/to. Abrir `?range=week&from=2026-10-12&to=2026-10-18` el 20 de octubre: resuelve 19–25. Reproducción ejecutada. Mes/año igual. Además replace:true impide volver al rango/filtro anterior.

4. **P1 — tasa diaria puede superar 100 %.** `stats.service.ts:131` y su equivalente en tasks usan completed total/planned; `aggregate.ts:219` incluye completadas sin dueDate. Día con una planificada completada y otra sin fecha completada: KPI 1/1=100 %, serie 2/1=200 %. Reproducción ejecutada. No reutiliza el numerador de completionRate.

5. **P1 — filtros de Foco incorrectos.** `stats.service.ts:565` compara IDs de etiqueta con nombres; prioridad nunca se usa en loadFocus. Una tarea con etiqueta UUID X y nombre trabajo produce resultados en Tareas con tag=X y cero foco en Foco. Cambiar prioridad tampoco cambia las sesiones.

6. **P1 — heatmap anual parcial.** `stats.service.ts:225,326`: primero carga únicamente from–to y después construye el año. Tener sesiones en enero y octubre; elegir semana de octubre: enero aparece vacío en la rejilla anual. El tooltip/click tampoco permite abrir las sesiones del día (`YearHeatmap` recibe onSelect opcional pero ningún consumidor lo conecta).

7. **P1 — atribución de logros incorrecta.** `stats.service.ts:430` penaliza toda tarea activa vencida propia, aunque esté asignada a otra persona; loadTasks no selecciona assignee ni actor de completado. Crear tarea propia vencida asignada a colaborador: baja 5 puntos contra §8. Tampoco puede excluir completadas por otro por autoría.

## 4. Otros gaps priorizados

No se ha demostrado ningún P0. Los P1 anteriores bloquean el cierre; además:

- **P1, stock histórico:** `aggregate.ts:353` omite tareas que hoy están completed aunque estuvieran vencidas en la fecha histórica. Caso ejecutado: vence el 17, se completa el 20, consulta del 19 devuelve cero. Tampoco excluye puntos anteriores a createdAt. UI `StatisticsPage.tsx:852` reduce toda la serie al último punto.
- **P1, redondeo/exportación:** `focusMinutesTotal` redondea la suma; buckets redondean cada día; heatmap/distribuciones cada sesión. Dos días con 29 segundos cada uno: total 1 min, CSV 0+0, heatmap 0+0. Caso ejecutado. El CSV contiene solo date/completed/created/focus_minutes/pomodoros: no tasa, hábitos, ni totales de todas las métricas.
- **P1, rachas:** `stats.service.ts:695` inicia racha habitual en el último log, aunque se haya roto meses atrás; no usa días esperados. La productiva usa fin de rango futuro. Difiere de `habitStats` existente.
- **P1, falsos vacíos:** `StatisticsPage.tsx:563–565` transforma puntualidad null en A tiempo 0 % / Tarde 100 %. Un rango sin completadas fechadas inventa retrasos.
- **P1, mejor momento:** `stats.service.ts:130` publica best_moment fuera de summary, pero `StatisticsPage.tsx:867` lo busca dentro; bandas a cero y días ausentes con cualquier dataset.
- **P1, pruebas ausentes:** sin tests específicos de StatsService, MetricsService, endpoints stats, privacidad del scope o interacción de StatisticsPage. Cobertura nueva 18,88 % deja sin asegurar gran parte de F0–F4.
- **P2, funcionalidad visible:** no ranking de hábitos/día flojo, no filtro propio tipo sesión, no detalle de día, no histórico/curva de logro ni siguiente umbral visible. Fórmula UI incompleta. El detalle de logro abre Tareas.
- **P2, accesibilidad:** faltan tablas alternativas salvo tendencia, patrón de flechas, controles heatmap por teclado, datos accesibles sin tooltip y control de animación Recharts. Targets de 32/36/40px no cumplen 44px.
- **P2, visual/estados:** no área de vencidas, objetivo de tasa 80 %, meses/tooltip humano/cuarteriles del heatmap, leyendas con toggle, tabs sticky móvil ni estado vacío por causa. Hay ISO, high/medium/low/none, decimales con punto, unidades/plurales concatenados y tamaños literales. No se exige rediseño externo de Reportes/Jardín/check-in.
- **P2, ingeniería:** error de lint nuevo; OpenAPI sin esquemas de respuesta; exportación no expuesta en SDK resources. Las reglas puras habitStreaks/weakestWeekday viven en el service, duplicando dominio. Ninguna migración nueva en esta PR.

## 5. Riesgos

- **TZ:** semana de Reportes parte de lunes 00:00 UTC (`reports.controller.ts:317`), frente a lunes Madrid en Estadísticas. Una sesión de lunes 00:30 Madrid puede caer en semanas distintas. previousRange usa UTC para foco anterior; all-day suma 24 h absolutos, no día civil en cambios DST. Timeline usa zona del navegador, no parámetro tz explícito; sesiones que cruzan medianoche generan anchos incorrectos.
- **Divergencia:** hábitos tiene tres rutas de cálculo (motor existente, StatsService y MetricsService); narrativa usa snapshot de hoy, tarjeta usa semana. Foco mantiene distintos límites y redondeos. Reportes almacenados conservan payloads antiguos.
- **Rendimiento:** loadTasks lee todo el histórico para cada llamada, overview repite lectura para anterior y achievement; hábitos lee todos los logs; buildDayBuckets recorre filas por día. Prefetch y overview activo en todas las pestañas multiplican trabajo. Sin medición no certificar <500ms/<1s ni concluir que hace falta stats_daily. El límite de dos años se comprueba después de construir el array de días.
- **Scopes:** además de títulos, no basta ownerId para atribuir acciones en listas compartidas. No se auditó aquí la implementación completa de límites listIds de PAT ni toda la superficie de autorización del repositorio.
- **Consistencia temporal:** export recalcula cuatro endpoints secuencialmente, sin snapshot transaccional; actividad concurrente puede producir datos de instantes distintos. Caché web de 5 minutos sin invalidación tras acciones puede mostrar puntuación/métricas obsoletas.

## 6. Checklist manual recomendada

- [ ] Cuatro pestañas a 1280×800 y 390×844; claro/oscuro; datos reales y rango vacío (32 combinaciones). Capturar y revisar overflow, rejilla, unidades y tarjetas sin contenido.
- [ ] Semana lunes–domingo; anterior/siguiente en Hoy/Semana/Mes/Año; custom <=2 años; recarga, URL compartida, atrás/adelante y recuperación localStorage.
- [ ] Conteo manual D2: con fecha/sin fecha/cancelada/completada fuera de rango; comparar KPI, serie, tabla, CSV y JSON.
- [ ] Listas/etiquetas múltiples/prioridad; revisar todas las métricas de Resumen/Tareas/Foco y aviso de Hábitos. Caso sin coincidencias y Quitar filtros.
- [ ] Foco tres días con segundos no divisibles por 60, días fuera de semana pero dentro de año, sin tarea, múltiples etiquetas, descansos, abandono y cruce de medianoche; comprobar suma/100% y selección de día.
- [ ] Comparar Reportes regenerados/Jardín/Estadísticas con misma semana y día; lunes 00:30 Madrid y cambio DST de octubre.
- [ ] Hábito diario, solo lunes, objetivo semanal y racha rota; contrastar `/habits/:id/stats`, nuevos endpoints y check-in sin regresiones.
- [ ] Logro caso de 66 puntos del test; mismos datos en ambos endpoints; doce umbrales, máximo nivel, clamp a cero, desactivar/ocultar y tareas compartidas completadas/asignadas a otros.
- [ ] PAT solo stats:read: agregados accesibles, títulos ausentes; añadir tasks:read y comprobar detalle; otro owner y registros borrados no aparecen.
- [ ] Abrir CSV en hoja de cálculo y conciliar totales con UI/JSON. Error de descarga visible y estado Generando.
- [ ] Teclado completo, flechas de tabs/rango, foco visible, Esc, lector de pantalla, tablas alternativas y reduced-motion activado.
- [ ] Medir latencia/bundle gzip; simular carga lenta/error por bloque; verificar placeholder atenuado y caché/invalidación.
- [ ] Repetir integración con BD de pruebas al día; verificar timer Foco y check-in Hábitos en navegador antes de certificar RF-2201–2204/RF-1204/RF-1303.
