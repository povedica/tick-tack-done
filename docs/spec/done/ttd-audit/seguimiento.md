# Seguimiento de la auditoría TTD

Registro incremental del trabajo solicitado el 21/10/2026. Los hallazgos pendientes
siguen el orden de prioridad de la petición; no se consideran cerrados.

| ID         | Estado    | PR                                                        | Notas                                                                                                                                                                       |
| ---------- | --------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TTD-AUD-01 | corregido | [#60](https://github.com/povedica/tick-tack-done/pull/60) | Fecha efectiva en filtros y filas; inicio/duración en API de vistas y SDK. Tests de dominio, formato, mapeo, SQL e integración.                                             |
| TTD-AUD-02 | corregido | [#61](https://github.com/povedica/tick-tack-done/pull/61) | Rangos ES/EN, título limpio, inicio y duración; tests del parser y creación real por API, incluidos cambios DST.                                                            |
| TTD-AUD-03 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-04 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-05 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-06 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-07 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-08 | aplazado  | —                                                         | F-1…F-10 excluidos expresamente; solo se abordarán accesos y maquetación de ttd junto a TTD-AUD-07.                                                                         |
| TTD-AUD-09 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-10 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-11 | corregido | [#67](https://github.com/povedica/tick-tack-done/pull/67) | Constructor común API/automatización, lunes local, payload completo v2; test de límite semanal UTC/local con tareas, hábitos y foco. Históricos preservados.                |
| TTD-AUD-12 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-13 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-14 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-15 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-16 | aplazado  | —                                                         | Pendiente de reproducción antes de modificar el código.                                                                                                                     |
| TTD-AUD-17 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-18 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-19 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-20 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-21 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-22 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-23 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-24 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-25 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-26 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-27 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-28 | corregido | [#66](https://github.com/povedica/tick-tack-done/pull/66) | runAction común aplicado a promesas UI sin rechazo; MutationCache global, avisos accesibles ES/EN, rollback y respaldo unhandledrejection; lint no admite void como escape. |
| TTD-AUD-29 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-30 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-31 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-32 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-33 | aplazado  | —                                                         | Pendiente de reproducción antes de modificar el código.                                                                                                                     |
| TTD-AUD-34 | aplazado  | —                                                         | Pendiente de reproducción antes de modificar el código.                                                                                                                     |
| TTD-AUD-35 | corregido | [#63](https://github.com/povedica/tick-tack-done/pull/63) | Activos y revocados paginados; agrupación por ID de aplicación; recuento del servidor excluye rotaciones automáticas. Reproducido con 80 rotaciones y 56 activos.           |
| TTD-AUD-36 | corregido | [#63](https://github.com/povedica/tick-tack-done/pull/63) | Caducidad expuesta desde el modelo existente; estado Caducado en la UI, sin perder la opción de revocar.                                                                    |
| TTD-AUD-37 | corregido | [#62](https://github.com/povedica/tick-tack-done/pull/62) | Reproducido PostgreSQL 25P02; nombre interno OAuth único antes del INSERT, sin reintentos en transacción abortada. Tests de reautorización y choque manual.                 |
| TTD-AUD-38 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-39 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-40 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-41 | corregido | [#64](https://github.com/povedica/tick-tack-done/pull/64) | Utilidad compartida: Gestionar separado de Escritura, Cuenta atrás en formulario y marca de permisos sensibles.                                                             |
| TTD-AUD-42 | corregido | [#64](https://github.com/povedica/tick-tack-done/pull/64) | Sensibles desmarcados, defaults sin webhooks/automatizaciones, internos excluidos, etiquetas ES/EN, componentes y estados de la app.                                        |
| TTD-AUD-43 | corregido | [#65](https://github.com/povedica/tick-tack-done/pull/65) | Reconectar con cuenta conectada; confirmación compartida Google/Drive informa de Calendar y Drive; errores visibles y parámetro de retorno eliminado.                       |
| TTD-AUD-44 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-45 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |
| TTD-AUD-46 | aplazado  | —                                                         | Pendiente, según el orden de prioridad.                                                                                                                                     |

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
