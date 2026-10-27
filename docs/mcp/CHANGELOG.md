# MCP · cambios

## Carpetas y proyectos

- `list_folders`, `create_folder`, `update_folder` y `delete_folder` (`lists:read` / `lists:write`).
- `update_project`, `set_project_state`, `archive_project`, `unarchive_project` y `delete_project`.
- `create_project` y `list_projects` aceptan carpeta, proyecto y estado. Borrar un proyecto pide archivo previo y `confirm_task_count`.

## Planifica tu día · F

- Herramientas `get_day_plan`, `start_day_plan`, `record_plan_decision`, `apply_day_plan` y `revert_day_plan`.
- Contrato común `action`, `date?`, `time?`, `duration?`; las tareas solo cambian con confirmación explícita.
- `apply_day_plan` muestra la revisión por defecto (`auto_apply:false`); confirmar requiere revisión y clave de idempotencia.
- `get_day_load` admite `days` (1–14) y usa la zona del perfil.
- `replan_day` abre el mismo triaje como alias de volver a planificar.
- Cada herramienta conserva los guards y restricciones del token al pasar por la API pública.
