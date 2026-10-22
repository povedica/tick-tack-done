# Seguimiento de la auditoría TTD

Registro incremental del trabajo solicitado el 21/10/2026. Por instrucción posterior del usuario, los hallazgos restantes se acumulan en una sola PR con commits y pushes parciales. Los hallazgos pendientes
siguen el orden de prioridad de la petición; no se consideran cerrados.

| ID         | Estado                       | PR                                                                                                                   | Notas                                                                                                                                                                       |
| ---------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TTD-AUD-01 | corregido                    | [#60](https://github.com/povedica/tick-tack-done/pull/60), [#70](https://github.com/povedica/tick-tack-done/pull/70) | Fecha efectiva en filtros y filas; inicio/duración en API de vistas y SDK. Tests de dominio, formato, mapeo, SQL e integración.                                             |
| TTD-AUD-02 | corregido                    | [#61](https://github.com/povedica/tick-tack-done/pull/61)                                                            | Rangos ES/EN, título limpio, inicio y duración; tests del parser y creación real por API, incluidos cambios DST.                                                            |
| TTD-AUD-03 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Atajos de día completo: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                             |
| TTD-AUD-04 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Fecha efectiva y hora de fin: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                       |
| TTD-AUD-05 | corregido                    | [#68](https://github.com/povedica/tick-tack-done/pull/68)                                                            | Menú vertical acotado al viewport, sin desbordamiento; flechas/Inicio/Fin/Escape y retorno del foco. Regresión Chromium a 1280 y 360 px.                                    |
| TTD-AUD-06 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Guardado y refresco del detalle: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                    |
| TTD-AUD-07 | corregido                    | [#69](https://github.com/povedica/tick-tack-done/pull/69)                                                            | Accesos de navegación/detalle condicionados a ui y kill de la API existente; estado directo, error y reintento; screen-page común.                                          |
| TTD-AUD-08 | aplazado                     | —                                                                                                                    | F-1…F-10 excluidos por petición expresa. No se añade configuración ni activación; la disponibilidad y maquetación de ttd se corrigen con TTD-AUD-07.                        |
| TTD-AUD-09 | corregido                    | [#72](https://github.com/povedica/tick-tack-done/pull/72)                                                            | Panel y Estadísticas comparten contador, lunes local y exclusión de canceladas; etiqueta esta semana y periodo API coherente. Tests UTC, cambio de día local y DST.         |
| TTD-AUD-10 | aplazado                     | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Arreglo en curso por otro agente; no se duplica. Prueba PostgreSQL adicional confirma segundos reales y totales por periodo.                                                |
| TTD-AUD-11 | corregido                    | [#67](https://github.com/povedica/tick-tack-done/pull/67)                                                            | Constructor común API/automatización, lunes local, payload completo v2; test de límite semanal UTC/local con tareas, hábitos y foco. Históricos preservados.                |
| TTD-AUD-12 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Puntuación N/100: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                                   |
| TTD-AUD-13 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Controles de filtros: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                               |
| TTD-AUD-14 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Matriz: arreglo parcial: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                            |
| TTD-AUD-15 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Acciones de papelera: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                               |
| TTD-AUD-16 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Purga optimista y rollback: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                         |
| TTD-AUD-17 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Botones Crear: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                                      |
| TTD-AUD-18 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Salida tras borrar lista: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                           |
| TTD-AUD-19 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Página no encontrada: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                               |
| TTD-AUD-20 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Anillo de foco y presets: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                           |
| TTD-AUD-21 | corregido                    | [#73](https://github.com/povedica/tick-tack-done/pull/73)                                                            | Cabecera de escritorio en una línea y ancho de selector acotado. Regresión Chromium fallaba con dos líneas. El recorte de emoji no se reprodujo en inspección local.        |
| TTD-AUD-22 | corregido                    | [#73](https://github.com/povedica/tick-tack-done/pull/73)                                                            | Fondos por tokens con variantes oscuras; texto y número legibles en las 13 variantes y 6 acentos. Contraste calculado en Chromium ≥4,5:1, incluidos fondos del degradado.   |
| TTD-AUD-23 | corregido                    | [#73](https://github.com/povedica/tick-tack-done/pull/73)                                                            | Checkbox/radio en fila; fecha civil ES/EN editable con formato explícito, valida días imposibles y envía ISO sin zona. Selects y modal conservan el estilo común.           |
| TTD-AUD-24 | corregido                    | [#73](https://github.com/povedica/tick-tack-done/pull/73)                                                            | Popover controlado: elegir, Escape, clic fuera y reemplazar por menú de tarjeta cierran el anterior; foco restaurado; icono de agrupar distinguible.                        |
| TTD-AUD-25 | corregido                    | [#73](https://github.com/povedica/tick-tack-done/pull/73)                                                            | Tokens de lateral y rail por tema; selección, hover e iconos legibles. Doce combinaciones tema/acento verificadas en Chromium, incluido selector de tema.                   |
| TTD-AUD-26 | corregido                    | [#73](https://github.com/povedica/tick-tack-done/pull/73)                                                            | Botón de acceso usa var(--accent); regresiones violeta y verde que fallaban antes. Registro comparte selector CSS; formulario deshabilitado en este entorno.                |
| TTD-AUD-27 | parcial                      | [#73](https://github.com/povedica/tick-tack-done/pull/73), [#71](https://github.com/povedica/tick-tack-done/pull/71) | #73 centraliza Ticky, avisos de Hoy y contexto de proyectos; #71 cuentas atrás. Razones de Control con códigos públicos; pendiente validar combinación con #71.             |
| TTD-AUD-28 | corregido                    | [#66](https://github.com/povedica/tick-tack-done/pull/66)                                                            | runAction común aplicado a promesas UI sin rechazo; MutationCache global, avisos accesibles ES/EN, rollback y respaldo unhandledrejection; lint no admite void como escape. |
| TTD-AUD-29 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Sesión caducada: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                                    |
| TTD-AUD-30 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Boundary por ruta: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                                  |
| TTD-AUD-31 | parcial                      | [#73](https://github.com/povedica/tick-tack-done/pull/73), [#71](https://github.com/povedica/tick-tack-done/pull/71) | #73 paleta y ajustes de calendario; #71 foco/filtros/matriz/cuentas atrás/funcionalidades/jornada. Rail: contador no disponible y reintento. Pendiente validar combinación. |
| TTD-AUD-32 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Confirmaciones y plurales: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                          |
| TTD-AUD-33 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Navegación móvil: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                                   |
| TTD-AUD-34 | corregido parcialmente       | [#73](https://github.com/povedica/tick-tack-done/pull/73)                                                            | Reproducida petición /me prematura en login; sincronización montada solo dentro de AppShell autenticado. Pendiente confirmar los cuatro errores originales en despliegue.   |
| TTD-AUD-35 | corregido                    | [#63](https://github.com/povedica/tick-tack-done/pull/63)                                                            | Activos y revocados paginados; agrupación por ID de aplicación; recuento del servidor excluye rotaciones automáticas. Reproducido con 80 rotaciones y 56 activos.           |
| TTD-AUD-36 | corregido                    | [#63](https://github.com/povedica/tick-tack-done/pull/63)                                                            | Caducidad expuesta desde el modelo existente; estado Caducado en la UI, sin perder la opción de revocar.                                                                    |
| TTD-AUD-37 | corregido                    | [#62](https://github.com/povedica/tick-tack-done/pull/62)                                                            | Reproducido PostgreSQL 25P02; nombre interno OAuth único antes del INSERT, sin reintentos en transacción abortada. Tests de reautorización y choque manual.                 |
| TTD-AUD-38 | parcial                      | [#73](https://github.com/povedica/tick-tack-done/pull/73), [#71](https://github.com/povedica/tick-tack-done/pull/71) | #73 pagina actividad, carga y errores con reintento; #71 aporta etiquetas de peticiones y ciclo de vida, pendientes de integrar y validar.                                  |
| TTD-AUD-39 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Errores de tokens: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                                  |
| TTD-AUD-40 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Accesibilidad del secreto: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                          |
| TTD-AUD-41 | corregido                    | [#64](https://github.com/povedica/tick-tack-done/pull/64)                                                            | Utilidad compartida: Gestionar separado de Escritura, Cuenta atrás en formulario y marca de permisos sensibles.                                                             |
| TTD-AUD-42 | corregido                    | [#64](https://github.com/povedica/tick-tack-done/pull/64)                                                            | Sensibles desmarcados, defaults sin webhooks/automatizaciones, internos excluidos, etiquetas ES/EN, componentes y estados de la app.                                        |
| TTD-AUD-43 | corregido                    | [#65](https://github.com/povedica/tick-tack-done/pull/65)                                                            | Reconectar con cuenta conectada; confirmación compartida Google/Drive informa de Calendar y Drive; errores visibles y parámetro de retorno eliminado.                       |
| TTD-AUD-44 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Confirmación de integraciones: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                      |
| TTD-AUD-45 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Rotación webhook: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                                   |
| TTD-AUD-46 | externo pendiente de validar | [#71](https://github.com/povedica/tick-tack-done/pull/71)                                                            | Estilo de revocados: implementado por Cursor; no se duplica ni se considera validado en #73.                                                                                |

## TTD-AUD-01: criterios de aceptación

- Solo inicio mañana: integración verifica presencia en `/smart-lists/tomorrow/tasks`
  y contador `task_count=1`, sin aparecer en `no_date`.
- Fecha sin hora, con hora, medianoche y duración: tests del formateador de filas.
- Inicio y vencimiento: se prioriza inicio en los filtros y se muestra rango en filas.
- Zona de la tarea: `Europe/Madrid` explícita en el formateador, independiente del navegador.
- Se conserva el criterio de vencimiento para `overdue` y las fechas históricas de
  completadas/papelera. No se altera la persistencia de tareas ni se añaden migraciones.
- RF cubiertos: RF-601, RF-602, RF-604, RF-901, RF-904.

## Comprobaciones manuales pendientes

- TTD-AUD-01: comprobar visualmente Bandeja, Mañana, contador lateral y kanban con
  una tarea de día completo, otra con hora y otra con rango, usando un navegador
  en una zona diferente a la de la tarea.
- OAuth: reautorizar ChatGPT con una conexión activa cuando se cierre TTD-AUD-37.
- Tokens/MCP: JSON a 360 px, consentimiento claro/oscuro y ES/EN, lector de pantalla.
- TTD-AUD-33/34: navegación móvil real y errores de consola en login.

Validación de TTD-AUD-01: typecheck, lint y tests completos en verde (271 dominio,
95 web, 102 API, 9 SDK); integración completa: 117 pasan, 2 omitidos.
El usuario autoriza publicar solo los Markdown de la auditoría. Capturas, PDF y
HTML se conservan en local y quedan excluidos de las PR.

## TTD-AUD-02: criterios de aceptación

- `mañana 09:00-09:30`, `mañana 9:00–9:30` y `mañana de 9 a 9:30`:
  título limpio, inicio 09:00 y duración 30 min (tests que fallaban antes del arreglo).
- `tomorrow 9am-10am`: inicio 09:00, duración 60 min, título limpio.
- Rangos invertidos, de cero minutos o con hora inválida: sin duración negativa.
- Rango sin día y rango recurrente: conservan etiquetas y recurrencia.
- Horario de verano/invierno: duración transcurrida calculada en la zona de captura,
  conservando la hora de fin solicitada.
- API: `raw_text` persiste inicio y duración; no hace falta añadir campos al contrato.
- La vista previa del composer reconoce el inicio; las filas usan el formato de #60.
- RF cubiertos: RF-102, RF-601, RF-602, RF-604.

Validación de TTD-AUD-02: typecheck y lint completos; 281 tests de dominio,
95 web, 102 API y 9 SDK; integración completa: 120 pasan, 2 omitidos.

## TTD-AUD-37: criterios de aceptación

- Reproducción local confirmada antes de modificar código: dos tests fallaban con
  PostgreSQL `25P02` al reintentar tras el conflicto de unicidad.
- Emitir dos autorizaciones consecutivas para el mismo cliente funciona.
- Un token manual llamado «ChatGPT» no bloquea OAuth y conserva su estado activo.
- Se mantienen los eventos de emisión dentro de la transacción y los secretos no
  se incluyen en nombres ni eventos.
- Nombre interno elegido antes del INSERT con UUID; se mantiene el límite de 80
  caracteres y el índice existente de nombres activos. Sin cambios de modelo ni migración.
- RF cubierto: RF-2002. Pendiente validación del flujo real de ChatGPT por Pablo.

Validación de TTD-AUD-37: typecheck, lint y tests completos en verde; integración
completa: 122 pasan, 2 omitidos. OpenAPI regenerado sin diferencias.

## TTD-AUD-35/36: criterios de aceptación

- Reproducción antes del arreglo: 55 filas OAuth recientes ocultan un token manual
  antiguo en la página inicial, pese a existir `next_cursor`.
- API: filtro público `status=active|revoked` y total anterior al cursor; `active`
  significa no revocado e incluye los accesos caducados para permitir revocarlos.
- Las rotaciones se identifican por `refreshTokens.rotatedAt`, sin columna nueva,
  y se excluyen de revocados; no se incluyen en su total.
- Integración: 56 activos anteriores a 80 rotaciones se recuperan sin omisiones ni
  duplicados; tres revocados reales mantienen su total al paginar de dos en dos.
- UI: paginación independiente con «Cargar más», errores con reintento, agrupación
  por ID de cliente (no por nombre autodeclarado), permisos y acciones por autorización.
- Caducidad: campos existentes expuestos en DTO/SDK, etiqueta neutra «Caducado»;
  un token sin caducidad sigue «Activo». Actualización del reloj cada 30 segundos.
- RF cubierto: RF-2002. Sin cambios de modelo, migraciones ni eventos nuevos.

Validación de TTD-AUD-35/36: typecheck y lint completos; 281 tests de dominio,
97 web, 102 API y 9 SDK. Integración completa: 123 pasan, 2 omitidos.

CodeQL detectó una ruta desde metadatos OAuth hacia el hash de ETag. El listado
selecciona solo campos públicos del DTO y no calcula ETag para esta respuesta
sensible (`Cache-Control: no-store`); un test comprueba la cabecera.

La traza SARIF identifica `oauth_client_id` (UUID público) como origen de la alerta.
Listado y creación devuelven JSON directamente, sin pasar por el helper de ETag
cuya rama desactivada seguía apareciendo en el análisis estático. No se suprime la alerta.

## TTD-AUD-41/42: criterios de aceptación

- El test de permisos por defecto fallaba antes del arreglo con `webhooks:manage`.
- Defaults OAuth sin webhooks/automatizaciones; sensibles explícitos desmarcados
  inicialmente y marcados visualmente (también en el formulario manual).
- Descubrimiento y concesión externa excluyen `ticky:*` y `notifications:self:write`.
  Se mantiene el techo de `grantApprovedScopes` y se prueba el rechazo de internos.
- Etiquetas legibles de todos los permisos públicos en ES/EN mediante utilidad
  compartida, sin identificadores crudos. «Gestionar» conserva su nivel propio.
- Formulario manual permite `countdowns:write`.
- Consentimiento usa el idioma de la app, botones y tokens visuales comunes,
  carga, error con reintento, y bloquea decisión/casillas durante el envío.
- RF cubierto: RF-2002. Sin cambios de modelo ni migraciones.
- Pendiente visual: consentimiento claro/oscuro, ES/EN y navegación por teclado con
  una petición real de ChatGPT que solicite permisos sensibles.

Validación de TTD-AUD-41/42: typecheck, lint y tests completos (281 dominio,
100 web, 104 API, 9 SDK); integración: 123 pasan, 2 omitidos; OpenAPI sin diff.

## TTD-AUD-43: criterios de aceptación

- Test de componente que fallaba antes del arreglo: Google conectado no ofrecía
  «Reconectar Google». Ahora lo ofrece en ambas tarjetas.
- Desconectar desde Google o Drive abre confirmación inline que explica que
  afecta a Google Calendar y Drive; la API solo se invoca al confirmar.
- Un fallo mantiene la confirmación y muestra el error en ella; reconectar muestra
  error también si la API devuelve una URL inválida, sin navegar a otros hosts.
- Las acciones se bloquean durante el envío y se invalidan ambas tarjetas y los
  calendarios después de desconectar.
- El parámetro `google=connected|error` se limpia con replace tras capturar el aviso,
  conservando otros parámetros; recargar no repite la nota.
- Textos ES/EN, componentes y confirmación de la app; sin cambios de backend.
- Pendiente real: desde Calendar, reconectar en dos clics y probar la desconexión
  tras comprobar el aviso de que afecta a ambos servicios.
- RF cubiertos: RF-1103, RF-2004, RF-2005 y RF-2006.

Validación de TTD-AUD-43: typecheck, lint y tests completos (281 dominio,
104 web, 104 API, 9 SDK); cuatro regresiones Google; OpenAPI sin diferencias.

## TTD-AUD-28: criterios de aceptación

- `runAction` captura rechazos y fallos del callback de éxito, avisa con texto ES/EN
  y permite restaurar estado optimista antes del aviso. Los mensajes no exponen
  detalles internos de las excepciones.
- Aplicado mediante AST y tipos a promesas de la UI sin gestión de rechazo, incluidas
  tareas, checklist, papelera, listas, foco, ajustes, integraciones y navegación.
  Se conservan los catch y callbacks de rollback locales ya existentes.
- MutationCache avisa de errores de cualquier mutación sin reemplazar sus handlers
  de error/rollback. Respaldo de `unhandledrejection` para rechazos fuera de esas rutas.
- El toast de error usa `role=alert` y permanece ocho segundos. Los avisos de éxito
  y su acción de deshacer mantienen el comportamiento anterior.
- Lint configura `no-floating-promises` con `ignoreVoid:false` en el código UI.
  El service worker queda fuera de esta regla de feedback visual.
- Tests: HTTP 500 simulado, éxito, error de callback, idioma, rollback local y de
  mutaciones, aviso global y retirada del listener de respaldo.
- RF cubiertos: RF-201 y RF-208; no se cambia la semántica de mutaciones ni la cola offline.
- Pendiente navegador: provocar 500 en acciones representativas de cada pantalla
  y comprobar que el aviso aparece y la pantalla conserva/restaura su estado.

Validación de TTD-AUD-28: typecheck, lint y suites completas en verde
(281 dominio, 110 web, 104 API, 9 SDK); seis regresiones de errores y rollback.
Muestra negativa de lint rechazada por no-floating-promises; OpenAPI sin diferencias.

## TTD-AUD-11: criterios de aceptación

- Reproducción previa: domingo UTC que ya es lunes en Pacific/Kiritimati guardaba
  una semana con fecha de domingo y payload incompleto.
- API manual y automatización comparten constructor del read model; el cálculo
  diario puro usa ISO y vive en packages/domain.
- La misma generación persiste siete días, completadas/creadas, hábitos, foco,
  zona horaria, metrics_version=2 y calculated_at; respeta el tono configurado.
- Integración con PostgreSQL: una completada/creada, un hábito cumplido/esperado
  y 30 minutos de foco; ambos productores actualizan el mismo ID del lunes local.
- Se preservan las transacciones y los sobres de los eventos de cada productor;
  catálogo actualizado con la semántica de semana local.
- Históricos inmutables (RF-2204): siguen sin recalcularse en GET. Tras desplegar,
  usar «Actualizar» en la semana actual o POST /reports/weekly para regenerarla;
  las siguientes ejecuciones automáticas ya guardan el payload completo.
- RF cubiertos: RF-2201, RF-2202, RF-2203, RF-2204 y RF-604. Sin migración de modelo.
- Pendiente cuenta real: regenerar la semana actual y comprobar tarjetas y fecha
  de cálculo en /reports/weekly.

Validación de TTD-AUD-11: typecheck, lint y suites completas en verde
(284 dominio, 110 web, 101 API y 9 SDK); integración: 124 pasan, 2 omitidos.
OpenAPI regenerado sin diferencias.

## TTD-AUD-05: criterios de aceptación

- Reproducción previa en Chromium a 1280 y 360 px: scroll horizontal y acciones en paralelo.
- Grupos verticales, etiquetas completas con salto de línea, iconos sin comprimir y ancho limitado al viewport. El scroll vertical permite acceder a todas las acciones.
- Flechas con recorrido circular, Inicio/Fin, Escape y foco restaurado al disparador; se evita ejecutar el atajo de la lista de fondo.
- Regresión del diálogo de fecha y su foco atrapado también pasa. No cambia el comportamiento de las acciones.
- RF cubiertos: RF-1001 y RF-1902. Sin API, modelo, colores fijos ni textos nuevos.
- Validación: typecheck, lint, 284 tests de dominio, 110 web, 101 API y 9 SDK; 3 pruebas Chromium en verde.

## TTD-AUD-07/08: alcance y aceptación

- Reproducción previa: ui=false conservaba dos enlaces a Ticky en escritorio y móvil.
- IconRail, menú móvil y detalle comparten la consulta de capacidades existente; ui=false, kill, carga y error no ofrecen el acceso. Al recuperarse vuelven sin recargar la app.
- /ticky conserva la URL y muestra desactivado por administrador, interruptor de emergencia o error de consulta, con Reintentar. No afirma conocer configuración o salud que la API no expone.
- screen-page aplica márgenes comunes; inspección visual local de capturas Chromium a 1280 y 360 px. Las imágenes no se publican.
- Tests de error→kill→habilitado, acceso desde detalle y regresiones de menú/fecha.
- RF-1901, RF-1902 y APP-06 (integración Ticky). Sin cambios de API, modelo ni servicio externo.
- TTD-AUD-08 y redirección a ajustes de Ticky quedan fuera: requieren la configuración F-1…F-10 que el usuario excluyó expresamente. No se presenta una pantalla de activación ficticia.

Validación de TTD-AUD-07: typecheck y lint; 284 tests dominio, 110 web,
101 API y 9 SDK; 6 pruebas Chromium (3 de disponibilidad y 3 de menú/fecha).
OpenAPI regenerado sin diferencias.

## TTD-AUD-01: complemento de adaptadores de filtros

El adaptador interno de automatizaciones también debe incluir startDate al construir
FilterSubject. Regresión PostgreSQL que fallaba antes: una tarea con inicio mañana
y sin vencimiento no ejecutaba una regla Mañana. Ahora la ejecuta, no coincide con
Sin fecha y sigue priorizando inicio al añadir un vencimiento para hoy.
RF-601 y RF-904; solo se completa el mapeo, sin cambiar el motor ni el modelo.

La revisión de FilterSubject localizó la misma omisión en los adaptadores de
revisión diaria y reglas personalizadas de matriz: ambos propagan startDate,
y el lector API de candidatos también. Dos regresiones de dominio fallaban antes.
No se alteran la urgencia por defecto de matriz ni la puntuación de revisión.

Validación del complemento TTD-AUD-01: typecheck, lint y suites completas
(286 dominio, 110 web, 101 API, 9 SDK); integración 125 pasan y 2 omitidos;
OpenAPI regenerado sin diferencias.

## TTD-AUD-09: criterios de aceptación

- Reproducción previa en dominio y PostgreSQL: Panel=3 frente a Estadísticas=1 con las mismas tareas (actual, anterior y cancelada).
- Contador común de completadas/creadas; canceladas excluidas. Semana desde lunes civil local hasta el instante actual; futuro excluido. Comparación con semana anterior completa.
- Tres regresiones: UTC, domingo UTC/lunes de Pacific/Kiritimati y cambio DST de Madrid. Regresión HTTP compara ambos endpoints y el inicio del periodo.
- Etiqueta «esta semana» y explicación ES/EN en i18n; prueba Chromium del KPI actualizada y en verde.
- Snapshot exige zona explícita: Panel, MCP e informe semanal pasan la zona de la cuenta. Vencidas y próximos siete días conservan sus criterios.
- OpenAPI y SDK regenerados para documentar la semántica del periodo. No se cambia el contrato de campos ni el modelo.
- RF-2102, RF-1601, RF-2321 y RF-604.

Validación TTD-AUD-09: typecheck, lint y suites completas (289 dominio,
110 web, 101 API, 9 SDK); integración 126 pasan y 2 omitidos.
Regresión Chromium del KPI en verde; OpenAPI/SDK regenerados.

## Coordinación y validación de foco

La PR #71 pertenece al agente que sigue trabajando con la auditoría ampliada.
Este trabajo continúa en otra PR acumulativa, sin modificar su rama ni duplicar
TTD-AUD-10 y los cambios 54/55/56/60/61/65 ya iniciados allí.
Una prueba PostgreSQL adicional comprueba iniciar y terminar tras 81 s: se
persisten 81 s y un pomodoro; ambas APIs coinciden para el mismo periodo.
No se reproduce un registro incorrecto de actualSeconds. RF-1204/RF-1205.

## TTD-AUD-22/26: colores del tema

- Regresiones Chromium antes del cambio: texto blanco sobre pasteles en oscuro y números de bajo contraste en claro; acceso ignoraba acentos violeta/verde.
- Paleta de cuentas atrás centralizada en tokens.css, con variantes oscuras; números usan accent-ink y metadatos ink-3. También se corrigen accent-ink/soft oscuros para los cinco acentos alternativos.
- Se comprueban 13 colores × 6 acentos × 2 temas, texto/número/fecha, componiendo alfa sobre el fondo e incluyendo los tres colores del degradado. Umbral ≥4,5:1. Inspección visual local; sin publicar capturas.
- Login probado con violeta/verde; registro comparte el selector, pero el formulario está desactivado por configuración y requiere comprobación si se habilita.
- RF-1903, RF-2402 y RF-2451. Solo CSS/tokens, sin cambios de comportamiento o contrato.

## TTD-AUD-21/23: cabecera y diálogo

- Regresiones antes del cambio: título desktop de dos líneas y casillas apiladas en móvil. Ahora cabecera de una línea; casillas/radios junto al texto y sin desbordamiento horizontal a 360 px.
- Fecha civil con formato explícito ES dd/mm/aaaa y EN mm/dd/yyyy, independiente de la configuración de fecha del navegador. Se rechazan 31/02, años no bisiestos y otros días imposibles; al guardar 23/11/2026 se envía 2026-11-23.
- La API conserva el contrato target_date. Modal y selects ya usan los estilos comunes; no se modifica su comportamiento. El recorte del emoji no se reproduce en las capturas locales revisadas.
- RF-2402, RF-2451, RF-2452 y RF-2453. Regresiones Chromium y siete casos de formato/validación civil.

Validación del bloque 21/22/23/26: typecheck y suites completas (289 dominio,
117 web, 101 API y 9 SDK); lint global comprobado y corrección localizada del
parser civil verificada con lint dirigido. Siete tests de fecha civil y seis
regresiones Chromium en verde. Inspección visual del diálogo a 360 px.

## TTD-AUD-24: menús de cuentas atrás

- Regresión previa confirmada: Escape conservaba el details de Nueva abierto.
- Estado único para crear/tarjeta; ambos usan Popover con ancla, flechas y Escape. Elegir tipo abre el diálogo y cierra el menú; un menú reemplaza al otro y clic fuera lo cierra.
- Escape restaura foco en el disparador; botón común admite ref de React 19 para el ancla. Regresiones del menú de tareas y del diálogo de fecha conservadas. Icono de agrupación cambiado a ListFilter.
- RF-2452, RF-2454 y RF-1902. Sin cambios de API ni de acciones de cuenta atrás.

## TTD-AUD-25: contraste de navegación

- Reproducción confirmada: selección lateral oscura 2,36:1.
- Fondos de hover/selección y tinta del rail pasan a tokens; claro conserva el lateral y el rail oscurece su hover para mantener contraste. Oscuro usa fondo de selección del acento y tinta clara en iconos.
- Doce combinaciones (dos temas, seis acentos): texto lateral seleccionado/hover y botón de tema ≥4,5:1; iconos activos/hover ≥3:1. Medición Chromium compone los fondos semitransparentes sobre sus ancestros.
- Los tokens accent-ink/soft oscuros de los acentos alternativos se corrigieron en el bloque TTD-AUD-22. RF-1903. Sin cambiar estructura ni destinos de navegación.

## Coordinación con #71 y TTD-AUD-34

Revisión de solo lectura de #71 a `1da4a10b7dd7faa7fbf6bd3068f71741cf386182`.
Los estados externos describen código presente en esa PR; requieren validación e
integración y no equivalen a hallazgos cerrados. No se ha enviado ningún commit a
su rama. Quedan huecos declarados allí en 14, 27, 31 y 38.

En Chromium local, `/login` solicitaba `/me` sin sesión y generaba un 401
innecesario. `AccountPreferenceSync` se monta ahora dentro del shell protegido,
conservando la sincronización al entrar. La regresión fallaba por esa petición y
pasa después. No hay errores de JavaScript ni de consola inesperados en la carga
local; el 401 del sondeo explícito `/auth/session` se considera una respuesta
esperada cuando no existe sesión. Esto no identifica retrospectivamente los cuatro
errores sin analizar de la auditoría ni sustituye la comprobación en producción.

Validación: ESLint y TypeScript web; 13 regresiones Chromium de login y contraste
(todas las combinaciones de tema/acento). El test de contraste espera el final de
la aplicación asíncrona de preferencias antes de medir. Sin cambios de contrato,
modelo ni eventos. Complementa el requisito transversal de autenticación de 10.1.

## TTD-AUD-38: paginación de actividad

- SDK: `tokenActivity(id, {cursor, limit})` conserva la llamada anterior sin opciones
  y usa los parámetros públicos existentes. La regresión fallaba al perder cursor
  y límite; los diez tests SDK pasan después del cambio.
- UI: consulta infinita por token, esqueleto inicial, error ES/EN y Reintentar,
  Cargar más, `aria-busy` y región con nombre. Un fallo al cargar la página siguiente
  conserva las entradas previas; Reintentar solicita esa página, sin reiniciar la lista.
- Chromium reproduce error inicial 503, recuperación, segunda página 503 y nueva
  recuperación: aparecen las dos entradas, sin duplicados y sin Cargar más al acabar.
- Sin cambio de API, OpenAPI, modelo ni eventos. RF-2002. La presentación de método,
  ruta, resultado y ciclo de vida sigue en #71; no se declara cerrado el hallazgo.

## TTD-AUD-27: textos de Ticky, Hoy y proyectos

- Textos centrales ES/EN en conversación, permisos, propuestas y rutinas de la UI
  web de ttd. Fechas y días de semana siguen el idioma elegido; sin cambios de
  capacidades ni del servicio Ticky externo (F-1…F-10 siguen excluidos).
- Errores locales del stream traducidos; errores HTTP conservan status y code
  estructurados y muestran un texto del idioma elegido. Los conflictos de rutina
  se reconocen por 409, sin buscar palabras españolas en la frase del servidor.
- Avisos de vencimiento, cuenta atrás de Hoy y contexto de proyectos usan i18n.
- Regresión Chromium falla contra TickyPage anterior y pasa después. Comprueba
  conversación, permisos, rutinas/día de semana, modelo y propuesta inválida en
  inglés; otra prueba verifica Due today. Tests de transporte verifican inglés y
  preservación de código/status. Un guard AST impide textos fijos en JSX y atributos
  accesibles de los cuatro componentes Ticky.
- 120 tests web, ESLint y TypeScript web en verde. Quedan pendientes las razones
  estructuradas de Control y la combinación con cuentas atrás de #71.

## TTD-AUD-31: paleta y calendario

- Paleta: esqueleto y error con Reintentar tanto al cargar listas como al buscar;
  un 503 no se presenta como ausencia de resultados. La regresión también confirmó
  que la lista subyacente interceptaba el clic en Reintentar: la capa fija de la
  paleta usa ahora el nivel de modal existente (50).
- Ajustes de calendario: estados de proyectos, feeds y Google con reintento;
  creación deshabilitada si no se han cargado las listas. No se muestra una píldora
  de desconexión cuando falla la consulta de estado.
- Calendarios Google: carga/error al consultar conexión, calendarios y suscripciones;
  vacío solo cuando ambas consultas terminan correctamente. Datos cacheados se
  conservan al refrescar, sin esqueleto que los sustituya.
- Chromium verifica 503 y recuperación en búsqueda, feeds y Google; confirma que
  el botón de la paleta recibe el clic y aparecen los resultados tras reintentar.
  ESLint y TypeScript web en verde. Sin API, eventos ni modelo nuevos; RF-1502 y
  RF-2004, sobre endpoints públicos existentes.

El rail distingue carga (…) y error (!) de un contador real; el nombre accesible
explica el fallo y ofrece Reintentar desde el mismo botón. La prueba fallaba antes
por no existir ese estado y recupera el contador 1 tras reintentar. RF-901.

## TTD-AUD-27: razones estructuradas de Control

- Dominio conserva la fórmula y el desempate y añade `topDeductionReason` con código
  y parámetros numéricos. La frase antigua se mantiene como campo deprecado, sin
  forzar una ruptura de clientes existentes.
- Contrato documentado en OpenAPI para overview, stats/achievement y
  me/achievements. UI traduce los códigos mediante i18n y elimina las expresiones
  regulares sobre frases españolas. Una respuesta antigua o desconocida usa un
  mensaje traducido que remite al desglose, sin exponer la frase en otro idioma.
- Seis regresiones de dominio fallaban antes por faltar la razón estructurada.
  Cubren los cinco códigos y null al no haber deducción, datos o puntuación activa.
  Siete pruebas de formato cubren ES/EN y datos desconocidos o inválidos.
- Integración PostgreSQL: nueve tests de Estadísticas pasan, incluida la misma
  razón en los tres endpoints. Chromium falla con la UI anterior y pasa con códigos,
  aunque se cambie por completo la frase del servidor. RF-1602 / RF-2321.
- Sin migración ni eventos nuevos: cambia la representación de una lectura;
  no se modifica el cálculo ni la persistencia de la puntuación.

Validación del corte de razones de Control: `pnpm lint`, `pnpm typecheck` y
`pnpm test` completos en verde (295 dominio, 127 web, 101 API y 10 SDK).
Integración completa: 127 pasan, 2 omitidos. OpenAPI y SDK regenerados; segunda
regeneración de OpenAPI idéntica. Formato comprobado en los archivos publicables,
sin modificar los documentos o evidencias locales ajenos al corte.

La ampliación de E2E detectó comprobaciones antiguas adelantadas al diseño final
(malla/overflow de gráficas) y selectores que incluían enlaces ocultos del menú de
cuenta o un summary sustituido por botón. Se conserva cada criterio y se sincroniza
la medición del diseño; los selectores apuntan a los enlaces visibles y al botón
accesible actual. No se ha cambiado el diseño de Estadísticas para satisfacer tests.

Límite de la batería ampliada: el test existente TSK-2 falla en Agenda a 1280 px
cómodo (desviación 2 px; exige ≤1,5). Reproducido también al sustituir temporalmente
todos los fuentes web modificados por su versión de `origin/main`, restaurados
inmediatamente después. No es una regresión de este corte ni se ha relajado el
umbral. Las 35 pruebas de Estadísticas pasan por bloques, y los nuevos tests 27,
31 y 38 pasan; no se declara verde la batería ui-ux-v2 completa por ese fallo previo.

## TTD-AUD-74: creación rápida desde calendario (alcance añadido)

Implementado en esta misma PR por instrucción expresa del usuario. Documento de
alcance: `docs/audit/ttd-codex-calendario-quick-add.md`. RF-1102, RF-102,
RF-601/602/604. No cambia el contrato de API ni las reglas del servidor.

| Criterio                               | Comprobación                                                                                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clic Semana/Día/Varios días y fantasma | Chromium: 13:35 → 13:30; POST inicio 11:30Z, fin 12:00Z, 30 min en Europe/Madrid; tarea aparece a 648 px sin recarga                                                 |
| Mes/Varias semanas y todo el día       | Chromium: celda y fila all-day; medianoche local, celda resaltada y chip pasado con token danger                                                                     |
| Parser gana al hueco                   | Unitario y Chromium: fecha, prioridad, etiqueta y lista explícitas quedan para el parser, sin sobrescribir con el contexto                                           |
| Lista de contexto                      | Selector y parámetro project_id; regresión del rango confirma project_id=context                                                                                     |
| Arrastre                               | Chromium ratón y gesto táctil largo: 09:00–10:30 = 90 min; unitario limita cruce de día y admite selección inversa                                                   |
| Teclado y cierre                       | Enter crea; Escape quita fantasma y devuelve foco; Tab permanece dentro; flechas mueven hora del hueco enfocado                                                      |
| Clic fuera                             | Vacío cierra; con texto/descripción/adjuntos/metadatos conserva el formulario y evita navegación accidental                                                          |
| Más opciones                           | Mismo TaskComposer; conserva título, descripción, fechas, duración, prioridad, lista, etiquetas y archivos. Prueba con nota.txt                                      |
| Móvil y posición                       | Hoja 390×844 con safe area, toque y arrastre largo; prueba en cuatro esquinas y borde derecho de escritorio                                                          |
| Zona y DST                             | Unitarios: medianoche Madrid, repetición 25/10/2026 (ocurrencia posterior), hora inexistente de marzo avanza al primer hueco válido; duración transcurrida coherente |
| Componente                             | Dos tests con composer real: render, foco, Enter, Escape, retorno de foco y expansión del borrador                                                                   |

Validación previa a integrar main: ESLint y TypeScript web; 135 tests web en verde;
12 E2E nuevos y 5 regresiones del composer pasan. Regresión de tarea solo con inicio
restablecida en Agenda; el resto de vistas usa fecha efectiva para mostrar las tareas.
La prueba de clic de Semana fallaba contra Places/HourGrid anteriores, al no abrir
ningún diálogo. `@floating-ui/react` aporta offset/flip/shift y referencia virtual.

El arrastre de varios días en Mes queda fuera de este corte, como permite el
apartado opcional del documento. La hoja admite crear día completo en ambas vistas.
Capturas de pruebas solo locales; no se añaden imágenes/PDF/HTML a esta PR.

Siguiente paso autorizado: integrar main con #71 ya fusionada, resolver conflictos
y repetir validación conjunta. Después se aplica en un commit aparte el nuevo
ajuste de iconos activos/inactivos del rail, conservando la segunda columna.
