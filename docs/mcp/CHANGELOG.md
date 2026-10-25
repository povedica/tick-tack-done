# MCP · cambios

## Planifica tu día · F

- Herramientas `get_day_plan`, `start_day_plan`, `record_plan_decision`, `apply_day_plan` y `revert_day_plan`.
- Contrato común `action`, `date?`, `time?`, `duration?`; las tareas solo cambian con confirmación explícita.
- `apply_day_plan` muestra la revisión por defecto (`auto_apply:false`); confirmar requiere revisión y clave de idempotencia.
- `get_day_load` admite `days` (1–14) y usa la zona del perfil.
- `replan_day` abre el mismo triaje como alias de volver a planificar.
- Cada herramienta conserva los guards y restricciones del token al pasar por la API pública.
