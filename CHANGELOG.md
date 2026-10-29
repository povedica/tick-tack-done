# Historial de cambios

## Sin publicar

- El editor de filtros usa campos, listas y fechas del propio diseño. Todas y
  Alguna se distinguen, Cancelar es secundario y la pista de guardado solo se
  marca al intentar guardar. Editar condiciones está en el menú. Una condición
  puede citar una carpeta: vale para las tareas de las listas de esa carpeta.
  Asignado sigue siendo un texto (nombre o email); no hay un listado global de
  personas.
- Un filtro guarda las etiquetas por id. Un nombre sigue valiendo al crear o
  editar, y se resuelve sin distinguir mayúsculas. Fusionar dos etiquetas
  reescribe los filtros que citaban la de origen. El paso de datos es
  `pnpm --filter api exec tsx ../../scripts/backfill-filter-tag-ids.ts --dry-run`
  antes de aplicarlo; no forma parte de la migración SQL.
- Un filtro se puede fijar (`pinned`) y restaurar después del borrado lógico.
  Crear o cambiar las reglas exige al menos una condición; un filtro vacío ya
  guardado sigue leyéndose. El MCP lista, lee, crea, edita, fija, borra y
  restaura filtros.
- La página de filtros es una lista con menú, fijar, duplicar y borrar con
  deshacer. La barra lateral usa el mismo menú. `/filters/:id` abre
  `/filter/:id`.
- El editor es un modal en escritorio y una pantalla completa en el móvil, con
  Todas o Alguna, grupos y una vista previa que se calcula sola.
- La vista del filtro muestra el embudo, las condiciones y las acciones en
  «…». Un id que no existe lleva a los filtros. La captura rellena la etiqueta,
  la lista o el día cuando la condición nombra solo uno.

## Revisión del paquete de listas

- Planificar un día completo conserva la estimación de esfuerzo. Antes se
  guardaba como 0 y desaparecía de la carga del día.
- Un proyecto no marca «vencida» una próxima acción cuyo inicio ya pasó si el
  vencimiento sigue por delante. Un inicio futuro tampoco cuenta como vencida.
- `GET /projects` incluye `owner_id`. Una lista de otro dueño no ofrece «Mover
  a carpeta».
- El cliente declara `before_id` y `move_to_end` al actualizar una lista.
- En el tablero de proyectos, una pulsación larga abre el menú de la tarjeta.

## Algún día más visible en la planificación

- La hoja «¿Cuándo?» muestra «Algún día» como píldora neutra, pareja de la X,
  en escritorio y en móvil. El calendario de la hoja no cambia.
- En la tarjeta de escritorio, duración y hora comparten fila y «Algún día»
  queda visible junto a Hecha y No lo haré. El menú «⋯» de esa tarjeta solo
  elimina. La tarjeta móvil sigue con sus controles de siempre.

## Carpetas, listas y lista-proyecto

- Una lista puede marcarse como proyecto (`is_project`) con resultado, estado
  En marcha o Pausado, y fecha de archivo (`closed_at`). Archivado es el mismo
  `closed` de la lista: no hay un estado «Hecho». Desarchivar vuelve a En marcha,
  salvo que se pida otro estado. Borrar un proyecto exige que esté archivado.
- Carpetas con totales, mover listas entre carpetas, y herramientas MCP de
  carpetas y de estado. El borrado de listas sigue siendo lógico.

## Contexto laboral

- Ajustes › Jornada guarda días laborables, carpetas, listas y etiquetas de
  trabajo, y puede ocultar lo laboral fuera de horario. «Mostrar trabajo» dura
  hasta el próximo inicio de jornada en todos los dispositivos. Los avisos
  laborales se retrasan hasta ese inicio (`work_hours`). El scope nuevo
  `workday:write` obliga a reautorizar los conectores que ya existían.

## Algún día en la hoja «¿Cuándo?»

- Al planificar, la hoja «¿Cuándo?» ofrece «Algún día» en la cabecera, a la
  izquierda del cierre. Un toque usa la misma decisión que la tecla A: marca la
  tarea como algún día, cierra la hoja y pasa a la siguiente. La tecla A y el
  menú «⋯» siguen igual.

