# Revisión semanal y reportes — ampliación de la PR #57

Alcance recibido el 20 de octubre de 2026: `ttd-revision-semanal-y-reportes-v1-7e9300c7.md`. RF-2201–2204 y RF-2302; regresión de RF-604. La petición actual prevalece sobre la redacción original de RF-2201: balance neutro sin juicios. Continúa en `codex/ui-ux-v2-close-findings`, según autorización expresa del usuario.

## Investigación en solo lectura

Consultas de agregados en la base local de Pablo, sin actualizaciones ni regeneración de su informe:

| Dato                                  | Informe guardado, semana 19 octubre | Consulta de semana local |
| ------------------------------------- | ----------------------------------- | ------------------------ |
| Completadas                           | 211                                 | 1                        |
| Creadas                               | 303                                 | 0                        |
| Suma de completadas diarias guardadas | 1                                   | 1                        |
| Foco                                  | 0,2 minutos                         | Una sesión, 12 segundos  |
| Hábitos esperados                     | 0                                   | Cero hábitos activos     |

Causa comprobada en código y datos locales: `compose()` copiaba `snapshot.completed/created` de `dashboardSnapshot()`, que mide los siete días móviles anteriores. El detalle consultaba lunes–domingo. No son la misma ventana. Además `bucketWeek()` agrupaba por UTC aunque la consulta empezaba en medianoche local, lo que desplazaba sucesos próximos a medianoche. El histórico guardaba ese payload; GET mantenía tareas pero recalculaba hábitos/foco al abrirlo, por lo que el informe no era una instantánea coherente. No se ha accedido ni modificado la base de producción; esta reproducción corresponde a la copia local disponible.

Arreglo implementado: totales obtenidos de los mismos siete buckets locales, con corte explícito `calculated_at`; se excluyen sucesos posteriores al corte. Payload versión 2 con zona horaria. GET devuelve exactamente lo guardado. Los reportes antiguos muestran totales de su detalle diario y explican la cobertura heredada, sin presentar 211 como cifra principal ni sobrescribir datos. No se migran silenciosamente históricos.

Foco sin sesiones se representa como `null`; el registro real de 12 segundos conserva 0,2 min. Hábitos sin expectativas verificables se muestran como «Sin datos». Se omite la comparación: el dato anterior de siete días móviles no permite comparar el mismo corte horario. No se inventa una tendencia ni una métrica nueva.

## Capacidades contrastadas y composición

- Revisión mantiene Bandeja, Vencidas, Sin fecha y preparación de semana con enlaces a la vista existente de próximos 7 días, listas estancadas y hábitos en riesgo. Un paso visible cada vez, finalización siempre disponible.
- Se exponen `recurring`, lista y fecha en el endpoint de lectura. Recurrentes y tareas sin señal verificable no pueden seleccionarse: no se presupone que los endpoints de mutación actúen sobre una ocurrencia. No hay borrado ni selector «Después».
- Casillas solo seleccionan. Barra común con iconos de línea: Listo, Hoy, Mañana y No haré. Completar y No haré piden confirmación con el número exacto; no se afirma que exista deshacer. Resultado y fallo parcial visibles; solo se retiran de selección los éxitos.
- No se añade selección por rango o todo: no es necesaria para el flujo y evita extrapolar patrones no comprobados.
- La barra móvil respeta zona segura y navegación inferior. Filas con elipsis, lista visible y fecha con texto de atraso. Foco de teclado visible.
- Reportes separa Completadas, Hábitos y Foco; «Vencidas ahora» proviene de la API actual y solo se consulta/muestra en semana actual, fuera del balance. Los históricos no muestran stock actual.
- Selector de semanas con flechas, estado en curso/cerrada, días futuros con raya, fecha de cálculo absoluta cuando existe, actualización explícita de la semana actual y enlace a Estadísticas.
- Si un histórico no contiene detalle diario verificable, no se expone un total dudoso. Si falta la fecha de cálculo, se indica; no se inventa.
- Textos en español e inglés; colores y espaciado usan tokens existentes. Sin cambios de puntuación o chip del Jardín, migraciones ni eventos nuevos.

## Validación

- `pnpm lint`, `pnpm typecheck` y `pnpm test`: comprobación completa en Node 26. Para tipos se corrigió un `undefined` opcional preexistente en GardenMap a `null`; ese archivo pertenece a los cambios previos del Jardín y se mantiene fuera de estos commits.
- 104 pruebas de integración: incluye tres regresiones nuevas para sumas, ausencia de foco, histórico inmutable y recurrentes en revisión. Usuarios de prueba aislados, eliminados al terminar.
- 8 pruebas Playwright, 1280 y 390 px: coherencia frente al payload 211/303, días futuros, protección de recurrentes, selección sin mutación, cancelación de confirmación, acción solo sobre seleccionadas, barra visible por encima de navegación móvil y ausencia de desbordamiento; estados vacío, cargando y error de ambas pantallas.
- Unitarias de buckets: medianoche local, cambio horario y exclusión de completado futuro.
- OpenAPI regenerado tras compilar API; descripciones de reportes y revisión actualizadas. El diff previo del Jardín se conserva separado.

## Capturas con datos sintéticos

| Pantalla          | Escritorio                                                   | Móvil                                                       |
| ----------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Reportes          | [Captura](assets/weekly-2026-10-20/reports-1280.png)         | [Captura](assets/weekly-2026-10-20/reports-390.png)         |
| Revisión          | [Captura](assets/weekly-2026-10-20/review-1280.png)          | [Captura](assets/weekly-2026-10-20/review-390.png)          |
| Reportes vacío    | [Captura](assets/weekly-2026-10-20/reports-empty-1280.png)   | [Captura](assets/weekly-2026-10-20/reports-empty-390.png)   |
| Revisión vacío    | [Captura](assets/weekly-2026-10-20/review-empty-1280.png)    | [Captura](assets/weekly-2026-10-20/review-empty-390.png)    |
| Reportes cargando | [Captura](assets/weekly-2026-10-20/reports-loading-1280.png) | [Captura](assets/weekly-2026-10-20/reports-loading-390.png) |
| Revisión cargando | [Captura](assets/weekly-2026-10-20/review-loading-1280.png)  | [Captura](assets/weekly-2026-10-20/review-loading-390.png)  |
| Reportes error    | [Captura](assets/weekly-2026-10-20/reports-error-1280.png)   | [Captura](assets/weekly-2026-10-20/reports-error-390.png)   |
| Revisión error    | [Captura](assets/weekly-2026-10-20/review-error-1280.png)    | [Captura](assets/weekly-2026-10-20/review-error-390.png)    |

Gráfico y pie de Reportes: [escritorio](assets/weekly-2026-10-20/reports-detail-1280.png), [móvil](assets/weekly-2026-10-20/reports-detail-390.png).
