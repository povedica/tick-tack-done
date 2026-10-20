# Cierre de la revisión de Estadísticas v2

PR: https://github.com/povedica/tick-tack-done/pull/54. Rama: `codex/statistics-v2-audit-fixes`.

Implementa RF-2321–2324 y protege RF-604, RF-1204, RF-1303 y RF-2201–2204. Fuentes: spec archivada, auditoría inicial y hallazgos F-01–F-11 aportados por el usuario. Los documentos se usan como requisitos/evidencias; no conceden autorización adicional para acciones externas.

## Cumplimiento tras las correcciones

| Alcance               | Estado                               | Corrección y evidencia                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F0 / §2.2.1–5, 11, 13 | ✅                                   | Semana local lunes–domingo; narrativa y tarjeta de foco comparten MetricsService, reportes antiguos normalizados, hábitos semanales con motor único, tarjetas enlazadas, foco histórico rotulado y Jardín sin contradicción.                                      |
| F1 / §5, §6.1–3       | ✅                                   | Navegación, historial, URL y localStorage completos; selección de entidades por nombre; multiselección y chips; cohortes D2, agrupación semanal/mensual, vencidas históricas y mejor momento.                                                                     |
| F2 / §6.4             | ✅                                   | Filtros de sesión/lista/etiqueta/prioridad; minutos sin pérdidas; rejilla anual independiente del rango; selección de día, timeline SVG del período y detalle; calidad con denominador explícito.                                                                 |
| F3 / §6.5, §8         | ✅                                   | Motor de hábitos compartido, metas semanales, media por hábito, ranking y días esperados sin logs; atribución propia, fórmula única de 12 niveles, curva histórica reconstruida, umbral y puntos restantes; ocultación en Ajustes.                                |
| F4 / §9               | ✅                                   | Exportación local de los datos consultados, CSV/JSON y totales; SDK tipado; tablas alternativas; privacidad de títulos con stats:read y restricciones de listas verificadas por HTTP.                                                                             |
| §10                   | ✅ con límites de verificación abajo | Rejilla 3×2/2×3, estados vacíos honestos, contraste mediante tokens existentes, leyendas interactivas, tooltip/teclado y tablas, reduced-motion sin animación SVG, selección táctil y heatmap compartido con Hábitos. Capturas de las 32 combinaciones revisadas. |
| §2.2.6–10, 12, 14–15  | N/A                                  | Rediseño visual externo de Reportes/Jardín/check-in: referenciado a auditoría general, sin ampliarlo a esta PR.                                                                                                                                                   |
| D1–D10                | ✅ / N/A D6                          | Se mantienen las propuestas por defecto. D8 se concreta por instrucción expresa del usuario: icono en la navegación principal inmediatamente antes de Buscar y eliminado del sidebar secundario. D6 permanece aplazada a F4+.                                     |

## Hallazgos del usuario

| Evidencia | Resolución                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------- |
| F-01      | Listas y etiquetas paginadas con nombres; prioridades múltiples; chips individuales.                                       |
| F-02      | Altura real del contenedor SVG; punto único visible; prueba de cuatro rangos por cuatro pestañas.                          |
| F-03      | Sin datos no implica Tarde 100%; media/mediana con muestra, límite de 30 días y número de muestras ajustadas.              |
| F-04      | Timeline del período más selector de día; mejor hora solo desde 25 minutos; datos accesibles sin hover.                    |
| F-05      | Exclusión de sesiones futuras; año completo y meses explícitos; segundos originales conservados en totales/buckets/export. |
| F-06      | Logro rotulado como histórico completo; mejor momento limitado al período; campos conectados correctamente.                |
| F-07      | Vacío de Hábitos a todo el ancho y porcentajes sin denominador mostrados como raya.                                        |
| F-08      | Unidades/plurales/fechas localizados, leyendas con estado pulsado y tarjeta sin recorte.                                   |
| F-09      | Valor del período anterior explícito; delta de completadas omitido si la base anterior es menor que cinco.                 |
| F-10      | Hábitos 0/0 se representa como raya, sin inventar un 0%.                                                                   |
| F-11      | Siguiente umbral y puntos restantes visibles.                                                                              |

