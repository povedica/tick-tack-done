# Calendarios: revisión tras la auditoría del 21/10/2026

RF-1101–1105, RF-1902/1903 y bloque 4 del documento de alcance del 20/10 (ahora en `docs/spec/done/`). La revisión anterior certificaba composición con pruebas insuficientes; queda sustituida por esta revisión y su evidencia sintética.

## Resultado de la corrección

Toolbar móvil deliberadamente en dos filas, Hoy y selector legibles hasta 320 px. Mini-calendario visible con fecha completa, selección, flechas de teclado y salto directo; Popover existente para Escape, clic exterior, foco y límites del viewport. Opciones sin otra capa anidada. Año conserva el mes en URL al abrirlo. Navegación temporal con historial.

Agenda y detalle del día comparten composición compacta; el panel móvil ocupa su ancho y mantiene Cerrar visible mientras desplaza solo la lista; eliminadas las definiciones globales conflictivas de `ui.css`. Fecha sin número duplicado, horas/rangos sin salto, títulos íntegros y marcas por tipo real. Los eventos que atraviesan días aparecen en cada día visible y el panel inferior utiliza el día seleccionado. La ayuda de integraciones vive en Opciones. La Agenda conserva su ventana de 60 días y avance de 30, ahora explícitos.

Rejilla de 24 horas con posición de entrada útil y estable al recibir datos, cabecera y franja persistentes, eje horario fijo al desplazar horizontalmente. Las marcas de todo-el-día y de solapamientos dejan más anchura al título. Varias semanas tiene selector 2–6 y filas compactas. Mes mide alturas reales de chips y barras (sin offsets de 28 px), muestra +n exacto ante desborde y abre el detalle completo. En móvil conserva puntos y acceso al día. Cabeceras sin cápsulas, fechas con nombre completo y cantidad, hoy anunciado, Año móvil con una columna más legible y Trimestre con altura natural.

R02 confirmado: el endpoint calendario incluye tareas con solo inicio, mientras la consulta por vencimiento las excluía. Se recupera su detalle por API existente y se sitúan en el inicio, sin alterar modelo/API. La invalidación compartida de tareas incluye las consultas de eventos y solo inicio para conservar el refresco al completar/editar. Los rangos de tareas con vencimiento siguen representados por su vencimiento; no se introduce una nueva duración semántica de tarea. R03 corregido en URL. R04 conserva el solape explícito. R07 no produce conjunto vacío: tres días naturales siempre contienen al menos un laborable; el título usa los días visibles.

## Evidencia y validación final

`rtk proxy pnpm lint`, `rtk proxy pnpm typecheck` y `rtk proxy pnpm test` completos correctos en Node 26. Web: 89 unitarias; API: 69. Dominio conserva cobertura superior al 80 %. La primera ejecución simultánea tuvo un timeout de HealthController; la suite completa pasó al repetir y volvió a pasar en la comprobación final. OpenAPI regenerado sin diff; no se modifica SDK. No se repite integración porque no cambia API, persistencia ni eventos de dominio.

Playwright: 25 pruebas entre `calendar-v2.spec.ts` y `calendar-google.spec.ts`. Incluyen 48 combinaciones (ocho vistas × 1440/390/320 × claro/oscuro), tablet 768, móvil 360 y zoom CSS 200 % en las ocho vistas. Pruebas funcionales de navegación, mini-calendario y flechas, Escape/foco/clic exterior, Año→Mes con recarga y URL, rango de semanas persistente, siete columnas y eje fijo tras scroll horizontal, carga/error y respuesta tardía, completado/ocultación solo sintéticos, tareas con solo inicio, cumpleaños-tarea, 0/1/3/10/30 elementos y diez barras multilínea con cuenta exacta y detalle completo. Eventos de distintos colores; medianoche, cruce de día y fin exclusivo. Unitarias de ISO/semanas/cambio de trimestre-año y zonas Europe/Madrid/America/New_York durante DST.

[Índice de capturas sintéticas](assets/calendar-remediation-2026-10-21/README.md). Las anteriores se conservan en `assets/calendar-2026-10-21/` como antes sintético. Revisadas visualmente las ocho vistas a 1440 y 390 en ambos temas: composición, jerarquía, alineación, densidad, títulos y scroll. Los controles y fechas también se contrastaron con el árbol de accesibilidad del navegador. Las capturas de 320/360, tablet y zoom amplían la evidencia; no sustituyen una revisión con dispositivos físicos.

| Hallazgo | Resultado comprobado                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| C01      | Toolbar móvil en dos filas; Hoy, vista y periodo reconocibles a 320/390.                                                        |
| C02      | Cascada de Agenda consolidada; fecha compacta y filas sin tarjeta, también en detalle.                                          |
| C03      | Entrada cerca de ahora o a las 08:00; acceso a 00:00 conservado; scroll no depende de los datos recibidos.                      |
| C04      | Selector de 2–6 semanas, filas compactas, rango y URL coherentes al navegar/recargar.                                           |
| C05      | Siete fechas y eje fijo al desplazar; pista de deslizamiento.                                                                   |
| C06      | Marca integrada y más anchura útil; títulos completos; columnas horarias con solapamiento ensanchadas solo cuando lo necesitan. |
| C07      | Selección, Escape, clic exterior, foco y teclado comprobados; fuentes sin submenú.                                              |
| C08      | Mini-calendario visible al abrir periodo; selección con teclado, entrada directa y URL.                                         |
| C09      | Cabeceras simples; barras con alturas medidas, sin offsets fijos.                                                               |
| C10      | Fecha completa, cantidad con unidad y hoy en nombres accesibles; foco visible y fechas de Año más amplias.                      |
| C11      | Español sin Title Case; configuración externa disponible en Opciones.                                                           |
| C12      | Año/Trimestre conservan meses y alineación; mayor área por fecha, altura natural.                                               |

## Riesgos contrastados y límites

R01 reproducido y cubierto con densidad y barras multilínea. R02 corregido para solo inicio usando endpoints existentes; las tareas con inicio y vencimiento se siguen representando por el vencimiento, sin inventar una barra de duración ni ampliar modelo/consulta de intervalos. R03 corregido con fecha explícita y recarga. R04 conserva 60 días/avance de 30, explicado en UI. R05 carga/error no anuncian vacío y navegación tardía conserva el periodo. R06 pruebas de medianoche, tipos reales, fin exclusivo, solapamientos, zonas y DST. R07 fin de semana con L–V conserva el lunes; tres días naturales siempre contienen al menos un laborable, por lo que no se reprodujo conjunto vacío.

Los títulos horarios muy largos conservan su texto y pueden aumentar la altura de su bloque; la posición inicial y los carriles siguen los tiempos reales. En móvil, los solapamientos ensanchan sus fechas y pueden reducir el número de columnas simultáneamente visibles; las siete siguen accesibles. No se certifica lector de pantalla físico, gestos en dispositivo real, todas las fuentes/colores posibles ni un cumplimiento AA global a partir de estas capturas. Zoom comprobado con CSS 200 %, no con todos los motores de zoom nativo. No se han probado ni alterado cuentas personales, ni ampliado sincronización, creación/edición de eventos o drag & drop.
