# Historial de cambios

## Sin publicar

- El menú de proyectos recupera su fondo en claro y oscuro, también al abrir
  directamente el tablero. Las columnas se distinguen y el botón es visible en táctil.

## Contratos del navegador

- Recuperar contraseña vuelve a mandar el POST. El idioma sale de la etiqueta
  del navegador, sin abrir el catálogo inglés que esa pantalla no tiene cargado.
- Las hojas de las rutas diferidas se publican con `emitFile`. El chip de
  enlace recupera los 24 px en escritorio y los 32 px en móvil. El CSS medido
  del entry más el calendario pasa de 29,0 KB a 36,4 KB gzip; el tope queda
  en 38 KB. El JS sigue en 247,2 KB, por debajo de 250.

## Vista anual y trimestral desde el resumen (R1)

- El año y el trimestre pintan con `GET /api/v1/calendar/summary?granularity=day`.
  Un filtro guardado o una selección de filtros sigue con el índice local.
- Tocar el número de un día abre el detalle con `GET /api/v1/calendar/range` de
  ese día. La celda anticipa la petición en pointerdown y al recibir el foco.
- La segunda carga del resumen manda `If-None-Match` y, si no cambió nada,
  se queda con el 304.
- El año pinta primero el mes visible y los dos de al lado. El resto entra
  cuando el navegador está libre. Las tarjetas siguen con `content-visibility`.
  No hay endpoint nuevo: el resumen del año sigue siendo una sola petición.
- Las cifras del 12 de noviembre están en
  `docs/perf/2026-11-12-vista-anual.md`. El TBT del seed S no entra de forma
  estable en 260 ms y Lighthouse móvil queda por debajo de R3. k6 en local sí
  entra en los p95 de la §6.4.

## Summary y range del calendario (F6, sin activar en la web)

- `GET /api/v1/calendar/summary` y `GET /api/v1/calendar/range` leen `tasks` y
  `external_events`. No hay `calendar_entries`. El calendario público sigue en
  el camino anterior.
- `calendar_versions` sube en la misma transacción que un cambio que afecta al
  calendario. El ETag se calcula antes de la consulta principal. `Cache-Control:
private, no-cache` y `Vary: Cookie, Authorization` solo en `/calendar/*`.
- Un token limitado a una lista no mete las otras listas en el resumen ni en
  las páginas. Los eventos externos visibles no desaparecen por ese límite.
- El conteo del año usa un índice de `external_events` sobre el dueño y los
  días locales. No copia filas. Un día con varios calendarios visibles conserva
  el orden de inicio.

## Decisión B0 del calendario (sin read model)

- En el seed efímero ×100, el resumen del año y la primera página de un mes
  sobre `tasks` y `external_events` quedan por debajo de 50 ms (p95) y de
  200 ms (p99). No se crea `calendar_entries`. El calendario público sigue
  leyendo el camino anterior. Se reproduce con `bash scripts/perf-b0.sh`.

## Días locales del calendario (F4, sin activar)

- El cambio de zona del perfil encola el recálculo de los eventos con hora.
  La petición no espera a reescribirlos. Las tareas siguen en su zona de captura.
- Un backfill rellena, en tandas de 500, los días locales de las tareas y de
  los eventos de día completo que ya existían. El calendario público sigue
  leyendo el camino anterior.

## Medición del calendario (F1)

- Cada respuesta `/api/*` lleva `Server-Timing` (`auth`, `db` con el número de
  consultas, `app`, `total`). Una consulta de más de 50 ms o una petición de
  más de 200 ms queda en el log con `X-Request-Id`, sin datos personales.
- `scripts/seed-perf.ts` solo escribe en Postgres efímero (`reflexionia_perf`).
  `TOKEN_RATE_LIMIT_TEST` no existe en producción.
- La línea base se reproduce con `pnpm perf:baseline`.

## Backlog en GitHub Projects

- Plantillas de issues y PR, workflow y scripts de sincronización del backlog.
- Espejo del backlog, registro de decisiones y protocolo de trabajo.
- Reglas compartidas en AGENTS.md y skill de backlog para Cursor y Codex, compatibles
  con el campo nativo Status de GitHub. Espejo regenerado desde las issues reales.

## Sin publicar