## Integraciones más compactas

- Ajustes → Integraciones pasa a una sola lista: una fila por servicio, interruptores
  etiquetados y las acciones destructivas dentro de «⋯». En el móvil esas acciones
  salen en una hoja inferior. La conexión, los permisos y los textos de tratamiento
  de datos no cambian.

## Corrección del modo de sesión en producción

- Las compilaciones de producción activan siempre sesiones por cookie y CSRF,
  también cuando se generan fuera de Docker. Evita 403 al planificar el día,
  registrar ubicación y realizar otras escrituras con sesión.
- Regresión en CI sobre el artefacto de producción: apertura de planificación y
  ubicación exigen el token CSRF y no envían la identidad de desarrollo.

## Refinamientos de Hábitos, Calendario y Planificación

- RF-1301/1302/1303: editor único de hábitos, pausa y fecha de inicio compatibles
  con el historial; tarjetas compactas, objetivo semanal, detalle y gestión
  simplificados. Constancia usa el acento del tema, año natural y meses separados,
  con navegación horizontal en móvil.
- Planificación: agenda, arrastre, gestos, guardado y resumen refinados; se conserva
  el deshacer de cuatro segundos. API pública y contratos SDK/MCP actualizados.
- Calendario y ajustes: detalle de días, controles de fecha, navegación móvil,
  duración de foco y horario laboral adaptados a la UI compartida.
- PWA (RF-13010): dependencias y aplicación en archivos separados para conservar
  el precache completo por debajo del límite de 2 MiB por recurso.
- Seguridad: body-parser 2.4.0 y multer 2.5.0; retirada de Zod, dependencia
  sin uso, para cerrar las alertas de auditoría de producción.
- Validación de publicación: pruebas con datos sintéticos, compilación y contratos
  regenerados. Las referencias visuales aportadas se conservan sin reformatear;
  los perfiles y evidencias privados siguen excluidos de Git.

## Desarrollo local — copia de tareas

- RF-1703/1705: comando `scripts/refresh-local-task-data.py` para refrescar datos
  de tareas desde una cuenta de producción hacia la cuenta demo local. Incluye
  listas, etiquetas y relaciones, con lectura remota estricta, backup local
  verificado, importación transaccional e identificadores locales estables.
- Perfil privado fuera de Git y comprobaciones que rechazan bases de producción
  y Docker remoto como destino. No copia cuentas, credenciales, integraciones,
  hábitos, calendarios ni archivos binarios de adjuntos.

## Sin publicar — ajustes visuales PR77

- Captura (RF-101/102/107, RF-802): reconocimiento de fechas y etiquetas,
  conservación del texto, título de URL opcional y valores predeterminados de
  fecha, hora, duración, recordatorios, prioridad, etiqueta y lista por usuario.
  Se aplican en web, API y MCP: los campos explícitos tienen prioridad sobre el
  texto reconocido, y éste sobre los valores predeterminados. Las listas o
  etiquetas eliminadas no bloquean nuevas capturas. Se conserva el comportamiento
  anterior hasta configurar preferencias.
- Posición configurable de nuevas tareas en orden manual y del bloque de
  vencidas en Hoy y Kanban por fecha (RF-1001).
- API: `GET/PATCH /api/v1/me` publica `capture_settings`. MCP:
  `get_capture_settings` (`profile:read`) y `update_capture_settings`
  (`profile:write`), con validación y aislamiento de propietario (RF-2001/2002).
  El segundo recibe la configuración completa; se debe consultar antes de editar.
- Evento `capture.settings_updated@v1`, entidad `user`: nueva configuración y
  configuración anterior, sin secretos, en la transacción de actualización.
  Migración `20261025075715_add_capture_settings` con rollback verificado:
  su `down.sql` elimina exclusivamente la columna de preferencias de captura.
- Ajustes móvil: los formularios de Cuenta permanecen en el contenido, sin
  superponerse ni bloquear navegación; el panel móvil fijo se limita al editor
  de tokens. Los accesos de Cuenta y Más abren el índice de Ajustes.
