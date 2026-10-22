# Cambios MCP

## R80 — PR #75 (en desarrollo)

- TTD-AUD-97: `api_request DELETE /integrations/google` revoca la credencial propia y conserva eventos/adjuntos; `remove_imported_events:true` en la query elimina solo eventos Google importados del propietario. Sin cambiar herramientas MCP, OpenAPI y SDK exponen el parámetro.

- TTD-AUD-80: refresh OAuth concurrente e idempotente durante 60 s; access anterior limitado a 120 s; fallos transitorios con 503.
- TTD-AUD-81: recurrence:null cierra la serie del propietario; next_occurrence comparte cálculo de dominio y respeta día completo. warnings incluye anchor_outside_rule y next_matching.
- TTD-AUD-86: sin Google propio, 409 google_not_connected; credencial global ignorada fuera del usuario semilla explícito en desarrollo.
- TTD-AUD-82: create_task/update_task parse:true respetan listas existentes; complete_children y errores con datos de hijos pendientes; reapertura de canceladas; parent_id anulable en update_task; cancel_task aclara historia y papelera. task.reopened sustituye task.uncompleted al reabrir.
- TTD-AUD-83 (incompatible): cursor de api_catalog numérico → string opaco; list_notes array → {items,next_cursor}; todos los list_* comparten forma; search devuelve items/next_cursor y grupos paginados. from inclusivo y range_field=any por defecto.
- TTD-AUD-84: start_focus comparte el ciclo de vida REST; cinco herramientas nuevas pause_focus/resume_focus/finish_focus/abort_focus/get_focus_state, todas con focus:write.
- TTD-AUD-85.1: api_request conserva data.status/code/message/body y los detalles del error REST.
- El catálogo final se actualizará con los puntos restantes; no se declara todavía el total de 75 herramientas.

### TTD-AUD-85
- Versión API 0.2.0 + commit; catálogo con hash Redis persistente y SSE autenticado `notifications/tools/list_changed`.
- Actividad compacta por defecto, con origen y actor en get_task; `include_activity:full` conserva el detalle anterior.
- `discard_replan` descarta un borrador propio sin modificar tareas. Una replanificación vacía no crea sesión.
- Recordatorios normalizados a duración ISO; rangos NLP tienen inicio, fin y duración. Origen `mcp` explícito en capturas y aislamiento.

### TTD-AUD-99 (corte de código)
- `list_task_attachments` devuelve metadatos de Drive, enlaces, origen y disponibilidad; no binarios.
- Nuevas `link_drive_file` y `remove_task_attachment`; quitar conserva el fichero salvo trash_in_drive:true.
- `api_request` transmite multipart por fragmentos (25 MiB/fichero); no genera un archivo ni una copia completa del binario.
- No Drive: 409 drive_not_connected con connect_url; token revocado: 409 drive_reauth_required.
- GET de un adjunto redirige a Drive; miniatura binaria retirada, nueva preview 302/no-store.

## TTD-AUD-100

Añade list_task_links, add_task_link y remove_task_link. get_task incluye links; catálogo de 72 herramientas (69 anteriores + 3). Enlaces independientes de Drive, autenticación/scopes y owner conservados.

## TTD-AUD-101

Añade update_focus_settings (focus:write) mediante PUT /focus/settings; get_focus_state.settings expone auto-inicios, sonido, volumen, ambiente y meta. Catálogo 73 herramientas.

## TTD-AUD-102

Añade get_notification_settings y send_test_notification (profile:read, destino propio); no existe herramienta de escritura de matriz. Catálogo 75 herramientas.