- BKL-059 (#169): copia local persistente antes de migrar en staging y producción, con permisos privados y retención de 30 días conservando las tres últimas; el backup diario externo de RF-1704 mantiene su comportamiento.

- BKL-046: 1Password Environments, runtime env restaurable y plan de imágenes independiente del último push.
- Harness: una PR de agente empieza por `Closes #N` de una issue abierta. Solo Dependabot queda exento. El check ignora comentarios HTML y líneas en blanco al principio. Un ajuste posterior al cierre abre una issue `ajuste` nueva y no reabre la original (BKL-060, #170).
- Cuenta atrás: filas legibles en móvil, tarjetas cuadradas en escritorio/tablet, colores saturados y menú con el estilo de la app. Alta y edición con bandeja de emojis y calendario de fecha civil; cadenas en español e inglés. MCP permite actualizar todos los campos editables, restaurar y paginar (BKL-058, #162; RF-2401–2405, RF-2431, RF-2440–2442, RF-2451–2455).

## 0.2.0 (10 de noviembre de 2026)

- La salud de Google Calendar (`ok`, `error`, `reconnect_required`) sale en
  `GET /api/v1/calendar/sync-status`, en el campo `sync` de los eventos y en
  MCP (`get_calendar_sync_status`, `sync_calendar`). Calendario y Hoy avisan
  sin ocultar los eventos. El sondeo de Google pasa a 5 minutos; abrir
  Calendario o Hoy sincroniza como mucho una vez por minuto, y el botón y el
  atajo «.» llaman a `POST /calendar/sync` (RF-2563, RF-2564, RF-2565, RF-2567).
- Google puede avisar con `events.watch`: un canal por suscripción de lectura,
  webhook público verificado, renovación si queda menos de un día y
  `channels.stop` al quitar la suscripción o desconectar. Sin `PUBLIC_URL`
  https no se abre canal, queda `calendar_watch_unavailable` y el sondeo sigue.
  No hay `robots.txt` restrictivo (RF-2566). Migración
  `add_calendar_watch_channels`: el `down.sql` quita las columnas del canal.
- Google Calendar borra las ocurrencias que ya no existen cuando una serie se
  acorta o termina (`UNTIL`). La sync incremental pide `singleEvents` y
  `showDeleted`, conserva el `syncToken` al paginar, y un maestro cancelado
  borra también sus instancias. La primera sync tras el despliegue reconcilia
  la ventana aunque el incremental venga vacío (RF-2560, RF-2561, RF-2562).
  Migración `add_calendar_last_reconciled_at`: su `down.sql` quita solo
  `last_reconciled_at`.
- Hoy, mañana, los próximos 7 días y el calendario incluyen las tareas compartidas
  que están asignadas a ti. La búsqueda sigue siendo solo tuya. La vista previa de
  un filtro ya no enseña todas las tareas de una lista compartida: solo las que
  te han asignado.
- Un miembro puede cambiar de permiso, salir, aceptar o rechazar una invitación.
  El dueño recibe un aviso en Compartir cuando aceptan, rechazan o se van, y
  quien es mencionado también. Una invitación caduca a los 14 días y el
  planificador la retira. Los recordatorios de una tarea ajena responden 403.
- El dueño puede publicar un enlace de solo lectura (`/s/…`). Quien lo abre ve el
  nombre de la lista y sus tareas, sin iniciar sesión y sin comentarios ni
  personas. Regenerar o revocar deja el enlace anterior inservible al momento.
  La fecha concreta del enlace usa un campo de fecha: el selector de tareas
  también cambia recordatorios, y un enlace público no debe abrirlos.
- Una lista compartida con otra persona aparece en «Compartidas conmigo» cuando
  acepta la invitación. Leer solo mira, comentar añade comentarios y escribir
  crea y completa tareas de esa lista. El dueño invita, cambia el permiso o
  quita el acceso. Quien no es miembro recibe 404.
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

Implementación y pruebas locales: el estado quedó en la PR. Las verificaciones externas pendientes se detallan allí; estos cambios no se han desplegado. Contrato MCP: `docs/mcp/CHANGELOG.md`.

## BKL-046 · CI/CD y 1Password

- CI por paths con `ci-ok`, caché de domain/Playwright, integración en shards y timeouts.
- Imágenes ligeras con healthcheck, GHCR y caché BuildKit; el VPS hace pull incremental.
- Configuración centralizada en 1Password; importación privada, referencias por entorno y runbook.
- Staging previo, aprobación de producción, backup antes de migrar y rollback de imágenes.
- Pasos manuales M1–M9 y métricas pendientes documentados, sin cambios de protección ni migraciones Prisma.
