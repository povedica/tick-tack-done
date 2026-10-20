# Alta compartida y planificación diaria

RF-101/102/107, RF-601/604, RF-801 y RF-2301/2302. [Alcance actualizado](../spec/alta-tareas-y-plan-dia-2026-10-20.md). Rama `codex/ui-ux-v2-close-findings`, PR #57, por instrucción de Pablo.

## Referencia y causas

Se contrastaron las capturas aportadas y el flujo visible de TickTick en Hoy: campo de título, fecha independiente, menú de prioridad/lista/etiquetas/adjuntos/plantillas/nota y calendario con confirmación. Se inspeccionaron sus menús sin crear ni modificar tareas en TickTick.

En la implementación anterior:

1. Los flotantes se posicionaban respecto a la estrecha botonera de iconos; `.date-popover` heredaba ancho automático y offsets laterales pensados para otro contenedor.
2. Las elecciones de fecha se convertían en texto (`hoy`, `dd/mm`), perdiendo año, duración, repetición y recordatorio. La fecha inicial del selector era siempre vacía.
3. Hoy, TaskList y captura global tenían caminos diferentes de creación, error y foco. La Bandeja vacía ni siquiera renderizaba TaskList y, por tanto, no permitía añadir directamente.
4. El chevrón abría otra captura, en vez de un menú sobre el mismo borrador.
5. La Agenda era una lista sin una composición adecuada. Por ampliación explícita de Pablo, se ha retirado en lugar de restilizarla.

## Implementación

- `TaskComposer` es el único formulario de captura común, integrado también en Bandeja vacía y en la captura global. Conserva NLP y metadatos estructurados; Enter no duplica solicitudes y los errores no descartan el borrador. Los controles de fecha y opciones tienen botones independientes y nombres accesibles.
- Prioridad/lista/etiquetas y las funciones existentes de adjuntos, plantillas, nota, descripción y voz están en el menú. No se simulan funciones sin endpoint. El título permanece editable, con resaltado de los tokens reconocidos y espacio reservado para la botonera.
- `Popover` admite un ancla y portal optativos, sin cambiar el posicionamiento de sus consumidores anteriores. Se reposiciona al cambiar el tamaño, desplazar o ampliar el contenido, y respeta el viewport. El foco vuelve al campo del compositor.
- Recordatorio explícito en `CreateTaskDto`, validación y persistencia atómica reutilizando el mecanismo existente. Se conserva la precedencia de valores explícitos y el scheduler sigue siendo el único materializador. OpenAPI y SDK regenerados.
- Las subidas se reintentan sobre la tarea creada. Las solicitudes de creación conservan su clave de idempotencia al reintentar el mismo borrador. La cola offline guarda el cuerpo estructurado; no se prometen subidas de archivos sin conexión.
- Hoy muestra Planificar mi día en lugar de Agenda y de la propuesta anterior en línea. La revisión diaria reutiliza el aspecto de la semanal: selección, filas compactas, contexto y una barra común. No hay seis botones por tarea.
- La fuente de la sesión se limita a hoy; se incluyen los intervalos de inicio/vencimiento activos y se excluyen vencidas ajenas al día. El dominio conserva esta regla pura; la API expone inicio y señal de recurrencia. Los snapshots anteriores sin señal se consideran no seguros para acciones masivas.
- La vista previa conserva la semántica del motor de planes: Hoy/Mañana cambian el plan, no el vencimiento. Nada se aplica a las tareas antes de Confirmar plan; los estados terminales requieren confirmación con el número exacto. Se pueden quitar decisiones mediante su chip.

## Validación

- `pnpm lint`, `pnpm typecheck`, `pnpm test`: monorepo, Node 26.
- 108 pruebas de integración: cuatro regresiones de este alcance cubren metadatos, recordatorio explícito/ausente/inválido, idempotencia y sesiones solo de hoy con intervalos y recurrentes. Usuarios aislados eliminados al terminar.
- 22 pruebas de navegador: 5 del compositor, 8 de planificación y 9 de regresión de revisión/reportes. Incluyen Hoy/Mañana/Bandeja/lista en 1280 y 390 px, geometría de los menús, regreso del foco, título intacto, fecha explícita, error con borrador conservado, metadatos avanzados y captura global. Planificación verifica exclusión de vencidas de otros días, bloqueo de recurrentes, selección sin acción y confirmación explícita de la sesión.
- Prueba de dominio para planificación por intervalo, exclusión de otras fuentes y señal de recurrencia. Cobertura del dominio por encima del mínimo del proyecto.
- OpenAPI regenerado y SDK generado desde ese contrato. Se conserva aparte el diff previo de documentación del Jardín. Sin migración ni catálogo de eventos nuevo.

## Evidencias sintéticas

| Vista             | Escritorio                                                              | Móvil                                                                  |
| ----------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Hoy, sin Agenda   | [Captura](assets/task-composer-2026-10-20/today-plan-entry-1280.png)    | [Captura](assets/task-composer-2026-10-20/today-plan-entry-390.png)    |
| Fecha de alta     | [Captura](assets/task-composer-2026-10-20/date-today-1280.png)          | [Captura](assets/task-composer-2026-10-20/date-today-390.png)          |
| Opciones          | [Captura](assets/task-composer-2026-10-20/options-1280.png)             | [Captura](assets/task-composer-2026-10-20/options-390.png)             |
| Mañana            | [Captura](assets/task-composer-2026-10-20/date-smart-tomorrow-1280.png) | [Captura](assets/task-composer-2026-10-20/date-smart-tomorrow-390.png) |
| Bandeja           | [Captura](assets/task-composer-2026-10-20/date-inbox-1280.png)          | [Captura](assets/task-composer-2026-10-20/date-inbox-390.png)          |
| Lista             | [Captura](assets/task-composer-2026-10-20/date-list-work-1280.png)      | [Captura](assets/task-composer-2026-10-20/date-list-work-390.png)      |
| Planificar mi día | [Captura](assets/task-composer-2026-10-20/plan-day-1280.png)            | [Captura](assets/task-composer-2026-10-20/plan-day-390.png)            |
| Vista previa      | [Captura](assets/task-composer-2026-10-20/plan-preview-1280.png)        | [Captura](assets/task-composer-2026-10-20/plan-preview-390.png)        |
| Plan vacío        | [Captura](assets/task-composer-2026-10-20/plan-empty-1280.png)          | [Captura](assets/task-composer-2026-10-20/plan-empty-390.png)          |
| Cargando          | [Captura](assets/task-composer-2026-10-20/plan-loading-1280.png)        | [Captura](assets/task-composer-2026-10-20/plan-loading-390.png)        |
| Error             | [Captura](assets/task-composer-2026-10-20/plan-error-1280.png)          | [Captura](assets/task-composer-2026-10-20/plan-error-390.png)          |

[Captura global](assets/task-composer-2026-10-20/global-capture.png).
