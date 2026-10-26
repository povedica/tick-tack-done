# Prueba de r80 (TTD-AUD-80..104) en producción

- **Fecha:** viernes 23/10/2026, ~20:55–21:10 (hora de Madrid, Europe/Madrid)
- **Entorno:** https://todo.reflexionia.com
  - `/api/v1/health`: commit `318fbd9`, `mcp_version 0.2.0+318fbd9`.
  - El bundle web también lleva `318fbd96af06bc0e6e3abae647a5beeac2d1119b`.
- **Herramientas:** MCP `reflexionia-todo` (`api_request` incluido), `curl` anónimo y lectura del código en `318fbd9`.
- **Alcance de los datos:** solo tareas de prueba propias en la lista `grokbot-ticktackdone` (`b7e06139-a8b5-4ed5-b60b-25bd27358b9d`).
  - No se ha tocado ningún elemento real de Pablo ni «Lectura · check-in semanal».
  - No se han cambiado ajustes, ni tokens.
- **Seguimiento:** tarea abierta «Prueba completa r80 en producción», `28f99be8-863c-4d6d-b49e-9329e92c4261`.
- **Checklist UI:** `r80-ui-checklist.md`.

## 1. Resumen

| Resultado | N.º | Puntos |
|---|---|---|
| OK (parte MCP/API) | 6 | 81, 82, 83, 84, 99, 104 |
| Parcial | 7 | 80, 85, 86, 100, 101, 102, 103 |
| Falla (punto completo) | 0 | — (sí hay subpuntos que fallan: 85.4, 100 `link_count`, 103 estado incoherente) |
| No verificable por MCP-API (requiere UI) | 12 | 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98 |

Nota: en los puntos que son de UI, el código de `318fbd9` sí contiene los cambios. Ejemplos:
- `composerContextFor` + spec;
- `visualViewport` en `Popover`;
- `todayUnestimated_one`;
- ningún `input type=date` en `features/places|calendar`;
- `AboutPage`;
- `statsCompletionHelp`;
- plan del día con `overdue: true` por defecto.

Falta comprobar que se ven bien.

## 2. Tabla por punto

