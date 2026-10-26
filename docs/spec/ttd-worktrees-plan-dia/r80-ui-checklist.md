# Checklist UI de r80 (producción, `318fbd9`)

**Base:** https://todo.reflexionia.com

**Anchos:** escritorio **1280×800** y móvil **390×844** (DevTools, `deviceScaleFactor` 3 en móvil). Haz cada punto en tema claro; el oscuro es opcional.

**Regla:** solo lectura, o acciones sobre las tareas `UI-r80 …` de la lista **grokbot-ticktackdone** (`/list/b7e06139-a8b5-4ed5-b60b-25bd27358b9d`).
- No editar tareas reales.
- No cambiar ajustes: lo que lo exija → «no probado: requiere ajuste».

**Fechas de los datos:** 27/10 (martes), 28/10 (miércoles) y 29/10 (jueves), ya en horario de invierno (UTC+1).

| Punto | URL | Acciones (solo lectura o sobre datos UI-r80) | 1280 – debe verse | 390 – debe verse |
|---|---|---|---|---|
| **87** Día | `/calendar/day?date=2026-10-27` | Mirar la cabecera. Ver `4ec354f7` y `37bda3c1` (10:00–11:00). En móvil, tocar otro día de la tira. | Sin `.day-week-strip`. Cabecera de 44 px con «S44» + «mar 27». Título «27 de octubre de 2026». Los dos bloques lado a lado, ≈(ancho−2)/2 cada uno. | Tira de 7 días de 48 px y título «oct 2026». Al tocar un día cambian la columna y `?date=`. Los bloques siguen lado a lado. |
| **88** Dos semanas | `/calendar/two-weeks?date=2026-10-29` | Ver la celda del 29 (6 tareas `UI-r80 celda`). Pulsar «+N». | Rejilla hasta ≤ 8 px del borde inferior; filas ≥ 300 px. La celda del 29 muestra las que caben + «+N», y «+N» abre el popover del día. | Sin hueco > 16 px bajo la rejilla; «+N» visible. |
| **89** Semana con bloques cortos | `/calendar/week?date=2026-10-28` | Zoom a `796ebb52` (30 min), `4b3c5506` (15 min) y `cc919527` (60 min). Pasar el ratón por encima. | 30 min: una línea «UI-r80 bloque 30 min… · 12:00» con elipsis. 15 min: solo el título en letra xs. Nada se sale del rectángulo (`scrollHeight<=clientHeight`). El tooltip lleva el título completo. | Igual en la vista Semana o 3 días móvil. |
| **90** Selector de fecha | `/list/b7e06139-…` → abrir `cab82517` → «Fecha límite». Y el composer («+») → fecha. **Cerrar sin guardar.** | Abrir y cerrar el selector desde el detalle y desde el composer. | Popover anclado y entero dentro del viewport. | Hoja inferior a todo el ancho (x=0, 390 px), pegada abajo, con asa. Se cierra con «Hecho», tocando fuera o deslizando. Con el teclado abierto no se corta. |
| **91** Panel derecho | `/today` y `/list/b7e06139-…` | Sin selección. Luego clic en `cab82517`, y luego Esc. | Sin selección no hay `.detail-empty` y la lista ocupa todo el ancho. Al seleccionar, el panel entra con el ancho guardado. Con Esc se cierra y el foco vuelve a la fila. | — (en móvil el detalle es una pantalla) |
| **92** Contexto del composer | `/today`, `/list/b7e06139-…` | Abrir el composer con «+» del rail, la tecla N y la BottomBar (móvil). **Ver los chips y cancelar** (no guardar). | En Hoy: chip «Hoy». En la lista: chip «grokbot-ticktackdone». | Igual con la BottomBar. |
| **93** Filtros y periodo | `/calendar/week?date=2026-10-28` y `/calendar/month` | Mirar el sidebar. Desmarcar «grokbot-ticktackdone» y recargar. **Volver a marcarlo.** Abrir el selector de periodo. | Secciones Todo, Listas, Filtros, Etiquetas y Calendarios suscritos, con filas de 32 px y casilla circular. Al desmarcar, las tareas UI-r80 se ocultan en ≤ 200 ms y el estado persiste al recargar (`?lists=`). Sin popover de filtros en la barra. Periodo con DatePopover y formato «28/10/2026» (no mm/dd/yyyy). | Filtros en una hoja inferior con el mismo contenido. El periodo en la hoja de 90. |
| **94** Plan del día | `/plan/day` | Mirar el paso 0. **No aplicar el plan.** | Casillas Vencidas (n), Bandeja y Sin fecha, con Hoy y Vencidas marcadas por defecto. Las candidatas incluyen las vencidas y `cab82517`. El aviso «N vencidas quedan fuera» solo sale al desmarcar. | Igual, sin cortes. |
| **95** Estadísticas y Reporte | `/statistics` y `/reports/weekly` | Leer las cifras y pasar el ratón por el ⓘ. | «Completadas (todas): N» y «Cumplimiento del plan: x de y con fecha (z %)» con un tooltip que explica la fórmula. El Reporte de esta semana muestra barras L–D «hasta hoy, vie 23» y no dice «Sin detalle diario verificable». **La API no trae desglose diario: es probable que falle.** | Igual, legible. |
| **96** Textos en móvil | `/today`, `/settings/tokens`, `/plan/day` | Mirar el contador de Hoy y el texto «tareas sin duración». Cambiar las pestañas del cliente MCP (no crear tokens). Mirar el JSON. Ver `cab82517` en el plan. Abrir el minicalendario en Semana. | — | 96.1: contador en una línea. 96.2: «1 tarea sin duración» en singular. 96.3: pestañas con scroll horizontal y altura fija de 36 px. 96.4: el JSON se desplaza en horizontal y «Copiar» queda fijo. 96.5: título de `cab82517` en 2 líneas. 96.6: celdas del minicalendario de ≥ 36 px. |
| **97** Google y Drive | `/settings/integrations` | **Pulsar «Desconectar» y luego CANCELAR.** | Una tarjeta «Google (Calendar y Drive)» con el correo, dos filas de permisos y su estado. El diálogo explica 3 efectos (calendarios, adjuntos que siguen en Drive, revocación). Cancelar no cambia nada. | Igual. |
| **98** Agenda | `/calendar/agenda` | DevTools → Network/Performance: cargar en frío (vaciar caché) y luego recargar. Anotar el rango pedido y los tiempos. | Primer `[data-agenda-day]` en ≤ 3 s en frío y ≤ 1,5 s en caché. Skeleton mientras carga. Pide ±30 días; los eventos externos van en paralelo. | Igual. |
| **99** Adjuntos | `/list/b7e06139-…` → `ac63d7aa` | Ver la sección «Adjuntos y enlaces». Opcional: adjuntar un fichero pequeño y quitarlo con la casilla «a la papelera». | Chips de 24 px. El clic abre `webViewLink` en una pestaña nueva. El `PUT` del binario va a `googleapis.com/upload/drive/v3` y ninguna petición a todo.reflexionia.com pasa de 4 KB. | Chips de 32 px. |
| **100** Enlaces | Igual que 99, y la fila en la lista | Ver los chips de enlaces. Mirar la fila en la lista. | 2 chips (example.com/a y «Example Domain»). La fila muestra «🔗 2». **Ojo:** el detalle puede mostrar 0 por TTD-AUD-112. | Chips de 32 px. |
| **101** Pomodoro | `/focus` y `/settings/focus` | Ver los presets bajo el reloj y elegir 15 (**solo si no persiste como ajuste**; si persiste → «no probado: requiere ajuste»). Escribir 200 en el campo sin guardar, para ver la validación. | Presets de 28 px; el reloj muestra el valor configurado; 200 → error de validación. | Igual. |
| **102** Notificaciones | `/settings/notifications` | Mirar la matriz de canales por tipo. Pulsar «Probar» en Telegram y Email (solo le llega a Pablo); push debería salir deshabilitado o con un aviso. | Matriz entera sin scroll horizontal. Push indica «no configurado». Con «Probar» llega en ≤ 10 s y sale «Enviado ✓». | Columnas fijas y filas desplazables, sin cortes. |
| **103** Telegram | `/settings/integrations` (tarjeta Telegram) | Solo mirar. | Estado coherente. **La API dice `configured:false/linked:false` pero `status:connected`** (TTD-AUD-114): comprobar qué muestra la tarjeta. Sin vincular: QR de 160 px + «Abrir Telegram» (`https://t.me/…?start=`). | Sin QR; botón de 44 px. |
| **104** Acerca de | `/settings/about` | Leer y pulsar «Copiar diagnóstico» (pegarlo en un bloc local). | Commit de la API y de la web: `318fbd9`. El texto copiado no lleva `@` ni `Bearer`. | Igual. |
| **81 (UI)** Aviso de ancla | `/list/b7e06139-…` → `d2210ac0` | Abrir la repetición (no guardar). | Aviso de que el 3/11 (martes) no cumple «los lunes» y propone el 9/11. | Igual. |

