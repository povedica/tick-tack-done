# Cierre de hallazgos de auditoría UI/UX v2

Fuente: `docs/spec/done/auditoria-ui-ux-tick-tack-done-v2-2026-10-20-15e9c200.md`.
Base: `a7e4d31`, posterior al merge `ef89694` de la PR #51.
Rama: `codex/ui-ux-v2-close-findings`. PR: #57.

## Alcance ampliado por Pablo

- Cerrar los incumplimientos de la auditoría v2.
- Jardín inmediatamente después de Estadísticas en la navegación por defecto.
- Ajustes > Funciones permite reordenar los módulos por arrastre y mediante
  flechas accesibles. Se guarda en la cuenta y se aplica al sidebar, raíl y Más.
- Alineación transversal de texto y checkbox, incluyendo Agenda, listas, Matriz,
  Hoy y subtareas. Se acotan los estilos de formularios y los grid-area móviles
  para que no alteren el componente PriorityCheck.
- Revisión integral de Jardín digital: jerarquía visual, estética, utilidad y
  funcionamiento. Nuevo resumen con acciones, indicadores con periodo explícito,
  barras de actividad/carga, estados vacíos y personalización de widgets mediante
  el layout público existente (ocultar, arrastrar, flechas y tamaño; RF-2101–2104).
  Se corrigen las conexiones por cuenta, el horizonte de eventos a siete días y
  el cálculo de completadas hoy en la zona horaria del usuario.

Requisitos relacionados: RF-702, RF-704, RF-706, RF-1102, RF-2101–2104 y
RF-2012 de la spec específica de recurrencia MCP. No cambia el modelo Prisma ni
los eventos de dominio. navigation_order se añade al JSON de preferencias
existente, validado y documentado en OpenAPI; no requiere migración.

## Evidencias y límites

Revisión en `http://localhost:5173`, autenticada, a 1280×800 y 390×844.
Los estados de la matriz son de implementación: combinan inspección de código,
pruebas automatizadas y muestreo visual. No afirman cobertura manual exhaustiva
de todos los datos y variantes posibles. Producción no forma parte de esta pasada.

- Semana: ancho y scrollWidth coinciden; sin overflow de documento.
- Trimestre: octubre, noviembre y diciembre completos, 42 celdas cada uno y
  sin desbordamiento horizontal.
- Varias semanas: filas de 592 px en viewport de 800 px, semanas ISO 43/44.
- Matriz: ancho y scrollWidth coinciden, sin hashtags en aria-labels.
- Más móvil: enlaces de 44 px, texto rgb(25,25,25) sobre blanco.
- Funciones: arrastre real, flechas y persistencia tras recarga verificados.
- DAT-1: se reprodujo 55 frente a 58; la diferencia eran subtareas omitidas por
  el listado del indicador. flat=true y helper común lo corrigen.
- DET-5: no se ejecuta una limpieza masiva irreversible; el dato original
  permanece en servidor hasta guardar explícitamente la reparación.

## Matriz por ID