| Punto | Resultado | Evidencia |
|---|---|---|
| **80** OAuth refresh | Parcial | El código tiene la ventana de gracia (`OAUTH_REFRESH_GRACE_MS=60_000`, `auth/oauth-refresh.ts`). Un `POST /oauth/token` con un refresh inválido devuelve `400 {"error":"invalid_grant","error_description":"Refresh token is invalid"}` (correcto, no es un 500). No se pueden probar las renovaciones concurrentes ni el 503 durante el despliegue sin tokens propios o sin staging (no se crean tokens, por regla). `scripts/smoke-oauth.sh` existe. |
| **81** Recurrencia | OK | Serie diaria de día completo `324f10bb` completada con `materialize_next` → ocurrencia `436abb22` (`next_occurrence` = `next_due_date` = 2026-10-26T23:00Z = 27/10 en Madrid, con el cambio de hora bien). `update_task recurrence:null` → `series.closed` (source `mcp`); a los ~4 min no ha resucitado. Ancla en martes con `BYDAY=MO` → `warnings:[{code:"anchor_outside_rule", next_matching:"2026-11-02"}]` (y `2026-11-09` en `d2210ac0`). El aviso en la UI se comprueba en el checklist. |
| **82** Herramientas de tareas | OK | **82.1 `^lista`:** `^grokbot-ticktackdone` → lista correcta; `^NoExisteZZgrokbot` → Bandeja + aviso `list_not_found`; en update, `^Grokbot-TickTackDone` mueve la tarea (sin distinguir mayúsculas). **82.2:** sin el parámetro → `children_need_decision`; con `complete_children:'complete'` → completada y checklist 1/1. **82.3:** reabrir una cancelada → activa + `task.reopened`; reabrir una activa → `not_reopenable`. **82.4:** las descripciones coinciden. **82.5:** `parent_id` set/null OK; un ciclo → `invalid_parent`. |
| **83** Rangos y paginación | OK | `from=2026-10-27` y `from=2026-10-27T00:00:00+01:00` incluyen las tareas de día completo del 27. Una tarea del 28→30 (`70e7c1e9`) entra con `any` en [28,29) y en [29,30) y no entra con `due`. `search limit 2` → `next_cursor`, y la página 2 trae ids distintos. `list_notes` y `api_catalog` → `{items,…,next_cursor}`. |
| **84** Foco por MCP | OK | `start_focus` (cronómetro, `task_id`) → sesión `219bc3a0`; un segundo start → `focus_already_running`; pause/resume/abort OK. Tras terminar: `elapsed 7`, `paused 3`, y minutos después `GET /focus/sessions` sigue en 7 s (congelado). |
| **85** Robustez (lote) | Parcial | **85.1:** `task_not_found` con status. **85.2:** activity `task.restored`/`occurrence.detached` con source `mcp`. **85.3:** `mcp_version` en health y `listChanged:true`. **85.4 FALLA:** `replan_day` con una fecha futura (2027-06-01) creó un borrador con 40 decisiones sobre tareas de Pablo que no están vencidas; lo descarté al momento con `discard_replan` → `{"discarded":true}` y no se cambió ninguna tarea. **85.5:** recordatorio `-PT15M` OK, pero el canal por defecto es `push`, que no está configurado. **85.6:** de 28 tareas de día completo, 1 tiene `due` fuera de la medianoche (`fa96e1a3`, de Pablo, 2026-10-19T13:35Z; solo lo reporto). **85.7:** «mañana 17:00-17:45» → 15:00Z–15:45Z, 45 min. **85.8:** activity resumida y respuesta < 2 KB. |
| **86** Sin respaldo del refresh del servidor | Parcial | En el código: `user-google-token.ts:34-42` solo usa `GOOGLE_REFRESH_TOKEN` en development con `DEV_GOOGLE_USER_EMAIL`, y si no → `409 google_not_connected`; `runtime-config.ts` avisa si está en producción. Desde fuera no se puede verificar si la variable sigue definida en producción. Con un usuario sin Google haría falta una segunda cuenta. |
| **87** Calendario Día | UI | Datos: `4ec354f7` y `37bda3c1` (dos de 10:00 a 11:00 el 27/10). |
| **88** Dos semanas | UI | Datos: 6 tareas el 29/10 (`UI-r80 celda 1..6/6`). |
| **89** Bloque de 30 min | UI | Datos: `796ebb52` (30 min), `4b3c5506` (15 min), `cc919527` (60 min) el 28/10. |
| **90** Selector de fecha en móvil | UI | Cualquier tarea `UI-r80`. |
| **91** Panel derecho vacío | UI | — |
| **92** Contexto del composer | UI | El código tiene `features/capture/context.ts` + spec. |
| **93** Filtros en el sidebar y periodo | UI | Ningún `input[type=date]` en `places`/`calendar` (grep). |
| **94** Plan del día con vencidas | UI | El código: `overdue: true` por defecto (`PlanDayPage.tsx:85,136`). No se abrió una sesión de plan por API porque actúa sobre tareas reales. Dato: `cab82517` (hoy, título largo). |
| **95** Estadísticas y Reporte | UI (con dato de API) | `GET /reports/weekly`: solo la semana 2026-10-19, y el `payload.snapshot` **no tiene un desglose diario** (el «sin detalle diario» puede seguir apareciendo). Dato raro: `trend: 214` = `completed_week`, con `completed_previous_week: 0`. |
| **96** Textos en móvil | UI | `todayUnestimated_one/_other` existe (`i18n/extra.ts:962`). |
| **97** Google y Drive | UI | `GET /integrations/google`: conectado (yoyyosemite@gmail.com), servicios calendar y drive. «Desconectar» no se prueba (cambiaría un ajuste). |
| **98** Agenda < 3 s | UI | La medición requiere el navegador (Performance/Network). |
| **99** Adjuntos en Drive | OK | Prueba B: `POST /tasks/{id}/attachments` 201 con `drive_state ok`; html → `unsupported_media_type`; papelera OK. El modelo `Attachment` de Prisma no tiene `storage_key`, `thumbnail_key` ni `Bytes`. No se puede probar `409 drive_not_connected` porque Drive está conectado (requiere ajuste). |
| **100** Enlaces | Parcial | Enlaces automáticos: 2 → 1 al editar. `javascript:` → `validation_failed`. `169.254.169.254` se guarda con `title:null` (sin unfurl); `example.org` → «Example Domain». **BUG:** `link_count` es 0 en `get_task`/`create`/`update` aunque `links` tiene 2; `list_tasks` sí da 2 (`ac63d7aa`). Las activity `link_added/removed` llevan source `api` en vez de `mcp`. No se probaron 10.0.0.1, ::1 ni la redirección privada. |
| **101** Pomodoro | Parcial | `GET /focus/settings` OK; `PATCH pomodoro_minutes:200` → `validation_failed … must not be greater than 180` (400). No se probó cambiarlo a 45 («no probado: requiere ajuste»). Además, en el código `PUT /focus/settings` rellena con valores por defecto los campos que faltan (riesgo). |
| **102** Notificaciones | Parcial | `get_notification_settings`: push `configured:false` (VAPID vacío); email configurado; telegram «linked/connected»; sin horas de silencio. `send_test_notification push` → `push_not_configured`. **Telegram y email: no enviado** (la revisión automática bloqueó el envío de un mensaje real; usar «Probar» en la UI). |
| **103** Telegram | Parcial (posible falla) | `GET /integrations/telegram` → `configured:false, source:"none", webhook_state:"unconfigured", linked:false`, pero `status:"connected"`, `linked_at:2026-10-18T17:03Z` y `enabled:true`. Esto contradice lo que dicen las notificaciones (vinculado). Tras pasar a «bot propio por usuario», la cuenta no tiene bot configurado, así que **probablemente no se entregan avisos por Telegram**. Hay que comprobarlo en la UI o configurar el bot (es un ajuste de Pablo). |
| **104** Acerca de | OK (API) | La API y el bundle web llevan `318fbd9`; la ruta `/settings/about` existe. «Copiar diagnóstico» se comprueba en la UI. |

