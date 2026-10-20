# Prompt para Cursor: correcciones de tick-tack-done (todo.reflexionia.com)

Contexto: revisión en producción el 18/10/2026 contra la spec UI v1.1 (§4.5 sidebar, §7 Today, §8 Inbox, §12 smart lists) y el look TickTick (acento #4772FA, sidebar #F2F5FE, filas de 40px, borde del checkbox por prioridad, chips pastel). Trabaja por prioridad, P0 primero. Tras cada bloque: build, tests y verificación visual en el navegador. No cambies datos reales.

## P0 - Funcionalidad rota

**F1. Quick-add en Today crea la tarea en Inbox sin fecha.**
Repro: /today, escribir "X" en el campo "Añadir tarea" y Enter. Esperado (§7): la tarea se crea con fecha de hoy y aparece en Today (en Tomorrow, con fecha de mañana). Actual: va a Inbox sin fecha.
Fix: pasar `dueDate` según la vista (today/tomorrow) y la lista por defecto Inbox.

**F2. Tras Enter en quick-add el input no se vacía, no hay feedback y no se actualizan lista ni contadores hasta recargar.**
Fix: vaciar input, mantener foco, insertar la tarea de forma optimista, invalidar queries de lista y contadores, toast de error si falla.

**F3. Las tareas completadas desaparecen de todas partes.**
Repro: completar una tarea. Desaparece de Inbox/lista (aceptable, con opción "mostrar completadas"), pero la smart list "Completed" muestra contador 1 y lista vacía. Solo se encuentra por Search.
Fix: la query de Completed debe devolver tareas completadas (orden por fecha de completado desc); añadir toggle "Mostrar completadas" en listas.

**F4. Papelera: contador 3 y solo 2 elementos listados (falta la tarea completada eliminada).** Los contadores del sidebar quedan obsoletos hasta recargar.
Fix: incluir completadas borradas en Trash; invalidar contadores tras cada mutación.

**F5. Menú "···" de lista en el sidebar aparece al hover pero no abre nada.** No hay forma de renombrar, cambiar color ni borrar una lista desde la UI.
Fix: menú con Renombrar, Color, Archivar, Eliminar (con confirmación).

**F6. El parser de quick-add no interpreta "!1 #tag".** El título queda literal. Implementar prioridad (!1-!3), #tag, @lista y fechas naturales según spec de captura.

**F7. Fecha en el panel de detalle:** al fijarla con el input datetime-local pareció borrarse en una prueba (no concluyente). Verificar persistencia de fecha tras guardar y recargar. El botón rápido "Tomorrow" sí funciona.

**F8. La vista elegida (lista/kanban) no persiste al recargar** (vuelve a lista) y el menú de vistas queda abierto tras elegir. Persistir por lista y cerrar el menú.

## P0 - Sidebar (orden y contenido)

**S1. Orden de smart lists incorrecto.**
Actual: Tomorrow, Next 7 days, All, Inbox, Assigned to me, Completed, No date, Today, Recently added.
Esperado (§4.5): Today, Tomorrow, Next 7 days, All, Inbox, No date, Recently added, Completed; Trash al final. "Assigned to me" es V2: ocultarlo. Respetar el control de orden de Settings > Smart lists, con este orden como valor por defecto.

**S2. Secciones Filters y Tags vacías, solo cabecera.** Mostrarlas solo si tienen contenido, o con estado vacío con "+" para crear.

**S3. Input "New list" siempre visible y sin estilo** (y escribir ahí un término de búsqueda crea una lista por accidente). Sustituir por botón "+" en la cabecera Lists que abre un input estilizado; Esc cancela.

**S4. Scroll:** el sidebar hace scroll mientras el rail queda fijo; los elementos de abajo (Matrix, Garden, Reports, Review, Focus, Habits, Settings, Trash, Empty, Theme) requieren scroll. Reducir "More", fijar footer (Theme, Empty) y colapsar secciones.

## P1 - Páginas sin estilo (HTML por defecto)

- **Login:** sin estilo. Diseñar tarjeta centrada con logo, inputs 40px, botón primario #4772FA.
- **Search:** input desnudo; resultados como lista con viñetas azules bajo el encabezado "task". Usar el mismo componente fila de tarea (checkbox, título, lista, fecha) y resaltar coincidencias.
- **Calendar:** pestañas de vista como enlaces azules, sin cabecera de días, sin título de mes, sin prev/next ni resalte de hoy. Rehacer con toolbar (Hoy, <, >, título), rejilla, hoy resaltado y tareas como chips.
- **Habits:** checkboxes nativos en vertical, sugerencias en píldoras grises, select por defecto. Estilizar tarjetas con racha y checkbox redondo.
- **Settings:** radios/checkboxes con la etiqueta en el lado opuesto, navegación con enlaces azules por defecto, enlace "Today" suelto. Rehacer con layout de dos columnas, filas label+control, toggles.
- **Tokens:** columna de checkboxes con espaciado enorme. Además, los enlaces sueltos "Tokens" y "Today" aparecen arriba en Today y otras vistas: eliminar (parece un nav global mal montado).
- **Garden y Review/Weekly:** muestran JSON crudo (ej. {"value":1,"trend":1}) y claves internas como `completed_today` como títulos de tarjeta; Garden tiene scroll horizontal. Formatear valores, usar etiquetas traducidas y tarjetas de estadística.
- **Account:** "Delete account" aparece como botón rojo suelto, "2FA" y "Saved" como botones extraños, el texto y botón de "escribe el email" están desordenados. Rehacer en secciones.

## P1 - Maquetación y estética

- Columna de lista limitada a ~736px dejando vacío a la derecha: ocupar el ancho disponible (o centrar con max-width consciente) y alinear con la cabecera.
- Chips de fecha y lista pegados al título; deben alinearse a la derecha de la fila (spec §8). El nombre de lista se trunca ("Bandeja ..."): usar ancho mínimo o tooltip.
- El separador entre filas está desplazado y más corto que la fila: debe cubrir el ancho completo.
- Kanban: columna como tarjeta gris plana "No section", sin control para añadir sección.
- Detalle de tarea: Prioridad duplicada (combobox en cabecera y en formulario); fecha con datetime-local nativo (usar date picker propio); contenido en fuente serif (usar la fuente de la app); botones "Convert to note" y "Tomorrow" pegados abajo; etiqueta "List" solapa el footer; Activity con timestamps ISO crudos (usar "hace 2 h"); sección "Subtasks" vacía visible; botón nativo "Choose File"; selects nativos sin estilo.

## P1 - Textos y mensajes

- Mezcla de idiomas: "Bandeja de entrada" en UI inglesa, cabecera en español en Weekly Review, regla en español en Review. Pasar todo por i18n y respetar el idioma del usuario.
- Textos de desarrollo visibles al usuario, quitar o implementar: "The API does not publish external calendar events.", "Password, sessions and 2FA have no endpoint yet", "waiting on the API", "no test endpoint", "The server does not store quiet hours", "Changing the password is not published".
- Integrations muestra Telegram: Online, Drive: Online, Google: Offline. Verificar que el estado sea real y no un valor fijo.

## P2 - Revisar tras lo anterior

No verificado en esta pasada (probar): tema oscuro, responsive/móvil, atajo N, creación de tokens, creación de tags, checklist/subtareas, inicio de Focus, crear hábito, Matrix y Calendar con tareas, Process-all, agrupación por prioridad en Today con tareas fechadas, Export JSON, offline/PWA.

## Criterios de aceptación

1. Orden del sidebar idéntico a §4.5.
2. Crear una tarea en Today la muestra al instante en Today con contador actualizado.
3. Completada visible en Completed; borrada visible en Trash; contadores correctos sin recargar.
4. Ninguna página con controles HTML por defecto ni JSON crudo.
5. Sin textos de desarrollo ni mezcla de idiomas.
6. Test e2e (Playwright) para F1-F5 y S1.
