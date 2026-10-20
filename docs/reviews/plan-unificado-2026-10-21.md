# Entrada única de Plan del día

RF-2301, RF-2670/2671 y ampliación del documento del 20/10.

`/plan/day` consulta el plan persistido: sin aplicaciones abre la revisión inicial existente; con plan aplicado abre ajuste de pendientes si `day_replan` está activo. Desactivarlo mantiene la planificación básica. `/replan` redirige a la entrada común. Hoy tiene una sola acción y muestra hora/ajustes con datos del servidor. Cerrar el día permanece fuera por petición explícita; su ruta sigue funcionando.

El ajuste conserva pendientes sin decisión. Las sugerencias son informativas hasta seleccionarlas; muestra decisiones antes de aplicar y un único botón de aplicación. Se mantienen ambas clases de sesión. Los clientes anteriores y MCP conservan la selección automática de sugerencias por defecto; la pantalla nueva usa `apply_suggestions:false`.

## Persistencia y concurrencia

Se reutilizan PlanSession/PlanOperation: el endpoint público GET /plans devuelve `initial_applied_at`, `last_applied_at`, `adjustment_count` derivados de operaciones aplicadas persistidas. No es almacenamiento del navegador. Primera aplicación no suma ajuste; las posteriores suman una por aplicación con efectos reales; abrir, replays y aplicaciones vacías no suman. Los cierres se excluyen. Las decisiones sin cambio se identifican como `unchanged`.

Ambos motores serializan aplicaciones por owner con advisory lock transaccional de PostgreSQL. Conservan revisión esperada y operaciones reanudables/idempotentes. El ajuste comprueba además que la tarea no haya cambiado desde la vista previa. No toca completadas ni vencimientos.

Sin migración: los datos necesarios ya se persisten en operaciones y sesiones. No se modifica puntuación, racha ni el catálogo de eventos.

## Pruebas

109 pruebas de integración correctas, incluida concurrencia del mismo apply, primer guardado vacío, consulta sin cambios, ajuste real, replay y aplicación posterior vacía. 18 pruebas de navegador entre entrada/ajuste, revisión diaria y Hoy, con datos sintéticos; cuatro capturas del ajuste en 1440/390 y claro/oscuro. Lint, TypeScript y OpenAPI/SDK regenerados.