## 3. Bugs nuevos propuestos

| ID | Prio | Título | Evidencia |
|---|---|---|---|
| **TTD-AUD-112** | P1 | `link_count` es 0 en `get_task`/`create_task`/`update_task` | `tasks.service.ts:235`: `_count.links` solo se pide en `list()`; `task.mapper.ts:102` → `?? 0`. `ac63d7aa`: get → 0, list → 2. Arreglo: incluir `_count` en todos los `select`, o calcularlo como `links.length`. |
| **TTD-AUD-113** | P1 | `replan_day` acepta fechas futuras y propone tareas no vencidas | 2027-06-01 → borrador de 40 decisiones (descartado). Debería limitarse a `date ≤ hoy`, o tomar solo las tareas vencidas respecto a hoy. |
| **TTD-AUD-114** | P1 | Telegram: estado incoherente entre `/integrations/telegram` y la configuración de notificaciones | `configured:false/linked:false` frente a `status:connected`; las notificaciones lo dan por vinculado. Hay que unificar el cálculo y avisar de «falta configurar el bot» en la matriz y la tarjeta. |
| **TTD-AUD-115** | P2 | El canal por defecto de los recordatorios es `push` aunque push no esté configurado | VAPID vacío en producción: el recordatorio se pierde en silencio. Elegir por defecto un canal configurado, o configurar VAPID. |
| **TTD-AUD-116** | P2 | `source` de la activity mal etiquetado | La ocurrencia creada por el scheduler y su update salen como `automation`; `link_added/removed` como `api` en llamadas MCP; la regla padre en `detach` como `api`. Propagar `X-TTD-Source` a los efectos secundarios. |
| **TTD-AUD-117** | P3 | Las respuestas de escritura no incluyen el evento recién creado en `activity` | cancel/complete devolvían la activity sin su propio evento. |
| **TTD-AUD-118** | P3 | Una serie cerrada sigue exponiendo `repeat_label`/`next_occurrence` | `324f10bb` (completada; la serie se cerró en `436abb22`) sigue con «Cada día» y `next_occurrence`. |
| **TTD-AUD-119** | P3 | `search` duplica los `items` dentro de `groups` | Se duplica el tamaño de la respuesta. Devolver solo ids en `groups`, o solo `groups`. |
| **TTD-AUD-120** | P3 | `task: null` en las respuestas de `start/pause/resume/abort_focus` aunque haya `task_id` | `GET /focus/sessions` sí trae `task{id,title}`. |
| **TTD-AUD-121** | P2 | `PUT /focus/settings` con un cuerpo parcial resetea los demás campos | `focus.controller.ts:625` rellena con valores por defecto. Hacer merge, o exigir el cuerpo completo. |
| **TTD-AUD-122** | P3 | `sort_order` duplicado al crear tareas en paralelo | 4 tareas creadas a la vez con `2621440` (`c087805c`, `bb508114`, `4f60df4d`, `7d13e724`). |
| **TTD-AUD-123** | P3 | Una tarea de día completo con `due` fuera de la medianoche | `fa96e1a3` (de Pablo) 2026-10-19T13:35Z. Correr `scripts/repair-allday-utc.ts` en modo dry-run. |
| **TTD-AUD-124** | P3 | El Reporte semanal guardado no trae un desglose diario | El `payload.snapshot` no tiene `by_day`; `trend` = `completed_week` con `previous_week 0`. Revisar contra 95. |

