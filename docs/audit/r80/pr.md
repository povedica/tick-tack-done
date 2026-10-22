# TTD-AUD-80–104: fiabilidad MCP/API, calendario y mejoras

PR única por petición de Pablo. **En desarrollo**: no se presenta como completada mientras haya criterios pendientes.

Base actualizada: `afc9f5d`. [Comprobación previa](docs/audit/r80/verificacion-previa.md). Se han preservado los cambios locales del usuario en un checkout aislado.

## Criterios de aceptación

|ID|Criterio|Resultado|Evidencia|
|---|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------|---------|
|80|e2e `oauth-refresh.e2e-spec.ts`:|✅ PostgreSQL local, Node 26; pruebas unitarias/e2e|[OAuth](docs/audit/r80/80-oauth.md)|
|80|Un `GET /api/v1/me` con el access anterior funciona hasta 120 s después de la rotación y da 401 después.|✅ PostgreSQL local, Node 26; pruebas unitarias/e2e|[OAuth](docs/audit/r80/80-oauth.md)|
|80|Un fallo simulado de Prisma en el refresh → 503 `temporarily_unavailable` con `Retry-After`.|✅ PostgreSQL local, Node 26; pruebas unitarias/e2e|[OAuth](docs/audit/r80/80-oauth.md)|
|80|Desplegar en staging con un cliente MCP conectado y reiniciar el API → el cliente sigue funcionando sin reautorizar. Adjunta el log a la PR.|❌ pendiente de implementación/verificación|—|
|81|e2e: crear diaria → completar (→ ocurrencia 2) → `recurrence:null` en la 2 → avanzar el reloj del planificador 2 ciclos → **ninguna** tarea nueva en la serie.|✅ e2e PostgreSQL; Playwright 1280×800/390×844, claro/oscuro|[Recurrencia](docs/audit/r80/81-recurrence.md)|
|81|e2e: diaria de día completo → `complete_task` → `next_occurrence` = medianoche local del día siguiente, igual a `series.next_due_date`.|✅ e2e PostgreSQL; Playwright 1280×800/390×844, claro/oscuro|[Recurrencia](docs/audit/r80/81-recurrence.md)|
|81|Martes con `BYDAY=MO` → `warnings` con `anchor_outside_rule`. En la web (1280×800 y 390×844) se ve el aviso a ≤ 4 px del selector, en `--fs-xs` y color `--warning`. Capturas antes/después.|✅ e2e PostgreSQL; Playwright 1280×800/390×844, claro/oscuro|[Recurrencia](docs/audit/r80/81-recurrence.md)|
|81|`--dry-run` sobre una copia de producción lista las series huérfanas; el resultado va en la PR.|❌ pendiente de implementación/verificación|—|
|82|`create_task {title:"Llamar ^Grokbot-ticktackdone", parse:true}` → `project_id` de esa lista; con `^NoExiste` → Bandeja + `warnings.list_not_found`.|✅ Node 26/PostgreSQL; unitarias y e2e MCP|[Evidencia](docs/audit/r80/82-tasks.md)|
|82|`complete_task {id, complete_children:'complete'}` con checklist → 200 y checklist completa; sin el parámetro → error con `data.pending_checklist`.|✅ Node 26/PostgreSQL; unitarias y e2e MCP|[Evidencia](docs/audit/r80/82-tasks.md)|
|82|`reopen_task` sobre cancelada → `status:'active'`, y aparece en Actividad.|✅ Node 26/PostgreSQL; unitarias y e2e MCP|[Evidencia](docs/audit/r80/82-tasks.md)|
|82|`update_task {parent_id}` crea la relación y `{parent_id:null}` la quita; con un ciclo → `invalid_parent`.|✅ Node 26/PostgreSQL; unitarias y e2e MCP|[Evidencia](docs/audit/r80/82-tasks.md)|
|83|Tarea de día completo del 22 → sale con `from=2026-10-22` y con `from=2026-10-22T00:00:00+02:00`.|✅ Node 26/PostgreSQL; unitarias y e2e MCP|[Evidencia](docs/audit/r80/83-pagination.md)|
|83|Tarea con `start_date` el 22 y `due` el 25 → sale con `[22, 23)` y `range_field:any`; no sale con `range_field:'due'`.|✅ Node 26/PostgreSQL; unitarias y e2e MCP|[Evidencia](docs/audit/r80/83-pagination.md)|
|83|`search {query:'prueba', limit:2}` → `next_cursor` no nulo; la segunda página no repite IDs.|✅ Node 26/PostgreSQL; unitarias y e2e MCP|[Evidencia](docs/audit/r80/83-pagination.md)|
|83|`list_notes` y `api_catalog` → `{items, next_cursor}` (test de contrato que recorre **todos** los `list_*`).|✅ Node 26/PostgreSQL; unitarias y e2e MCP|[Evidencia](docs/audit/r80/83-pagination.md)|
|84|Sesión de 28 s terminada → `elapsed_seconds` = 28 ±1 al consultarla 1 h después.|✅ Node 26/PostgreSQL; Playwright real MCP/API/web, 1280×800/390×844 y ambos temas|[Evidencia](docs/audit/r80/84-focus.md)|
|84|`start_focus {task_id}` → la sesión aparece en el Foco de la web ligada a la tarea; `pause_focus` y `resume_focus` se reflejan en la web en ≤ 2 s.|✅ Node 26/PostgreSQL; Playwright real MCP/API/web, 1280×800/390×844 y ambos temas|[Evidencia](docs/audit/r80/84-focus.md)|
|84|Captura de la web (1280×800) con la sesión iniciada por MCP.|✅ Node 26/PostgreSQL; Playwright real MCP/API/web, 1280×800/390×844 y ambos temas|[Evidencia](docs/audit/r80/84-focus.md)|
|86|e2e: con `GOOGLE_REFRESH_TOKEN` definida y un usuario B sin Google → `POST /integrations/drive/attachments` y `GET /calendar/google/*` → 409 `google_not_connected` (hoy, 200 con la cuenta ajena).|✅ unitarias/e2e; sin llamada a Google con credencial ajena|[Google](docs/audit/r80/86-google.md)|
|86|Al arrancar en producción con la variable definida, el log muestra `GOOGLE_REFRESH_TOKEN ignored in production`.|✅ unitarias/e2e; sin llamada a Google con credencial ajena|[Google](docs/audit/r80/86-google.md)|
|86|La PR indica si la variable estaba definida en producción (sí/no) y qué se hizo.|✅ producción en lectura: variable ausente (unset); no hubo que retirarla|[Google](docs/audit/r80/86-google.md)|
|87|1280×800: no existe `.day-week-strip`; la cabecera de la columna mide 44 ±1 px; el título es «22 de octubre de 2026».|❌ pendiente de implementación/verificación|—|
|87|390×844: la tira existe, mide 48 ±1 px y al tocar un día cambia la columna y la URL (`?date=`).|❌ pendiente de implementación/verificación|—|
|87|Dos eventos de 10:00 a 11:00 → dos bloques lado a lado, cada uno de ≈ (ancho − 2)/2 ±2 px.|❌ pendiente de implementación/verificación|—|
|87|Capturas antes/después en escritorio y móvil, claro y oscuro.|❌ pendiente de implementación/verificación|—|
|88|1280×800: la rejilla llega a ≤ 8 px del borde inferior del área de contenido **[medible]**; cada fila mide ≥ 300 px.|❌ pendiente de implementación/verificación|—|
|88|390×844: ninguna zona vacía de más de 16 px bajo la rejilla.|❌ pendiente de implementación/verificación|—|
|88|Una celda con 6 tareas → las que caben más «+N»; al pulsar «+N» se abre el popover del día.|❌ pendiente de implementación/verificación|—|
|88|Capturas antes/después.|❌ pendiente de implementación/verificación|—|
|89|Bloques de 30, 15 y 60 min: `scrollHeight <= clientHeight` en el contenedor del texto **[medible]**.|❌ pendiente de implementación/verificación|—|
|89|Captura antes/después del zoom de un bloque de 30 min.|❌ pendiente de implementación/verificación|—|
|90|390×844: abrir la fecha desde el composer y desde el detalle → la hoja ocupa los 390 px de ancho; `boundingBox().x = 0`; el borde inferior queda a ≤ 1 px del final del viewport **[medible]**.|❌ pendiente de implementación/verificación|—|
|90|390×844 con el teclado emulado (`visualViewport` reducido a 500 px) → la hoja no se corta.|❌ pendiente de implementación/verificación|—|
|90|1280×800: el popover sigue anclado y queda entero dentro del viewport en los cuatro bordes (con el ancla pegada a cada borde).|❌ pendiente de implementación/verificación|—|
|90|Capturas antes/después en móvil (composer y detalle), claro y oscuro.|❌ pendiente de implementación/verificación|—|
|91|1280×800, Hoy sin selección: la lista ocupa todo el ancho tras el sidebar (`main.width` = 1280 − rail − sidebar ±1 px) **[medible]**; no existe `.detail-empty` en el DOM.|❌ pendiente de implementación/verificación|—|
|91|Al hacer clic en una tarea, el panel aparece con el ancho guardado; con Esc desaparece y el foco vuelve a la fila.|❌ pendiente de implementación/verificación|—|
|91|Capturas antes/después de Hoy y de una lista (Casa), con y sin selección.|❌ pendiente de implementación/verificación|—|
|92|En Hoy, con «+» del rail, N o BottomBar → el chip dice «Hoy». Al guardar, la tarea aparece en Hoy sin recargar.|❌ pendiente de implementación/verificación|—|
|92|En la lista Casa → el chip de lista dice «Casa»; en la etiqueta #r80 → la etiqueta preseleccionada.|❌ pendiente de implementación/verificación|—|
|92|Test unitario de `composerContextFor` para cada fila de la tabla.|❌ pendiente de implementación/verificación|—|
|92|Capturas antes/después a 1280×800 y 390×844.|❌ pendiente de implementación/verificación|—|
|93|1280×800: el sidebar muestra las 5 secciones; desmarcar una lista oculta sus tareas en Semana y Mes en ≤ 200 ms sin recargar; recargar la página conserva el filtro.|✅ 8 Playwright: 1280×800/390×844, claro/oscuro; filas y filtrado medidos|[Evidencia](docs/audit/r80/93.md)|
|93|No queda ningún `input[type=date]` en `features/places` ni en `features/calendar` (lo comprueba un test del DOM).|✅ 8 Playwright: 1280×800/390×844, claro/oscuro; filas y filtrado medidos|[Evidencia](docs/audit/r80/93.md)|
|93|Capturas antes/después del sidebar y del selector de periodo, en escritorio y móvil.|✅ 8 Playwright: 1280×800/390×844, claro/oscuro; filas y filtrado medidos|[Evidencia](docs/audit/r80/93.md)|
|94|Con 17 vencidas y 1 de hoy → el plan ofrece 18 candidatas por defecto.|✅ 7 unitarias, 7 e2e HTTP, 36 Playwright: 18/1 candidatas y persistencia|[Evidencia](docs/audit/r80/94.md)|
|94|Desmarcar «Vencidas» → 1 candidata y el aviso «17 vencidas quedan fuera».|✅ 7 unitarias, 7 e2e HTTP, 36 Playwright: 18/1 candidatas y persistencia|[Evidencia](docs/audit/r80/94.md)|
|94|Capturas antes/después en escritorio y móvil.|✅ 7 unitarias, 7 e2e HTTP, 36 Playwright: 18/1 candidatas y persistencia|[Evidencia](docs/audit/r80/94.md)|
|95|Un test de dominio con un conjunto conocido → las dos cifras y la fórmula coinciden con el tooltip.|✅ dominio 126/16/24, fallback y 12 Playwright; 1280×800/390×844 claro/oscuro|[Evidencia](docs/audit/r80/95.md)|
|95|En el Reporte de la semana actual se ven las barras por día y no aparece «Sin detalle diario verificable».|✅ dominio 126/16/24, fallback y 12 Playwright; 1280×800/390×844 claro/oscuro|[Evidencia](docs/audit/r80/95.md)|
|95|Capturas antes/después de Estadísticas y del Reporte (semana actual y anterior).|✅ dominio 126/16/24, fallback y 12 Playwright; 1280×800/390×844 claro/oscuro|[Evidencia](docs/audit/r80/95.md)|
|97|El diálogo muestra los tres efectos; «Cancelar» no cambia nada.|✅ 7 unitarias, 2 e2e PostgreSQL, 4 Playwright; ambos viewports/temas|[Evidencia](docs/audit/r80/97.md)|
|97|Tras confirmar: `googleRefreshToken = null`, la llamada a `revoke` se hace (mock en el test) y los adjuntos existentes se siguen abriendo en Drive.|✅ 7 unitarias, 2 e2e PostgreSQL, 4 Playwright; ambos viewports/temas|[Evidencia](docs/audit/r80/97.md)|
|97|Capturas antes/después de la tarjeta y del diálogo, en escritorio y móvil.|✅ 7 unitarias, 2 e2e PostgreSQL, 4 Playwright; ambos viewports/temas|[Evidencia](docs/audit/r80/97.md)|
|98|Playwright con `performance.now()` desde la navegación hasta el primer `[data-agenda-day]` → ≤ 3000 ms en CI (frío) y ≤ 1500 ms en la segunda visita.|✅ performance.now sobre bundle de producción local; cuatro viewports/temas, sin reproducir 20 s|[Waterfall y límites](docs/audit/r80/98.md)|
|98|Waterfall antes/después en la PR.|✅ performance.now sobre bundle de producción local; cuatro viewports/temas, sin reproducir 20 s|[Waterfall y límites](docs/audit/r80/98.md)|
|99|**Nada en el servidor:**|❌ pendiente de implementación/verificación|—|
|99|**BD:** `SELECT column_name FROM information_schema.columns WHERE table_name='attachments'` **no** devuelve `storage_key`, `thumbnail_key` ni ninguna columna `bytea`.|❌ pendiente de implementación/verificación|—|
|99|**Subida web directa:** en la pestaña de red de DevTools, el `PUT` del binario va a `www.googleapis.com/upload/drive/v3/…` y **ninguna** petición a `todo.reflexionia.com` lleva más de 4 KB de cuerpo. Captura del waterfall en la PR.|❌ pendiente de implementación/verificación|—|
|99|El fichero aparece en `Mi unidad/tick-tack-done/<lista>`. Captura de Drive (sin datos personales).|❌ pendiente de implementación/verificación|—|
|99|**Sin Drive:** botón deshabilitado con tooltip y CTA (captura a 1280×800 y 390×844); `api_request POST /tasks/{id}/attachments` → `409 drive_not_connected`.|❌ pendiente de implementación/verificación|—|
|99|**Token revocado** (revocar en Google la app de pruebas) → la tarjeta dice «Reconectar» y la API responde `409 drive_reauth_required`.|❌ pendiente de implementación/verificación|—|
|99|**Chips:** altura 24 ±1 px en escritorio y 32 ±1 px en móvil **[medible]**; un clic abre `webViewLink` en una pestaña nueva; la vista previa responde 302 con `no-store` (test).|❌ pendiente de implementación/verificación|—|
|99|**Quitar:** sin casilla, el fichero sigue en Drive; con casilla, el fichero está en la papelera de Drive.|❌ pendiente de implementación/verificación|—|
|99|**Al desconectar Google:** el chip sigue abriendo Drive y «Adjuntar» queda deshabilitado.|❌ pendiente de implementación/verificación|—|
|99|Copia de seguridad nueva sin `attachments.tar.gz`; la exportación JSON solo tiene metadatos.|❌ pendiente de implementación/verificación|—|
|99|La guardia de CI del paso 6 está activa y en verde.|❌ pendiente de implementación/verificación|—|
|99|Capturas antes/después de la sección «Adjuntos y enlaces» con y sin Drive, en escritorio y móvil, claro y oscuro.|❌ pendiente de implementación/verificación|—|
|100|Una tarea con «ver https://example.com/a y www.ttd.dev.» → 2 chips; editar el texto y quitar una URL → 1 chip.|✅ pruebas locales dominio/API/MCP y Playwright 1280×800/390×844 × claro/oscuro|[Informe](docs/audit/r80/100.md)|
|100|Un enlace manual a `javascript:alert(1)` → error de validación; a `http://169.254.169.254/` → se guarda, pero sin _unfurl_. Test SSRF con 10.0.0.1, ::1 y una redirección a una IP privada.|✅ pruebas locales dominio/API/MCP y Playwright 1280×800/390×844 × claro/oscuro|[Informe](docs/audit/r80/100.md)|
|100|Chips de 24 px en escritorio y 32 px en móvil **[medible]**; la fila de la lista muestra «🔗 2».|✅ pruebas locales dominio/API/MCP y Playwright 1280×800/390×844 × claro/oscuro|[Informe](docs/audit/r80/100.md)|
|100|Con MCP: `add_task_link` → sale en `get_task.links` y en la web sin recargar en ≤ 2 s (_refetch_).|✅ pruebas locales dominio/API/MCP y Playwright 1280×800/390×844 × claro/oscuro|[Informe](docs/audit/r80/100.md)|
|100|Capturas antes/después.|✅ pruebas locales dominio/API/MCP y Playwright 1280×800/390×844 × claro/oscuro|[Informe](docs/audit/r80/100.md)|
|101|Cambiar el pomo a 45 en Ajustes > Foco → el reloj muestra 45:00 sin recargar; en otra pestaña, ≤ 5 s después (_refetch on focus_).|✅ pruebas locales ciclo/DTO/MCP, PostgreSQL y 8 Playwright; [límites](docs/audit/r80/101.md)|[Informe](docs/audit/r80/101.md)|
|101|Con «Empezar el descanso automáticamente» activado, al acabar un pomo de 1 min (en test) empieza el descanso en ≤ 1 s.|✅ pruebas locales ciclo/DTO/MCP, PostgreSQL y 8 Playwright; [límites](docs/audit/r80/101.md)|[Informe](docs/audit/r80/101.md)|
|101|Los presets se ven bajo el reloj (28 ±1 px de alto) **[medible]**; elegir 15 deja 15:00.|✅ pruebas locales ciclo/DTO/MCP, PostgreSQL y 8 Playwright; [límites](docs/audit/r80/101.md)|[Informe](docs/audit/r80/101.md)|
|101|Fuera de rango (pomo de 200) → error de validación en la UI y 400 en la API.|✅ pruebas locales ciclo/DTO/MCP, PostgreSQL y 8 Playwright; [límites](docs/audit/r80/101.md)|[Informe](docs/audit/r80/101.md)|
|101|Capturas antes/después de Foco y de Ajustes > Foco, en escritorio y móvil, claro y oscuro.|✅ pruebas locales ciclo/DTO/MCP, PostgreSQL y 8 Playwright; [límites](docs/audit/r80/101.md)|[Informe](docs/audit/r80/101.md)|
|102|1280×800: la matriz se ve entera sin desplazamiento horizontal; 390×844: las columnas van fijas y las filas se desplazan, sin cortes.|✅ validación local dominio, PostgreSQL y Playwright 1280×800/390×844 × claro/oscuro|[Informe y límites](docs/audit/r80/102.md)|
|102|Desactivar «Telegram × Recordatorios» y crear un recordatorio a 1 min → llega por push y no por Telegram; el historial muestra Telegram `skipped` con el motivo `disabled_by_user`.|✅ validación local dominio, PostgreSQL y Playwright 1280×800/390×844 × claro/oscuro|[Informe y límites](docs/audit/r80/102.md)|
|102|«Probar» en cada canal → llega en ≤ 10 s y en la UI sale «Enviado ✓»; con Telegram sin vincular, el botón queda deshabilitado con la explicación.|❌ recepción real externa ≤10 s pendiente; endpoint propio validado con transportes falsos|[Informe y límites](docs/audit/r80/102.md)|
|102|Horas de silencio de 22:00 a 08:00 y un recordatorio a las 23:00 → push con `skipped` (motivo `quiet_hours`) y reprogramado a las 08:00.|✅ validación local dominio, PostgreSQL y Playwright 1280×800/390×844 × claro/oscuro|[Informe y límites](docs/audit/r80/102.md)|
|102|«Completar» desde la notificación push → la tarea queda completada (e2e con el _service worker_ en Playwright).|✅ API transaccional y SW registrado con OS simulado; ❌ recepción/clic OS real no demostrado|[Informe y límites](docs/audit/r80/102.md)|
|102|Capturas antes/después, en escritorio y móvil, claro y oscuro.|✅ validación local dominio, PostgreSQL y Playwright 1280×800/390×844 × claro/oscuro|[Informe y límites](docs/audit/r80/102.md)|
|103|1280×800: se ven el QR (160 ±2 px) y el botón «Abrir Telegram»; el `href` empieza por `https://t.me/` y lleva `?start=` con el código.|✅ unitarias, e2e Telegram falso y cuatro Playwright locales; proveedor real pendiente|[Informe](docs/audit/r80/103.md)|
|103|390×844: sin QR; el botón tiene 44 px de alto y abre la app de Telegram.|✅ unitarias, e2e Telegram falso y cuatro Playwright locales; proveedor real pendiente|[Informe](docs/audit/r80/103.md)|
|103|e2e con un falso Telegram: `/start <código>` → la web pasa a «Conectado como @test» en ≤ 3 s sin recargar.|✅ unitarias, e2e Telegram falso y cuatro Playwright locales; proveedor real pendiente|[Informe](docs/audit/r80/103.md)|
|103|Simular un 403 de bloqueo → `status='blocked'`, con el aviso en la tarjeta y en la matriz.|✅ unitarias, e2e Telegram falso y cuatro Playwright locales; proveedor real pendiente|[Informe](docs/audit/r80/103.md)|
|103|Desvincular → la tarjeta vuelve al estado inicial; un envío posterior queda `skipped`, motivo `not_linked`.|✅ unitarias, e2e Telegram falso y cuatro Playwright locales; proveedor real pendiente|[Informe](docs/audit/r80/103.md)|
|103|Capturas antes/después de los tres estados (sin vincular, vinculado y bloqueado), en escritorio y móvil.|✅ unitarias, e2e Telegram falso y cuatro Playwright locales; proveedor real pendiente|[Informe](docs/audit/r80/103.md)|
|104|Muestra `acd7570`, o el commit desplegado, para el API, y el de la web.|❌ pendiente de implementación/verificación|—|
|104|«Copiar diagnóstico» copia un texto sin `@` ni `Bearer` (test).|❌ pendiente de implementación/verificación|—|
|104|Captura en escritorio y móvil.|❌ pendiente de implementación/verificación|—|

