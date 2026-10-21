# Panel de tarea: composición y edición fiel

Alcance del bloque 3 del documento del 20/10. RF-201, RF-202, RF-203, RF-207 y RF-1903.

Checkbox junto al título, chips separados de programación, recurrencia, estimación y vencimiento; Algún día dentro del selector existente. Asistente como icono, bandera con prioridad, checklist sin truncar, adjuntos en una única zona y descripción Markdown con edición directa. Se conserva la barra de formato existente y la reparación explícita de contenido repetido.

El borrador del cuerpo se guarda por tarea en almacenamiento local en cada entrada y se restaura al cambiar de tarea o recargar. Solo se elimina cuando el servidor devuelve el mismo contenido. Guardar no colapsa ni transforma texto, saltos ni literales. El redimensionador existente conserva teclado y persistencia; se limita para mantener espacio central.

## Investigación de literales

La capa de compatibilidad `packages/domain/src/open/ticktick.ts` copia `content` sin reemplazos. La exportación en `apps/api/src/modules/transfer/transfer.controller.ts` conserva el campo. El editor recibe texto plano y la previsualización usa react-markdown. No hay evidencia que permita distinguir un `\n` intencional de uno importado. Se conservan ambos caracteres: no se aplica migración ni interpretación global que pueda alterar código del usuario. Los saltos reales se conservan en el editor, los párrafos y las listas.

## Verificación

Cinco pruebas Playwright con API interceptada y datos sintéticos: escritorio 1440, móvil 390, claro y oscuro; borrador tras recargar, chips, checkbox y diálogo accesible. Capturas en `assets/task-detail-2026-10-21/`. TypeScript correcto; validaciones generales y de integración ejecutadas durante el corte.