## 4. Datos de prueba creados (lista grokbot-ticktackdone)

**Para la fase UI (NO borrar todavía):**

| id | título | uso |
|---|---|---|
| `4ec354f7-e3c7-4fa1-9789-de8404a90233` | UI-r80 día solape A 10-11 (27/10 10:00–11:00) | 87 |
| `37bda3c1-f626-4778-b5cb-def64ce09ad8` | UI-r80 día solape B 10-11 (27/10 10:00–11:00) | 87 |
| `796ebb52-65e2-4819-a748-fc3428ed4ddf` | UI-r80 bloque 30 min … (28/10 12:00–12:30) | 89 |
| `4b3c5506-4364-436d-805a-0d8473c59e1b` | UI-r80 bloque 15 min (28/10 13:00–13:15) | 89 |
| `cc919527-b393-465c-b077-a0f59637e6b6` | UI-r80 bloque 60 min (28/10 16:00–17:00) | 89 |
| `c087805c-e185-411f-b2a3-bb1dad35c663` | UI-r80 celda 1/6 (29/10, día completo) | 88 |
| `bb508114-436b-4d1f-b43e-ad8f107b65bf` | UI-r80 celda 2/6 | 88 |
| `4f60df4d-6ead-4423-9cb7-b9396b952b93` | UI-r80 celda 3/6 | 88 |
| `7d13e724-7aaf-4e64-9f70-56d296b568af` | UI-r80 celda 4/6 | 88 |
| `0bc5d091-253d-48d8-852b-cc3b50088367` | UI-r80 celda 5/6 | 88 |
| `fe0a7441-8efb-4d51-9715-802c04c74464` | UI-r80 celda 6/6 | 88 |
| `d2210ac0-39cc-42bb-9260-673ad2172140` | UI-r80 ancla martes con regla lunes (3/11, `BYDAY=MO`) | 81 (aviso en la UI) |
| `cab82517-83ac-4823-b082-defa1368b9d4` | UI-r80 título largo para Plan del día… (hoy 23/10) | 94, 96.5 |
| `ac63d7aa-9c2f-43ef-b298-849cf7d7c020` | UI-r80 enlaces y adjuntos (2 enlaces) | 99, 100 |
| `70e7c1e9-4a20-4a69-a40f-76a935ccbdfb` | T83 inicio 28 fin 30 (con recordatorio y sesión de foco) | 83/84 en la UI |

**Tareas de la prueba API (se pueden borrar después):**
- `324f10bb`, `436abb22`, `0e228d5d`, `381cdeb6`, `2f1aaa54`, `dd8e9b72`, `99e3a819`, `e2ef88fc`.

**Seguimiento (abierta):** `28f99be8-863c-4d6d-b49e-9329e92c4261`.

## 5. No probado y por qué

- **Concurrencia OAuth y 503 (80):** requiere crear tokens o un staging.
- **Envío real por Telegram y email (102):** el envío se bloqueó; hay que hacerlo desde la UI con «Probar».
- **Cambios de ajustes (101 pomo 45, 102 matriz y horas de silencio, 97 desconectar, 99 sin Drive, 103 vincular/desvincular):** «no probado: requiere ajuste».
- **SSRF con 10.0.0.1, ::1 y redirección (100):** pendiente; se puede hacer con `add_task_link` sobre `ac63d7aa`.

## 6. Resultados de la prueba UI (producción `318fbd9`, 23/10/2026 ~21:05–21:27, hora de Madrid)

La prueba la hizo el agente principal en navegador a 1280 y 390 px, en modo lectura, sobre las tareas `UI-r80 …`.

**Capturas:** `r80-ui-shots/`. Son 193 ficheros con nombre `UI-r80_<orden>_<HHMMSS>.<ext>` (hora de Madrid), en el orden en que se tomaron. **No están clasificadas por punto**; la hora sirve para situarlas.