|96.1|Duración en una línea y reducción si no cabe|✅ boundingBox, resize a 50 px y title; ambos viewports/temas|[Evidencia](docs/audit/r80/96.md)|
|96.2|Plurales 0/1/2 es/en|✅ Intl.PluralRules unitario y singular visible en Hoy|[Evidencia](docs/audit/r80/96.md)|
|96.3|Pestañas sin salto y altura fija|✅ 36 px exactos antes/después del cambio; área táctil 44 px|[Evidencia](docs/audit/r80/96.md)|
|96.4|JSON pre de 12 px, scroll y copiar exacto|✅ Playwright comprueba estilos, scroll y clipboard|[Evidencia](docs/audit/r80/96.md)|
|96.5|Título de 120 caracteres en dos líneas y apertura completa|✅ móvil: alto >1 y ≤2 líneas; detalle conserva texto|[Evidencia](docs/audit/r80/96.md)|
|96.6|Minicalendario y cajón a escala 3|✅ antes 24×23,859, después 49,28×44 px; cajón 844/auto|[Evidencia](docs/audit/r80/96.md)|

## Decisiones

- Una PR frente a las tres propuestas en el documento, por instrucción expresa del usuario.
- No se borran volúmenes ni ficheros de producción. Los pasos de retirada de adjuntos tienen aprobación de Pablo como condición final de borrado.
- Se conserva detalle modal de Calendario y panel de Hoy/listas. RF y conflictos de especificación anotados en la comprobación previa.

