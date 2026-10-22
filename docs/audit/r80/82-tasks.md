# TTD-AUD-82 — herramientas de tareas

Regresiones previas: cuatro unitarias y cuatro e2e fallaban por lista ignorada, decisión de hijos ausente, cancelada sin reabrir y parent_id rechazado por el esquema.

Ahora parse:true resuelve nombres sin mayúsculas ni acentos y sin crear listas; la lista explícita prevalece. Al actualizar, se usa la operación de mover existente antes de guardar el resto de campos parseados. Lista desconocida: advertencia y Bandeja o lista actual. quick_add conserva su contrato de captura anterior (creación explícita de nombres desconocidos), fuera de 82.1.

complete_children se anuncia y se propaga; data incluye pending_children, pending_checklist e indicación de reintento. Reabrir también admite canceladas, emite task.reopened y rechaza activas con not_reopenable. No existe cancelled_at en el modelo actual: no se añade una fecha redundante para poder borrarla al reabrir.

parent_id no estaba en PATCH tampoco: se añade al endpoint público, al control de relojes por campo y al catálogo. Reasignar exige mismo propietario/lista, sin ciclos y un nivel. Las escrituras de jerarquía comparten un bloqueo por propietario con la creación de subtareas. La creación histórica de subtareas entre listas conserva RF-205; la nueva operación de reasignación sigue la condición de r80.

Validación local: 4 unitarias MCP, 4 e2e PostgreSQL y contrato de descripción cancel_task. Sin cambios de pantalla en este punto.
