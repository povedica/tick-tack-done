# Cambios MCP

## R80 — PR #75 (en desarrollo)

- TTD-AUD-80: refresh OAuth concurrente e idempotente durante 60 s; access anterior limitado a 120 s; fallos transitorios con 503.
- TTD-AUD-81: recurrence:null cierra la serie del propietario; next_occurrence comparte cálculo de dominio y respeta día completo. warnings incluye anchor_outside_rule y next_matching.
- TTD-AUD-86: sin Google propio, 409 google_not_connected; credencial global ignorada fuera del usuario semilla explícito en desarrollo.
- TTD-AUD-82: create_task/update_task parse:true respetan listas existentes; complete_children y errores con datos de hijos pendientes; reapertura de canceladas; parent_id anulable en update_task; cancel_task aclara historia y papelera. task.reopened sustituye task.uncompleted al reabrir.
- TTD-AUD-83 (incompatible): cursor de api_catalog numérico → string opaco; list_notes array → {items,next_cursor}; todos los list_* comparten forma; search devuelve items/next_cursor y grupos paginados. from inclusivo y range_field=any por defecto.
- El catálogo final se actualizará con los puntos restantes; no se declara todavía el total de 75 herramientas.