| Punto | Resultado UI | Observación |
|---|---|---|
| 81 | Parcial | Sale el aviso «La fecha no coincide con la repetición; la próxima será el lun, 9 nov», pero **no hay botón para corregirlo** → TTD-AUD-134. |
| 87 | OK | Día a 1280 y 390. |
| 88 | Parcial | En escritorio, «+N» abre un **modal centrado**, no un popover anclado a la celda. En móvil, la hoja inferior está bien → TTD-AUD-130. |
| 89 | Parcial | El bloque de 30 min **no muestra la hora**; el de 15 min muestra solo el título (correcto) → TTD-AUD-131. |
| 90 | Parcial | Escritorio OK. En móvil, en el selector de fecha del detalle, la fila «Quitar fecha / Hecho» queda **cortada** y hay que hacer scroll → TTD-AUD-132. |
| 91 | OK | — |
| 92 | OK | En la lista, el chip de fecha dice «Sin fecha» (correcto). |
| 93 | Parcial | El sidebar del calendario **no hace scroll con la rueda** (sí por programa) → se añade a 105. El selector de periodo usa el date picker de tareas en vez del formato `dd/mm/yyyy` → TTD-AUD-133. La hoja de filtros móvil no tiene título, ni cerrar, ni «Listo»; el asa se va con el scroll; hay indicadores circulares tipo radio junto a una casilla cuadrada «Solo semana laboral» → 106. |
| 94 | OK | — |
| 95 | **Falla** | `/reports/weekly` muestra «Sin detalle diario verificable», sin barras L–D → TTD-AUD-126 (absorbe 124). |
| 96 | OK | Tokens, plan y minicalendario. El singular «1 tarea» no se pudo verificar (no había el dato). |
| 97 | **Falla** | No hay una tarjeta única «Google (Calendar y Drive)» ni botón «Desconectar». Hay tarjetas separadas Calendar, Drive y «Permisos de Google», con «Cambiar permisos» y «Revocar acceso» → TTD-AUD-127. |
| 98 | OK | Skeleton a los 0,5 s y contenido a los 1,8 s. |
| 100 | **Falla** | La fila de la lista no muestra «🔗 2» → TTD-AUD-128. Además, el detalle se ve afectado por 112. |
| 101 | **Falla** | En `/focus` no hay presets bajo el reloj, y `/settings/focus` acepta 200 sin aviso de validación → TTD-AUD-129. |
| 102 | Parcial | La matriz se ve entera sin scroll. Pero push muestra «Bloqueado en el navegador» en vez de «No configurado», y Telegram muestra un punto gris y «@» sin nombre → TTD-AUD-135 (con 114/125). |
| 103 | Parcial | La tarjeta Telegram dice «Sin vincular» y «Sin configurar», con el campo del token y «Guardar bot» deshabilitado → TTD-AUD-125. |
| 104 | OK | Muestra `318fbd9`. |

**Recuento UI de los 12 puntos de UI pura (87–98):** 6 OK (87, 91, 92, 94, 96, 98), 4 Parcial (88, 89, 90, 93) y 2 Falla (95, 97).
Además, de los puntos con parte UI: 81, 102 y 103 son parciales; 100 y 101 fallan; 104 está OK.

### IDs nuevos abiertos por la prueba UI

| ID | Origen | Título | Paquete |
|---|---|---|---|
| TTD-AUD-126 | 95 + 124 | El Reporte de la semana en curso no muestra el detalle diario | E |
| TTD-AUD-127 | 97 | Tarjeta única «Google (Calendar y Drive)» con «Desconectar» que explica los efectos | E |
| TTD-AUD-128 | 100 | La fila de la lista no muestra el contador de enlaces «🔗 N» | B |
| TTD-AUD-129 | 101 + 120 + 121 | Foco: presets visibles, validación en Ajustes > Foco, `task` en las respuestas y merge en `PUT` | E |
| TTD-AUD-130 | 88 | «+N» de Dos semanas/Mes como popover anclado en escritorio | A |
| TTD-AUD-131 | 89 | El bloque de 30 min pierde la hora | A |
| TTD-AUD-132 | 90 | Hoja de fecha en móvil: la fila «Quitar fecha / Hecho» queda cortada | A |
| TTD-AUD-133 | 93 | Selector de periodo con formato de fecha local (`dd/mm/yyyy`) | A |
| TTD-AUD-134 | 81 | El aviso de ancla de la repetición no tiene botón «Mover al lun 9 nov» | E |
| TTD-AUD-135 | 102 | Matriz de notificaciones: estado de push «No configurado» y Telegram sin «@» vacío | C |

Los paquetes de trabajo en paralelo están en `worktrees/README.md`.
