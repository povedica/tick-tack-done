# TTD-AUD-83 — rangos y paginación

Reproducción previa: rango con range_field rechazado; api_catalog devolvía cursor numérico; búsqueda no devolvía cursor/items; list_task_comments no aceptaba los parámetros comunes.

- list_tasks y GET /tasks admiten from inclusivo, to exclusivo y range_field due/start/any. Las fechas civiles se interpretan en la zona del usuario; any contempla intervalos que cruzan el rango. Los antiguos due_before/due_after REST conservan su semántica para no alterar los filtros existentes.
- search REST/MCP admite paginación opaca. El REST sin parámetros conserva sus grupos habituales y añade items/next_cursor; con paginación los grupos reflejan la misma página. Se respeta también el allowlist de listas del token en la búsqueda.
- Todos los list_* anuncian limit/cursor y devuelven items/next_cursor. Los cursores keyset existentes se conservan; los listados antes sin paginar usan un offset opaco validado. list_smart_list_tasks mantiene groups y agrega la página plana.
- Cambio incompatible: cursor de api_catalog pasa de número a string base64url. list_notes pasa de array a objeto. Los consumidores deben leer items.

Verificación local: límites de fecha civil/ISO, inicio frente a vencimiento, páginas sin IDs repetidos en search/api_catalog y recorrido de contrato de todos los list_* con un usuario sintético. Se agregan pruebas de cursores inválidos. Sin cambios visuales.