- Ordenación más discreta: icono fino de 16 px, valores a la derecha y
  selectores sin relleno destacado, con flechas espaciadas y más aire entre filas.
- Cabecera móvil a 18 px y menús a 14 px. Ordenar y agrupar tienen su propio
  control junto al menú de vistas, con preferencias y orden existentes
  conservados (RF-1001).
- Sidebar: grupos desplegados por defecto también en móvil, conservando el
  plegado elegido por el usuario. Cabeceras más pequeñas y suaves, flechas
  discretos e icono de carpeta con listas indentadas (RF-302).
- Listas en móvil: selector de vista dentro del menú de acciones, con Matriz,
  Kanban y Timeline según la vista. Cabecera y menú con texto más compacto;
  desplegable flotante con altura ajustada a la pantalla para evitar recortes
  en listas vacías como Mañana (RF-1001/1002/1003/1004).
- Ajustes: controles de una línea más compactos, con espacio vertical en las filas
  de Foco y áreas táctiles conservadas. Sombra suave en el panel y la navegación
  de Ajustes en ambos temas, sin cambios de comportamiento (RF-1201/1203/1205).
- Flechas de los selectores de Ajustes con margen derecho y espacio reservado
  para que no se solapen con el texto; colores adaptados al tema.

## Staging — Telegram por usuario y Resend (23 de octubre de 2026)

- RF-2003: configuración cifrada de un bot exclusivo por usuario en Ajustes →
  Integraciones, webhook propio y aislamiento de chats, respuestas, adjuntos y
  avisos. Se conservan QR, perfil, bloqueo y preferencias; las credenciales
  globales de Telegram dejan de utilizarse.
- Evento versionado `telegram.bot_configured@v1`: datos saneados con usuario del
  bot y estado del webhook, sin tokens ni secretos.
- RF-802/RF-808: correo transaccional por Resend con `RESEND_API_KEY` y
  `EMAIL_FROM`; recordatorios con idempotencia y reintentos que conservan los
  canales ya enviados. SMTP se mantiene para desarrollo local.
- Se conservan las migraciones y mejoras ya presentes en staging. La selección
  explícita de configuración usa `RUNTIME_ENV_FILE`; el despliegue conserva las
  claves y los datos existentes y actualiza solo las credenciales de integración.

## Sin publicar — PR75

- Staging aislado con Compose, PostgreSQL/Redis, redes y secretos propios; configuración y retirada a página estática preparadas. Activación pública y aceptación externa pendientes.
- Política de navegador corregida para las subidas directas a Drive, Google Picker y sus ventanas OAuth; prueba de regresión sobre las cuatro configuraciones.

- Mayor fiabilidad OAuth y contratos MCP, recurrencias, paginación y sesiones de Foco.
- Regresión con dos procesos API compilados: el refresh concurrente, el access anterior y la autenticación MCP sobreviven al reinicio con PostgreSQL/Redis locales reales; staging sigue pendiente.
- Calendario, captura contextual, fuentes de planificación, estadísticas y accesibilidad móvil.
- Adjuntos exclusivamente en Google Drive con metadatos en tick-tack-done; enlaces en tareas.
- Ajustes de Pomodoro, sonidos locales, matriz de notificaciones y vinculación guiada de Telegram.
- Acerca de con versiones y diagnóstico sin datos de cuenta.
- Tarjetas con permisos y activación independientes para Google Calendar y Google Drive sobre una conexión Google y avisos sobre tratamiento de datos.

Por petición de Pablo, se retira `docs/` del árbol. Las evidencias históricas siguen enlazadas en la PR; las nuevas ejecuciones generan artefactos ignorados por Git en `test-artifacts/`.

Implementación y pruebas locales: [estado](https://github.com/povedica/tick-tack-done/blob/340f34be17477ecab681ddc3dbfd790c9346a0ba/docs/audit/ESTADO.md). Las verificaciones externas pendientes se detallan en la PR; estos cambios no se han desplegado. [Contrato MCP](https://github.com/povedica/tick-tack-done/blob/340f34be17477ecab681ddc3dbfd790c9346a0ba/docs/mcp/CHANGELOG.md).