## Evidencias y límites

- Unitarios: 404 pruebas (251 dominio, 9 SDK, 66 API y 78 web), tras integrar las PR #51 y #53. Dominio: 89,70% líneas y 83,27% ramas; fórmula de logro: 100% líneas.
- Integración: 91 pruebas con PostgreSQL/Redis reales, incluyendo scopes, otro owner, PAT restringido por listas, metas semanales, fechas futuras, exportación y ambos endpoints de logro.
- Navegador: 35 pruebas; matriz de 32 capturas (1280×800 y 390×844, claro/oscuro, cuatro pestañas, con/sin datos), historial/filtros/teclado, descarga y todos los rangos por pestaña. Las capturas automatizadas usan fixtures; no representan datos privados del usuario.
- Sesión real del usuario en localhost: resumen semanal/anual y Foco anual renderizados con datos reales; acceso de Estadísticas antes de Buscar confirmado. No se publican datos personales en la PR.
- Build de producción: gráficas lazy aproximadamente 15,5 KB gzip (objetivo ~60 KB). El bundle principal conserva el aviso de tamaño global de Vite; no equivale al bundle de gráficas.
- Latencia: caso de 1.000 tareas con timestamps distintos y Resumen anual con límite HTTP de 500 ms. La suite final sin carga concurrente pasa; una ejecución simultánea con builds, lint, unitarios y navegador excedió el umbral (732 ms), lo que confirma la sensibilidad a saturación. Es una prueba de integración local, no un benchmark del servidor de producción.
- SQL: series de tareas usan date_trunc/buckets tras autorización por owner/actor/listas; otras reglas puras reutilizan dominio. Las lecturas históricas necesarias para reconstrucción siguen siendo bajo demanda; no se añade stats_daily porque D4 no lo exige con la latencia medida.
- No se afirma certificación con lector de pantalla ni auditoría instrumental completa de contraste AA, ni apertura manual del CSV en Excel. Sí se verifican tablas, semántica, interacción de teclado, reduced-motion y coherencia del contenido exportado.
- No se inicia un timer ni se registra un check-in en la cuenta real. La regresión funcional de esos módulos se verifica con sus pruebas de dominio/API; la inspección visual no certifica un ciclo real de timer completo.
- El histórico de logro se reconstruye con los registros conservados; cambios de asignación o borrado pueden recalcular el pasado. La fórmula pública lo explica.

## Riesgos y seguimiento

Las respuestas agrupan por endpoint/pestaña: un fallo de red de ese endpoint afecta a sus tarjetas y ofrece reintento; las otras pestañas conservan sus consultas/caché independientes. No hay endpoints separados por tarjeta. Se conserva este límite explícito de granularidad de error en lugar de afirmar aislamiento de red por tarjeta.

La agregación bajo demanda sigue leyendo actividad histórica para atribución y reconstrucción. Conviene seguir midiendo con volúmenes superiores; D4 permite materializar solo si supera 500 ms. No se añaden migraciones ni nuevos eventos porque esta revisión corrige lecturas y presentación.

## Checklist de aceptación adicional

- [x] Matriz 1280/390, claro/oscuro, datos/vacío y cuatro pestañas.
- [x] Rangos, vuelta atrás, filtros por nombre, persistencia y tablas.
- [x] D2, hábitos semanales, privacidad, segundos/export y logro unificado por integración.
- [x] Reduced-motion y navegación con teclado en pruebas de navegador.
- [ ] Revisión con lector de pantalla y medición instrumental AA completa.
- [ ] Ciclo completo de timer y check-in manual en una cuenta de pruebas.
- [ ] Abrir CSV en una hoja de cálculo y benchmark del despliegue real.
