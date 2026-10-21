# Seguimiento de la auditoría TTD

Registro incremental del trabajo solicitado el 21/10/2026. Los hallazgos pendientes
siguen el orden de prioridad de la petición; no se consideran cerrados.

| ID | Estado | PR | Notas |
| --- | --- | --- | --- |
| TTD-AUD-01 | corregido | pendiente de publicación | Fecha efectiva en filtros y filas; inicio/duración en API de vistas y SDK. Tests de dominio, formato, mapeo, SQL e integración. |
| TTD-AUD-02 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-03 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-04 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-05 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-06 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-07 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-08 | aplazado | — | F-1…F-10 excluidos expresamente; solo se abordarán accesos y maquetación de ttd junto a TTD-AUD-07. |
| TTD-AUD-09 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-10 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-11 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-12 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-13 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-14 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-15 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-16 | aplazado | — | Pendiente de reproducción antes de modificar el código. |
| TTD-AUD-17 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-18 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-19 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-20 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-21 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-22 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-23 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-24 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-25 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-26 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-27 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-28 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-29 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-30 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-31 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-32 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-33 | aplazado | — | Pendiente de reproducción antes de modificar el código. |
| TTD-AUD-34 | aplazado | — | Pendiente de reproducción antes de modificar el código. |
| TTD-AUD-35 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-36 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-37 | aplazado | — | Pendiente de reproducción antes de modificar el código. |
| TTD-AUD-38 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-39 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-40 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-41 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-42 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-43 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-44 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-45 | aplazado | — | Pendiente, según el orden de prioridad. |
| TTD-AUD-46 | aplazado | — | Pendiente, según el orden de prioridad. |

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