| ID     | Estado | Evidencia de implementación                                                                                                                                                                                 |
| ------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TOK-1  | CUMPLE | `apps/web/src/features/tokens/components/TokensPage.tsx` — Permisos agrupados y localizados, fechas sin segundos, revocación con confirmación, clientes MCP y ancho de ajustes.                             |
| TOK-2  | CUMPLE | `apps/web/src/features/tokens/components/TokensPage.tsx` — Permisos agrupados y localizados, fechas sin segundos, revocación con confirmación, clientes MCP y ancho de ajustes.                             |
| TOK-3  | CUMPLE | `apps/web/src/features/tokens/components/TokensPage.tsx` — Permisos agrupados y localizados, fechas sin segundos, revocación con confirmación, clientes MCP y ancho de ajustes.                             |
| TOK-4  | CUMPLE | `apps/web/src/features/tokens/components/TokensPage.tsx` — Permisos agrupados y localizados, fechas sin segundos, revocación con confirmación, clientes MCP y ancho de ajustes.                             |
| TOK-5  | CUMPLE | `apps/web/src/features/tokens/components/TokensPage.tsx` — Permisos agrupados y localizados, fechas sin segundos, revocación con confirmación, clientes MCP y ancho de ajustes.                             |
| TOK-6  | CUMPLE | `apps/web/src/features/tokens/components/TokensPage.tsx` — Permisos agrupados y localizados, fechas sin segundos, revocación con confirmación, clientes MCP y ancho de ajustes.                             |
| CAL-0  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Rutas explícitas, semanas ISO, semana laboral, colores por lista, tooltips y etiquetas de navegación por periodo.                                               |
| CAL-1  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Rutas explícitas, semanas ISO, semana laboral, colores por lista, tooltips y etiquetas de navegación por periodo.                                               |
| CAL-2  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Rutas explícitas, semanas ISO, semana laboral, colores por lista, tooltips y etiquetas de navegación por periodo.                                               |
| DIA-1  | CUMPLE | `apps/web/src/features/places/HourGrid.tsx` — Indicador actual actualizable, etiqueta de todo el día y medias horas.                                                                                        |
| DIA-2  | CUMPLE | `apps/web/src/features/places/HourGrid.tsx` — Indicador actual actualizable, etiqueta de todo el día y medias horas.                                                                                        |
| DIA-3  | CUMPLE | `apps/web/src/features/places/HourGrid.tsx` — Indicador actual actualizable, etiqueta de todo el día y medias horas.                                                                                        |
| SEM-1  | CUMPLE | `apps/web/src/features/places/HourGrid.tsx` — Columnas fluidas, bordes, hoy resaltado, franja bajo cabeceras y eventos spanning con fin exclusivo.                                                          |
| SEM-2  | CUMPLE | `apps/web/src/features/places/HourGrid.tsx` — Columnas fluidas, bordes, hoy resaltado, franja bajo cabeceras y eventos spanning con fin exclusivo.                                                          |
| SEM-3  | CUMPLE | `apps/web/src/features/places/HourGrid.tsx` — Columnas fluidas, bordes, hoy resaltado, franja bajo cabeceras y eventos spanning con fin exclusivo.                                                          |
| SEM-4  | CUMPLE | `apps/web/src/features/places/HourGrid.tsx` — Columnas fluidas, bordes, hoy resaltado, franja bajo cabeceras y eventos spanning con fin exclusivo.                                                          |
| SEM-5  | CUMPLE | `apps/web/src/features/places/HourGrid.tsx` — Columnas fluidas, bordes, hoy resaltado, franja bajo cabeceras y eventos spanning con fin exclusivo.                                                          |
| MDI-1  | CUMPLE | `apps/web/src/features/places/HourGrid.tsx` — Componente compartido con Semana.                                                                                                                             |
| MWE-1  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Filas reparten el alto, ellipsis con padding y enlace de desbordamiento.                                                                                        |
| MWE-2  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Filas reparten el alto, ellipsis con padding y enlace de desbordamiento.                                                                                        |
| MWE-3  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Filas reparten el alto, ellipsis con padding y enlace de desbordamiento.                                                                                        |
| MES-1  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Chips tenues, semanas ISO, +N y atenuación solo de contenido fuera del mes.                                                                                     |
| MES-2  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Chips tenues, semanas ISO, +N y atenuación solo de contenido fuera del mes.                                                                                     |
| MES-3  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Chips tenues, semanas ISO, +N y atenuación solo de contenido fuera del mes.                                                                                     |
| TRI-1  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Tres columnas fluidas, 42 celdas por mes, tooltips y navegación a Día.                                                                                          |
| TRI-2  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Tres columnas fluidas, 42 celdas por mes, tooltips y navegación a Día.                                                                                          |
| TRI-3  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Tres columnas fluidas, 42 celdas por mes, tooltips y navegación a Día.                                                                                          |
| ANO-1  | CUMPLE | `apps/web/src/components/ui.css` — Densidad anual ajustada en desktop; meses y días navegables.                                                                                                             |
| CAL-7  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Rutas explícitas, semanas ISO, semana laboral, colores por lista, tooltips y etiquetas de navegación por periodo.                                               |
| CAL-8  | N/A    | `apps/web/src/features/places/Places.tsx` — Referencia de diseño, no un defecto independiente; sus patrones se implementan en los IDs de calendario.                                                        |
| AG-1   | CUMPLE | `apps/web/src/features/places/Places.tsx` — Ventana de 60 días hacia delante, lista compacta y cronológica, separadores de mes y completar desde Agenda.                                                    |
| AG-2   | CUMPLE | `apps/web/src/features/places/Places.tsx` — Ventana de 60 días hacia delante, lista compacta y cronológica, separadores de mes y completar desde Agenda.                                                    |
| AG-3   | N/A    | `apps/web/src/features/places/Places.tsx` — Comparativa y decisión de diseño; el patrón recomendado se implementa en AG-2 y AG-4.                                                                           |
| AG-4   | CUMPLE | `apps/web/src/features/places/Places.tsx` — Ventana de 60 días hacia delante, lista compacta y cronológica, separadores de mes y completar desde Agenda.                                                    |
| TSK-1  | CUMPLE | `apps/web/src/features/tasks/TaskList.tsx` — Títulos y aria-label limpios; espacio de acciones y metadatos coherentes. Alineación compartida en today.css.                                                  |
| TSK-2  | CUMPLE | `apps/web/src/features/today/today.css` — Alineación del centro del SVG con primera línea; e2e en cuatro vistas, dos densidades y desktop/móvil (≤1,5 px).                                                  |
| TSK-3  | CUMPLE | `apps/web/src/features/product/duration.ts` — Duraciones en días, horas y minutos.                                                                                                                          |
| TSK-4  | CUMPLE | `apps/web/src/features/tasks/TaskList.tsx` — Títulos y aria-label limpios; espacio de acciones y metadatos coherentes. Alineación compartida en today.css.                                                  |
| TSK-5  | CUMPLE | `apps/web/src/features/tasks/TaskList.tsx` — Títulos y aria-label limpios; espacio de acciones y metadatos coherentes. Alineación compartida en today.css.                                                  |
| SB-1   | CUMPLE | `apps/web/src/shell/Sidebar.tsx` — Módulos visibles, Bandeja única, grupos plegables persistentes, ceros ocultos, acciones destructivas fuera del sidebar.                                                  |
| SB-2   | CUMPLE | `apps/web/src/shell/Sidebar.tsx` — Módulos visibles, Bandeja única, grupos plegables persistentes, ceros ocultos, acciones destructivas fuera del sidebar.                                                  |
| SB-3   | CUMPLE | `apps/web/src/shell/Sidebar.tsx` — Módulos visibles, Bandeja única, grupos plegables persistentes, ceros ocultos, acciones destructivas fuera del sidebar.                                                  |
| SB-4   | CUMPLE | `apps/web/src/shell/Sidebar.tsx` — Módulos visibles, Bandeja única, grupos plegables persistentes, ceros ocultos, acciones destructivas fuera del sidebar.                                                  |
| SB-5   | CUMPLE | `apps/web/src/shell/Sidebar.tsx` — Módulos visibles, Bandeja única, grupos plegables persistentes, ceros ocultos, acciones destructivas fuera del sidebar.                                                  |
| SB-6   | CUMPLE | `apps/web/src/shell/Sidebar.tsx` — Módulos visibles, Bandeja única, grupos plegables persistentes, ceros ocultos, acciones destructivas fuera del sidebar.                                                  |
| SB-7   | CUMPLE | `apps/web/src/shell/Sidebar.tsx` — Módulos visibles, Bandeja única, grupos plegables persistentes, ceros ocultos, acciones destructivas fuera del sidebar.                                                  |
| BEL-1  | CUMPLE | `apps/web/src/shell/IconRail.tsx` — Alerta Vencidas con navegación y scroll real al ancla; se adopta la opción mínima D3.                                                                                   |
| ACC-1  | CUMPLE | `apps/web/src/shell/AccountMenu.tsx` — Menú de cuenta con identidad, estadísticas, ajustes, tema, atajos y cierre de sesión.                                                                                |
| EXT-1  | CUMPLE | `apps/api/src/modules/reports/reports.controller.ts` — Lectura normalizada de reportes históricos: minutos de foco y tendencia coherentes con la narrativa.                                                 |
| EXT-2  | CUMPLE | `apps/web/src/features/product/ProductPages.tsx` — Selector de semana legible y tarjetas fluidas sin grid-column que creara columnas implícitas.                                                            |
| EXT-3  | CUMPLE | `apps/web/src/features/product/ProductPages.tsx` — Revisión con títulos limpios, enlaces de acento y acciones alineadas.                                                                                    |
| EXT-4  | CUMPLE | `apps/web/src/features/today/TodayPage.tsx` — Títulos limpios, enlaces estilados, plan comprensible, encabezado sticky y agenda de tareas/eventos.                                                          |
| EXT-5  | CUMPLE | `apps/web/src/features/today/TodayAgenda.tsx` — Agenda de hoy incluye también las tareas del día, junto a los eventos externos.                                                                             |
| EXT-6  | CUMPLE | `packages/domain/src/dates/presentation.ts` — Fecha humana compartida para cuentas atrás y motivos del plan; filas muestran hora separada por coma.                                                         |
| REC-1  | CUMPLE | `apps/web/src/features/tasks/complete-body.ts` — PWA solicita next_future + materialize_next; REST/MCP conservan sus defaults. Cobertura de dominio, API y UI.                                              |
| REC-2  | CUMPLE | `apps/web/src/features/tasks/complete-body.ts` — PWA solicita next_future + materialize_next; REST/MCP conservan sus defaults. Cobertura de dominio, API y UI.                                              |
| REC-3  | CUMPLE | `packages/domain/src/recurrence/rule.ts` — Días negativos: último, penúltimo y ordinal desde fin de mes.                                                                                                    |
| REC-4  | CUMPLE | `packages/domain/src/nlp/parse.ts` — Patrón mensual consume cada día N de (cada) mes antes del patrón diario.                                                                                               |
| EXT-9  | CUMPLE | `apps/web/src/features/today/TodayPage.tsx` — Sugerencias no muestran UUID como título: fallback seguro y título limpio.                                                                                    |
| EXT-7  | CUMPLE | `apps/web/src/features/today/TodayPage.tsx` — Títulos limpios, enlaces estilados, plan comprensible, encabezado sticky y agenda de tareas/eventos.                                                          |
| EXT-8  | CUMPLE | `apps/web/src/features/today/TodayPage.tsx` — Títulos limpios, enlaces estilados, plan comprensible, encabezado sticky y agenda de tareas/eventos.                                                          |
| TSK-6  | CUMPLE | `apps/web/src/features/tasks/TaskList.tsx` — Títulos y aria-label limpios; espacio de acciones y metadatos coherentes. Alineación compartida en today.css.                                                  |
| DET-1  | CUMPLE | `apps/web/src/features/tasks/DetailBody.tsx` — Título creciente, lectura Markdown, reparación conservadora e idempotente, adjuntos con selector y detalle redimensionable.                                  |
| DET-2  | CUMPLE | `apps/web/src/features/tasks/DetailBody.tsx` — Título creciente, lectura Markdown, reparación conservadora e idempotente, adjuntos con selector y detalle redimensionable.                                  |
| DET-3  | CUMPLE | `apps/web/src/features/tasks/DetailBody.tsx` — Título creciente, lectura Markdown, reparación conservadora e idempotente, adjuntos con selector y detalle redimensionable.                                  |
| DET-4  | CUMPLE | `apps/web/src/features/tasks/DetailBody.tsx` — Título creciente, lectura Markdown, reparación conservadora e idempotente, adjuntos con selector y detalle redimensionable.                                  |
| DET-5  | CUMPLE | `apps/web/src/features/tasks/collapse-repeated.ts` — Solo repara una repetición del buffer completo; conserva secciones internas repetidas. Reparación visible y explícita; no hay borrado masivo de datos. |
| DET-6  | CUMPLE | `apps/web/src/features/tasks/DetailBody.tsx` — Título creciente, lectura Markdown, reparación conservadora e idempotente, adjuntos con selector y detalle redimensionable.                                  |
| DET-7  | CUMPLE | `apps/web/src/features/tasks/DetailBody.tsx` — Título creciente, lectura Markdown, reparación conservadora e idempotente, adjuntos con selector y detalle redimensionable.                                  |
| DET-8  | CUMPLE | `apps/web/src/shell/DetailResizer.tsx` — El ancho por defecto respeta 384 px, admite arrastre/teclado y persiste.                                                                                           |
| POP-1  | CUMPLE | `apps/web/src/components/Popover.tsx` — Diálogo etiquetado, foco contenido/restaurado y Escape. Fechas ajenas atenuadas y quitar fecha destructivo.                                                         |
| POP-2  | CUMPLE | `apps/web/src/components/Popover.tsx` — Diálogo etiquetado, foco contenido/restaurado y Escape. Fechas ajenas atenuadas y quitar fecha destructivo.                                                         |
| POP-3  | CUMPLE | `apps/web/src/components/Popover.tsx` — Diálogo etiquetado, foco contenido/restaurado y Escape. Fechas ajenas atenuadas y quitar fecha destructivo.                                                         |
| CAL-9  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Rutas explícitas, semanas ISO, semana laboral, colores por lista, tooltips y etiquetas de navegación por periodo.                                               |
| CAL-10 | CUMPLE | `apps/web/src/features/places/Places.tsx` — Rutas explícitas, semanas ISO, semana laboral, colores por lista, tooltips y etiquetas de navegación por periodo.                                               |
| CAL-11 | CUMPLE | `apps/web/src/features/places/Places.tsx` — Rutas explícitas, semanas ISO, semana laboral, colores por lista, tooltips y etiquetas de navegación por periodo.                                               |
| AG-5   | CUMPLE | `apps/web/src/features/places/Places.tsx` — Ventana de 60 días hacia delante, lista compacta y cronológica, separadores de mes y completar desde Agenda.                                                    |
| MTX-1  | CUMPLE | `apps/web/src/features/matrix/MatrixBoard.tsx` — Grid 2×2 fluido, títulos accesibles limpios, Bandeja localizada y completar mediante el contrato PWA.                                                      |
| MTX-2  | CUMPLE | `apps/web/src/features/matrix/MatrixBoard.tsx` — Grid 2×2 fluido, títulos accesibles limpios, Bandeja localizada y completar mediante el contrato PWA.                                                      |
| MTX-3  | CUMPLE | `apps/web/src/features/matrix/MatrixBoard.tsx` — Grid 2×2 fluido, títulos accesibles limpios, Bandeja localizada y completar mediante el contrato PWA.                                                      |
| MTX-4  | CUMPLE | `apps/web/src/features/matrix/MatrixBoard.tsx` — Grid 2×2 fluido, títulos accesibles limpios, Bandeja localizada y completar mediante el contrato PWA.                                                      |
| CTA-1  | CUMPLE | `apps/web/src/features/countdowns/CountdownCard.tsx` — Fecha humana y número + unidad sin frase redundante.                                                                                                 |
| CTA-2  | CUMPLE | `apps/web/src/features/countdowns/CountdownCard.tsx` — Fecha humana y número + unidad sin frase redundante.                                                                                                 |
| CTA-3  | CUMPLE | `apps/web/src/features/countdowns/CountdownCard.tsx` — Fecha humana y número + unidad sin frase redundante.                                                                                                 |
| FOC-1  | CUMPLE | `apps/web/src/features/product/ProductPages.tsx` — Copy corregido, presets con unidad y aria-pressed, métricas en tarjetas.                                                                                 |
| FOC-2  | CUMPLE | `apps/web/src/features/product/ProductPages.tsx` — Copy corregido, presets con unidad y aria-pressed, métricas en tarjetas.                                                                                 |
| FOC-3  | CUMPLE | `apps/web/src/features/product/ProductPages.tsx` — Copy corregido, presets con unidad y aria-pressed, métricas en tarjetas.                                                                                 |
| JAR-2  | CUMPLE | `apps/web/src/features/dashboard/DashboardPage.tsx` — Estado de puntuación y control coherentes, unidades, carga real por lista e integraciones agrupadas.                                                  |
| JAR-1  | CUMPLE | `apps/web/src/features/dashboard/DashboardPage.tsx` — Estado de puntuación y control coherentes, unidades, carga real por lista e integraciones agrupadas.                                                  |
| JAR-3  | CUMPLE | `apps/web/src/features/dashboard/DashboardPage.tsx` — Estado de puntuación y control coherentes, unidades, carga real por lista e integraciones agrupadas.                                                  |
| JAR-4  | CUMPLE | `apps/web/src/features/dashboard/DashboardPage.tsx` — Estado de puntuación y control coherentes, unidades, carga real por lista e integraciones agrupadas.                                                  |
| JAR-5  | CUMPLE | `apps/web/src/features/dashboard/DashboardPage.tsx` — Estado de puntuación y control coherentes, unidades, carga real por lista e integraciones agrupadas.                                                  |
| REV-1  | CUMPLE | `apps/web/src/features/product/ProductPages.tsx` — Enlaces estilados y acciones alineadas; refresco de todas las superficies al completar.                                                                  |
| PLN-1  | CUMPLE | `apps/web/src/features/planning/PlanDayPage.tsx` — Carga explicada, fecha humana, título limpio y No haré unificado.                                                                                        |
| PLN-2  | CUMPLE | `apps/web/src/features/planning/PlanDayPage.tsx` — Carga explicada, fecha humana, título limpio y No haré unificado.                                                                                        |
| PLN-3  | CUMPLE | `apps/web/src/features/planning/PlanDayPage.tsx` — Carga explicada, fecha humana, título limpio y No haré unificado.                                                                                        |
| PLN-4  | CUMPLE | `apps/web/src/features/planning/PlanDayPage.tsx` — Carga explicada, fecha humana, título limpio y No haré unificado.                                                                                        |
| BUS-1  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Buscador estilado, singular/plural, coincidencias resaltadas, ocurrencia identificada y ayuda de búsqueda vacía.                                                |
| BUS-2  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Buscador estilado, singular/plural, coincidencias resaltadas, ocurrencia identificada y ayuda de búsqueda vacía.                                                |
| BUS-3  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Buscador estilado, singular/plural, coincidencias resaltadas, ocurrencia identificada y ayuda de búsqueda vacía.                                                |
| BUS-4  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Buscador estilado, singular/plural, coincidencias resaltadas, ocurrencia identificada y ayuda de búsqueda vacía.                                                |
| BUS-5  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Buscador estilado, singular/plural, coincidencias resaltadas, ocurrencia identificada y ayuda de búsqueda vacía.                                                |
| NAV-1  | CUMPLE | `apps/web/src/app.tsx` — /tasks/completed redirige explícitamente a /smart/completed.                                                                                                                       |
| TKY-1  | CUMPLE | `apps/web/src/features/ticky/TickyPage.tsx` — Estado vacío orientado al usuario, sin variables de entorno.                                                                                                  |
| PAP-1  | CUMPLE | `apps/web/src/features/tasks/TaskList.tsx` — La fecha de papelera usa deleted_at y la etiqueta Borrada el.                                                                                                  |
| DAT-1  | CUMPLE | `apps/api/src/reading/overdue.ts` — Conjunto canónico común; indicador consulta flat=true para incluir subtareas e invalida caché tras mutaciones.                                                          |
| AJU-1  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Ajustes con zonas buscables y offsets, recordatorios por defecto/excepciones y copy humano.                                                                     |
| AJU-2  | CUMPLE | `apps/web/src/features/places/Places.tsx` — Ajustes con zonas buscables y offsets, recordatorios por defecto/excepciones y copy humano.                                                                     |
| AJU-3  | CUMPLE | `apps/web/src/features/settings/InboundEmailCard.tsx` — Estado etiquetado como Estado: Activa/Parada.                                                                                                       |
| AJU-4  | CUMPLE | `apps/web/src/features/views/components/SmartListsPage.tsx` — someday se localiza como Algún día.                                                                                                           |
| AJU-5  | CUMPLE | `apps/web/src/i18n/extra.ts` — Ayudas de jornada y recordatorio sin rutas internas ni frases crípticas.                                                                                                     |
| AJU-6  | CUMPLE | `apps/web/src/features/tokens/components/TokensPage.tsx` — Scopes con acciones, notificaciones y Ticky localizados; claves técnicas solo como tooltip.                                                      |
| AJU-7  | N/A    | `apps/web/src/features/places/Places.tsx` — La cuenta de localhost no tiene webhooks. No se ha eliminado ningún dato ni auditado ese dato en producción.                                                    |
| AJU-8  | CUMPLE | `apps/web/src/shell/shortcuts.ts` — Buscar (paleta), Buscar (rápido), Ir a Buscar.                                                                                                                          |
| AJU-9  | CUMPLE | `apps/web/src/features/settings/MoreSettings.tsx` — Una acción de exportación y estado de backup remoto en el panel de backups.                                                                             |
| MOV-1  | CUMPLE | `apps/web/src/components/ui.css` — Menú legible y táctil, Agenda por defecto en el acceso móvil, pestañas accesibles y detalle sin columnas implícitas.                                                     |
| MOV-2  | CUMPLE | `apps/web/src/components/ui.css` — Menú legible y táctil, Agenda por defecto en el acceso móvil, pestañas accesibles y detalle sin columnas implícitas.                                                     |
| MOV-3  | CUMPLE | `apps/web/src/components/ui.css` — Menú legible y táctil, Agenda por defecto en el acceso móvil, pestañas accesibles y detalle sin columnas implícitas.                                                     |
| MOV-4  | CUMPLE | `apps/web/src/features/today/today.css` — grid-area de filas acotado a .task-row; subtareas recuperan la columna flexible. E2e exige ancho >150 px a 390 px.                                                |
| MOV-5  | CUMPLE | `apps/web/src/components/ui.css` — Menú legible y táctil, Agenda por defecto en el acceso móvil, pestañas accesibles y detalle sin columnas implícitas.                                                     |
| MOV-6  | CUMPLE | `apps/web/src/shell/Sidebar.tsx` — En móvil, listas/etiquetas/filtros empiezan plegados salvo preferencia previa; conserva acceso a todo el contenido.                                                      |
| A11Y-1 | CUMPLE | `apps/web/src/features/today/today.css` — Foco visible y estados accesibles. Reglas de layout acotadas para no contaminar el checkbox compartido.                                                           |
| A11Y-2 | CUMPLE | `apps/web/src/features/today/today.css` — Foco visible y estados accesibles. Reglas de layout acotadas para no contaminar el checkbox compartido.                                                           |
| A11Y-3 | CUMPLE | `apps/web/src/features/today/today.css` — Foco visible y estados accesibles. Reglas de layout acotadas para no contaminar el checkbox compartido.                                                           |

## Validación de cierre

- E2e: `PLAYWRIGHT_BASE_URL=http://localhost:5173 pnpm --filter web exec playwright test e2e/ui-ux-v2.spec.ts --workers=1`.
- E2e: 11/11 en verde; alineación en Hoy, listas, Matriz y Agenda a 1280/390 px,
  densidad cómoda/compacta, tolerancia de 1,5 px respecto a la primera línea.
- Node 26: lint y typecheck en verde; 416 unitarios y 96 de integración en verde.
  Cobertura de dominio: 89,75 % de líneas y 83,30 % de ramas.
- Build API/SDK/PWA y regeneración OpenAPI/SDK correctos. Vite mantiene el aviso
  de tamaño de bundle superior a 500 kB.
- Prettier no encuentra problemas en los archivos de esta PR; el chequeo global
  solo señala dos specs locales preexistentes no versionadas, ajenas a este cambio.