## Validación

Pendiente: lint, typecheck, unitarias, integración, Playwright, regeneración de contratos, evidencias antes/después y mediciones. Los resultados se actualizarán con cada corte.

## Evidencias visuales (en progreso)

|ID / pantalla|Escritorio claro antes / después|Escritorio oscuro antes / después|Móvil claro antes / después|Móvil oscuro antes / después|
|---|---|---|---|---|
|81_ancla-repeticion|[antes](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/81_ancla-repeticion_antes_desktop_light.png) / [despues](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/81_ancla-repeticion_despues_desktop_light.png)|[antes](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/81_ancla-repeticion_antes_desktop_dark.png) / [despues](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/81_ancla-repeticion_despues_desktop_dark.png)|[antes](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/81_ancla-repeticion_antes_mobile_light.png) / [despues](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/81_ancla-repeticion_despues_mobile_light.png)|[antes](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/81_ancla-repeticion_antes_mobile_dark.png) / [despues](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/81_ancla-repeticion_despues_mobile_dark.png)|
|84_foco|[antes](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/84_foco_antes_desktop_light.png) / [despues](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/84_foco_despues_desktop_light.png)|[antes](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/84_foco_antes_desktop_dark.png) / [despues](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/84_foco_despues_desktop_dark.png)|[antes](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/84_foco_antes_mobile_light.png) / [despues](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/84_foco_despues_mobile_light.png)|[antes](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/84_foco_antes_mobile_dark.png) / [despues](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/84_foco_despues_mobile_dark.png)|
|84_foco-mcp|[antes](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/84_foco-mcp_antes_desktop_light.png) / [despues](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/84_foco-mcp_despues_desktop_light.png)|[antes](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/84_foco-mcp_antes_desktop_dark.png) / [despues](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/84_foco-mcp_despues_desktop_dark.png)|[antes](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/84_foco-mcp_antes_mobile_light.png) / [despues](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/84_foco-mcp_despues_mobile_light.png)|[antes](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/84_foco-mcp_antes_mobile_dark.png) / [despues](https://github.com/povedica/tick-tack-done/blob/codex/ttd-aud-80-104/docs/audit/evidencias/r80/84_foco-mcp_despues_mobile_dark.png)|

### Corte de robustez MCP (85)

|ID|Criterio|Resultado|Evidencia|
|---|---|---|---|
|85.1|Error API original|✅ 404 task_not_found preservado, e2e HTTP real|[85](docs/audit/r80/85.md)|
|85.2|Actividad y origen|✅ 3 actividades con mcp y actor|mcp.e2e-spec.ts|
|85.3|Versión y catálogo|✅ Versión manifiesto+commit, hash sensible a adiciones, Redis y SSE autenticado|mcp-revision.spec.ts, mcp.e2e-spec.ts|
|85.4|Replan vacío y descarte|✅ No crea vacío; descarta borrador manteniendo auditoría|mcp.e2e-spec.ts|
|85.5|Triggers|✅ Ambos formatos almacenan -PT15M|trigger.spec.ts, mcp.e2e-spec.ts|
|85.6|Reparar fechas heredadas|❌ Falta copia de producción; dry-run local: 0. Script con backup previo y tests de zona|repair-allday-utc.ts|
|85.7|Rangos NLP|✅ Inicio, fin y duración; creación/edición coherentes|parse.spec.ts, mcp.e2e-spec.ts|
|85.8|Respuestas compactas|✅ <2048 bytes tras 4 cambios; detalle completo opt-in|mcp.service.spec.ts, mcp.e2e-spec.ts|

Migración del origen MCP: bajada y reaplicación verificadas en ttd_r80. Inventario de adjuntos (paso 1, commit separado): 0 filas y 0 bytes en la base y volumen aislados. No se ha retirado almacenamiento de producción.

### Inventario de adjuntos en producción

✅ `attachments-inventory --dry-run`, transacción READ ONLY: **0 filas / 0 bytes referenciados; 4 ficheros / 201 bytes en el volumen**. No se leyó contenido ni se imprimieron nombres. **No se ha borrado ningún fichero ni volumen**; los cuatro restos sin referencia se conservan hasta el OK de Pablo. [Resultado agregado](docs/audit/r80/99-inventario-produccion.json).

La comprobación de los scripts sobre una copia de producción sigue ❌ pendiente: el control automático rechazó exportar la BD a un destino local por posible contenido sensible y falta de autorización expresa. **No se exportó nada**. Esto no afecta al inventario agregado, que ya terminó en modo READ ONLY.

### Capturas 98 y 100

|Pantalla|Antes escritorio claro|Después escritorio claro|Antes escritorio oscuro|Después escritorio oscuro|Antes móvil claro|Después móvil claro|Antes móvil oscuro|Después móvil oscuro|
|---|---|---|---|---|---|---|---|---|
|98 agenda|[antes](docs/audit/evidencias/r80/98_agenda_antes_desktop_light.png)|[despues](docs/audit/evidencias/r80/98_agenda_despues_desktop_light.png)|[antes](docs/audit/evidencias/r80/98_agenda_antes_desktop_dark.png)|[despues](docs/audit/evidencias/r80/98_agenda_despues_desktop_dark.png)|[antes](docs/audit/evidencias/r80/98_agenda_antes_mobile_light.png)|[despues](docs/audit/evidencias/r80/98_agenda_despues_mobile_light.png)|[antes](docs/audit/evidencias/r80/98_agenda_antes_mobile_dark.png)|[despues](docs/audit/evidencias/r80/98_agenda_despues_mobile_dark.png)|
|100 enlaces|[antes](docs/audit/evidencias/r80/100_enlaces_antes_desktop_light.png)|[despues](docs/audit/evidencias/r80/100_enlaces_despues_desktop_light.png)|[antes](docs/audit/evidencias/r80/100_enlaces_antes_desktop_dark.png)|[despues](docs/audit/evidencias/r80/100_enlaces_despues_desktop_dark.png)|[antes](docs/audit/evidencias/r80/100_enlaces_antes_mobile_light.png)|[despues](docs/audit/evidencias/r80/100_enlaces_despues_mobile_light.png)|[antes](docs/audit/evidencias/r80/100_enlaces_antes_mobile_dark.png)|[despues](docs/audit/evidencias/r80/100_enlaces_despues_mobile_dark.png)|

### Capturas 101

|Pantalla|Antes D claro|Después D claro|Antes D oscuro|Después D oscuro|Antes M claro|Después M claro|Antes M oscuro|Después M oscuro|
|---|---|---|---|---|---|---|---|---|
|101 foco|[antes](docs/audit/evidencias/r80/101_foco_antes_desktop_light.png)|[despues](docs/audit/evidencias/r80/101_foco_despues_desktop_light.png)|[antes](docs/audit/evidencias/r80/101_foco_antes_desktop_dark.png)|[despues](docs/audit/evidencias/r80/101_foco_despues_desktop_dark.png)|[antes](docs/audit/evidencias/r80/101_foco_antes_mobile_light.png)|[despues](docs/audit/evidencias/r80/101_foco_despues_mobile_light.png)|[antes](docs/audit/evidencias/r80/101_foco_antes_mobile_dark.png)|[despues](docs/audit/evidencias/r80/101_foco_despues_mobile_dark.png)|
|101 ajustes-foco|[antes](docs/audit/evidencias/r80/101_ajustes-foco_antes_desktop_light.png)|[despues](docs/audit/evidencias/r80/101_ajustes-foco_despues_desktop_light.png)|[antes](docs/audit/evidencias/r80/101_ajustes-foco_antes_desktop_dark.png)|[despues](docs/audit/evidencias/r80/101_ajustes-foco_despues_desktop_dark.png)|[antes](docs/audit/evidencias/r80/101_ajustes-foco_antes_mobile_light.png)|[despues](docs/audit/evidencias/r80/101_ajustes-foco_despues_mobile_light.png)|[antes](docs/audit/evidencias/r80/101_ajustes-foco_antes_mobile_dark.png)|[despues](docs/audit/evidencias/r80/101_ajustes-foco_despues_mobile_dark.png)|

### Capturas 102

|Pantalla|Antes D claro|Después D claro|Antes D oscuro|Después D oscuro|Antes M claro|Después M claro|Antes M oscuro|Después M oscuro|
|---|---|---|---|---|---|---|---|---|
|102 notificaciones|[antes](docs/audit/evidencias/r80/102_notificaciones_antes_desktop_light.png)|[despues](docs/audit/evidencias/r80/102_notificaciones_despues_desktop_light.png)|[antes](docs/audit/evidencias/r80/102_notificaciones_antes_desktop_dark.png)|[despues](docs/audit/evidencias/r80/102_notificaciones_despues_desktop_dark.png)|[antes](docs/audit/evidencias/r80/102_notificaciones_antes_mobile_light.png)|[despues](docs/audit/evidencias/r80/102_notificaciones_despues_mobile_light.png)|[antes](docs/audit/evidencias/r80/102_notificaciones_antes_mobile_dark.png)|[despues](docs/audit/evidencias/r80/102_notificaciones_despues_mobile_dark.png)|

### Capturas 103

|Pantalla|Antes D claro|Después D claro|Antes D oscuro|Después D oscuro|Antes M claro|Después M claro|Antes M oscuro|Después M oscuro|
|---|---|---|---|---|---|---|---|---|
|103 telegram-sin-vincular|[antes](docs/audit/evidencias/r80/103_telegram-sin-vincular_antes_desktop_light.png)|[despues](docs/audit/evidencias/r80/103_telegram-sin-vincular_despues_desktop_light.png)|[antes](docs/audit/evidencias/r80/103_telegram-sin-vincular_antes_desktop_dark.png)|[despues](docs/audit/evidencias/r80/103_telegram-sin-vincular_despues_desktop_dark.png)|[antes](docs/audit/evidencias/r80/103_telegram-sin-vincular_antes_mobile_light.png)|[despues](docs/audit/evidencias/r80/103_telegram-sin-vincular_despues_mobile_light.png)|[antes](docs/audit/evidencias/r80/103_telegram-sin-vincular_antes_mobile_dark.png)|[despues](docs/audit/evidencias/r80/103_telegram-sin-vincular_despues_mobile_dark.png)|
|103 telegram-vinculado|[antes](docs/audit/evidencias/r80/103_telegram-vinculado_antes_desktop_light.png)|[despues](docs/audit/evidencias/r80/103_telegram-vinculado_despues_desktop_light.png)|[antes](docs/audit/evidencias/r80/103_telegram-vinculado_antes_desktop_dark.png)|[despues](docs/audit/evidencias/r80/103_telegram-vinculado_despues_desktop_dark.png)|[antes](docs/audit/evidencias/r80/103_telegram-vinculado_antes_mobile_light.png)|[despues](docs/audit/evidencias/r80/103_telegram-vinculado_despues_mobile_light.png)|[antes](docs/audit/evidencias/r80/103_telegram-vinculado_antes_mobile_dark.png)|[despues](docs/audit/evidencias/r80/103_telegram-vinculado_despues_mobile_dark.png)|
|103 telegram-bloqueado|[antes](docs/audit/evidencias/r80/103_telegram-bloqueado_antes_desktop_light.png)|[despues](docs/audit/evidencias/r80/103_telegram-bloqueado_despues_desktop_light.png)|[antes](docs/audit/evidencias/r80/103_telegram-bloqueado_antes_desktop_dark.png)|[despues](docs/audit/evidencias/r80/103_telegram-bloqueado_despues_desktop_dark.png)|[antes](docs/audit/evidencias/r80/103_telegram-bloqueado_antes_mobile_light.png)|[despues](docs/audit/evidencias/r80/103_telegram-bloqueado_despues_mobile_light.png)|[antes](docs/audit/evidencias/r80/103_telegram-bloqueado_antes_mobile_dark.png)|[despues](docs/audit/evidencias/r80/103_telegram-bloqueado_despues_mobile_dark.png)|

### 104 · Acerca de
| ID | Criterio | Resultado | Evidencia |
|---|---|---|---|
|104|Versiones Web/API/MCP y fecha de compilación|✅ local; ❌ despliegue real pendiente|`104.md`, DTO API + SDK + Docker args|
|104|Copiar diagnóstico sin correo ni tokens|✅ prueba unitaria y portapapeles Playwright ×4|`r80-about.spec.ts`, `diagnostics.spec.ts`|
|104|Capturas escritorio/móvil y temas|✅ 8 originales/después|tabla completa de evidencias|

Petición de Pablo: separar Drive y Calendar registrada en `DECISIONES.md`. Aviso de tratamiento de datos en Integraciones con el nombre completo tick-tack-done y descripción del funcionamiento actual.