## Datos de prueba (lista grokbot-ticktackdone, no borrar hasta acabar la UI)

| id | Tarea |
|---|---|
| `4ec354f7-e3c7-4fa1-9789-de8404a90233` | UI-r80 día solape A 10-11 |
| `37bda3c1-f626-4778-b5cb-def64ce09ad8` | UI-r80 día solape B 10-11 |
| `796ebb52-65e2-4819-a748-fc3428ed4ddf` | UI-r80 bloque 30 min con un título bastante largo… |
| `4b3c5506-4364-436d-805a-0d8473c59e1b` | UI-r80 bloque 15 min |
| `cc919527-b393-465c-b077-a0f59637e6b6` | UI-r80 bloque 60 min |
| `c087805c-e185-411f-b2a3-bb1dad35c663` | UI-r80 celda 1/6 |
| `bb508114-436b-4d1f-b43e-ad8f107b65bf` | UI-r80 celda 2/6 |
| `4f60df4d-6ead-4423-9cb7-b9396b952b93` | UI-r80 celda 3/6 |
| `7d13e724-7aaf-4e64-9f70-56d296b568af` | UI-r80 celda 4/6 |
| `0bc5d091-253d-48d8-852b-cc3b50088367` | UI-r80 celda 5/6 |
| `fe0a7441-8efb-4d51-9715-802c04c74464` | UI-r80 celda 6/6 |
| `d2210ac0-39cc-42bb-9260-673ad2172140` | UI-r80 ancla martes con regla lunes |
| `cab82517-83ac-4823-b082-defa1368b9d4` | UI-r80 título largo para Plan del día… |
| `ac63d7aa-9c2f-43ef-b298-849cf7d7c020` | UI-r80 enlaces y adjuntos |
