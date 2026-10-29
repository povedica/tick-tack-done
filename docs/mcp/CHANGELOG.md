# MCP · cambios

## Compartir listas

- Una invitación por email queda `pending` hasta que la persona acepta (`POST /me/share-invitations/{id}/accept`). Un token sigue siendo miembro al momento.
- `share_project` devuelve `status` (`pending` o `accepted`) además de `changed`.
- `list_project_members` (`lists:read`) devuelve los miembros igual que `GET /projects/{id}/members`.
- `share_project` (`lists:write`) comparte por email en dos pasos. Sin `confirm:true` no crea nada y la vista previa no dice si el email tiene cuenta. Con `confirm:true` responde `{shared, member_id, permission, changed}`.
- `unshare_project` (`lists:write`) quita un miembro. Si no hay fila activa, el error es `member_not_found`.
- `POST /projects/{id}/members` ya no responde siempre 201. Crea con 201 (`changed: created`), actualiza el permiso con 200 (`updated`) y, si el permiso es el mismo, responde 200 (`unchanged`). El cuerpo es `{id, permission, changed}`.
- La Bandeja no se puede compartir (`422 inbox_not_shareable`). Un `token_id` tiene que ser de un token activo del dueño.

## Restablecer contraseña

- `api_request` rechaza `/api/v1/auth/*` salvo `GET /api/v1/auth/session` (D-5). El mensaje es `This API path is not available to agents`.
- El catálogo generado ya no incluye login, registro ni `password-reset`.

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
