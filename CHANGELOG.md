# Historial de cambios

Cómo se numera una release: [docs/VERSIONADO.md](docs/VERSIONADO.md).

## 0.3.0 (25 de noviembre de 2026)

Release anterior a producción, desde `v0.2.0` (10 de noviembre de 2026).
Sube el minor porque hay funciones nuevas. La etiqueta `v0.3.0` no forma parte
de este cambio: la crea Pablo sobre el commit de `main` que se despliegue.

### Novedades

#### Extensión de Raycast ([#201](https://github.com/povedica/tick-tack-done/pull/201))

- Un comando «Nueva tarea TTD» envía el texto a la API sin interpretarlo. El
  token vive en las preferencias de Raycast y no se escribe en el repositorio.
- Ajustes → Integraciones muestra la tarjeta «Raycast (Mac)» con la descarga
  del código fuente, los tres pasos y el aviso de que es solo para Mac.

#### Filtro por persona asignada ([#179](https://github.com/povedica/tick-tack-done/pull/179))

- En el editor de filtros, «Asignado» elige a una persona y guarda su id de
  usuario. «Yo» aparece primero. Sin listas compartidas solo se ofrece «Yo».
  Si esa persona deja de estar disponible, la condición se conserva y se avisa.
- En 0.2.0 ese campo guardaba un nombre o un email, y el filtro comparaba el
  id: el texto no seleccionaba a nadie. A partir de esta versión la condición
  guarda el id. Una condición que ya tuviera un id sigue valiendo.

#### Correos con el mismo marco ([#205](https://github.com/povedica/tick-tack-done/pull/205))

- Todos los correos (resumen, cierre, recordatorio, cuenta atrás, contraseña,
  invitación y avisos de seguridad) salen con la misma cabecera, la tarjeta y
  el pie, en HTML y en texto plano.
- La cabecera lleva el icono de la app sobre una placa azul y el nombre
  TickTackDone. El botón es azul oscuro para que se lea en Outlook.
- El resumen diario lista hasta 20 tareas, con hora, lista, prioridad y
  etiquetas, y enlaza el resto a Hoy. El asunto cuenta las de hoy y las
  vencidas. El texto plano lleva el enlace de cada tarea.
- El correo se compone al enviarlo, con los datos de ese momento. Una tarea
  que ya no existe no se manda.

#### Permisos del token en tabla ([#198](https://github.com/povedica/tick-tack-done/pull/198))

- Al crear un token personal, los permisos se eligen en una tabla siempre visible
  con interruptores de Leer y Escribir, plantillas y confirmación de acceso total.
  Escribir incluye el permiso de lectura, porque la API no lo deduce, y la columna
  avisa de que permite crear, editar y borrar.

#### Cuenta atrás ([#163](https://github.com/povedica/tick-tack-done/pull/163))

- Filas legibles en móvil y tarjetas cuadradas en escritorio y tableta, con
  colores saturados y el menú con el estilo de la app. El alta y la edición
  tienen bandeja de emojis y calendario de fecha civil, en español y en inglés.
- El MCP puede actualizar todos los campos editables, restaurar y paginar
  (RF-2401–2405, RF-2431, RF-2440–2442, RF-2451–2455).

#### Calendario: resumen, rango y días locales ([#95](https://github.com/povedica/tick-tack-done/pull/95))

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
- En el seed efímero ×100, el resumen del año y la primera página de un mes
  sobre `tasks` y `external_events` quedan por debajo de 50 ms (p95) y de
  200 ms (p99). No se crea `calendar_entries`. Se reproduce con
  `bash scripts/perf-b0.sh`.
- El cambio de zona del perfil encola el recálculo de los eventos con hora.
  La petición no espera a reescribirlos. Las tareas siguen en su zona de captura.
- Un backfill rellena, en tandas de 500, los días locales de las tareas y de
  los eventos de día completo que ya existían.
- Cada respuesta `/api/*` lleva `Server-Timing` (`auth`, `db` con el número de
  consultas, `app`, `total`). Una consulta de más de 50 ms o una petición de
  más de 200 ms queda en el log con `X-Request-Id`, sin datos personales.
- `scripts/seed-perf.ts` solo escribe en Postgres efímero (`reflexionia_perf`).
  `TOKEN_RATE_LIMIT_TEST` no existe en producción.
- La línea base se reproduce con `pnpm perf:baseline`.

### Cambios

- El filtro por persona asignada pasa de texto libre a id de usuario. El
  detalle está en Novedades ([#179](https://github.com/povedica/tick-tack-done/pull/179)).
- Al crear un token, marcar Escribir envía también el scope de lectura
  ([#198](https://github.com/povedica/tick-tack-done/pull/198)).
- Un push a `main` despliega solo staging. Producción sale de un fast-forward
  a la rama `production`, con preflight y aprobación
  ([#168](https://github.com/povedica/tick-tack-done/pull/168)).

### Correcciones

#### Menú del tablero de proyectos ([#177](https://github.com/povedica/tick-tack-done/pull/177))

- El menú «⋯» recupera fondo, sombra y separación, también al abrir el tablero
  directamente. En el móvil el botón se queda visible. En oscuro, las columnas
  se distinguen con el borde que ya usa la app.

#### Contraste de las etiquetas en el filtro ([#182](https://github.com/povedica/tick-tack-done/pull/182))

- El fondo de la etiqueta en el resumen de una vista tiene al menos 3:1 con la
  superficie, en claro y en oscuro. La etiqueta sigue sin borde.
- Esa comprobación, y el resto de los e2e de filtros, corre en la integración continua.

#### Calendario y detalle de tarea ([#154](https://github.com/povedica/tick-tack-done/pull/154))

- La barra del calendario y el detalle de tarea usan los mismos botones, bordes
  y chips que el resto de la app. ‹, Hoy, ›, + y «Sincronizar ahora» quedan sin
  caja, y el icono de sincronizar gira mientras dura. El mes de la barra lateral
  y de los selectores de fecha se escribe abreviado («nov 2026»). En el móvil
  solo queda el icono de sincronizar.

#### Filtros en móvil y con teclado ([#178](https://github.com/povedica/tick-tack-done/pull/178))

- El foco de los menús del filtro ya no se mueve mientras el portal está oculto,
  y no vuelve a saltar después de confirmar un borrado. Los objetivos táctiles
  del editor y del menú lateral caben en el móvil, en claro y en oscuro.

#### Alta de cuenta atrás por MCP ([#204](https://github.com/povedica/tick-tack-done/pull/204))

- `create_countdown` acepta `target_date` en `YYYY-MM-DD`. Antes rechazaba
  cualquier alta con `date must be YYYY-MM-DD` ([#203](https://github.com/povedica/tick-tack-done/issues/203)).

#### Contratos del navegador ([#95](https://github.com/povedica/tick-tack-done/pull/95))

- Recuperar contraseña vuelve a mandar el POST. El idioma sale de la etiqueta
  del navegador, sin abrir el catálogo inglés que esa pantalla no tiene cargado.
- Las hojas de las rutas diferidas se publican con `emitFile`. El chip de
  enlace recupera los 24 px en escritorio y los 32 px en móvil. El CSS medido
  del entry más el calendario pasa de 29,0 KB a 36,4 KB gzip; el tope queda
  en 38 KB. El JS sigue en 247,2 KB, por debajo de 250.

### Seguridad

- Esta release no cierra el aviso de `effect` que llega por Prisma
  (`GHSA-7589-6fvf-x4pw`). Sigue igual que en `v0.2.0`.

### Mantenimiento

- Quién no tiene que llevar «Closes #N» sale de
  `scripts/backlog/exemptions.json`. Dependabot entra con el login
  `app/dependabot` y `is_bot`. Un token de solo lectura ya no tumba el
  check al intentar comentar
  ([#190](https://github.com/povedica/tick-tack-done/pull/190)).
- El harness queda alineado con el tablero de seis columnas y el trabajo en
  paralelo por Zona ([#155](https://github.com/povedica/tick-tack-done/pull/155)).
  Cada avance relevante deja un comentario de decisión en la issue
  ([#157](https://github.com/povedica/tick-tack-done/pull/157)).
  Una PR de agente tiene que empezar por `Closes #N` de una issue abierta.
  Un ajuste posterior al cierre abre una issue nueva y no reabre la original
  ([#172](https://github.com/povedica/tick-tack-done/pull/172)).
- CI por paths con `ci-ok`, caché de domain y de Playwright, integración en
  shards y timeouts. Imágenes ligeras con healthcheck, GHCR y caché BuildKit;
  el VPS hace pull incremental. La configuración sale de 1Password
  (importación privada, referencias por entorno y runbook). Staging va antes
  que producción, con backup antes de migrar y rollback de imágenes
  ([#160](https://github.com/povedica/tick-tack-done/pull/160),
  [#95](https://github.com/povedica/tick-tack-done/pull/95)).
  Los pasos manuales M1–M9 y las métricas pendientes siguen documentados, sin
  cambios de protección de rama ni migraciones Prisma en aquella entrega.
- Antes de migrar en staging o producción, el despliegue guarda un `pg_dump`
  local en el VPS, con permisos privados y retención de 30 días conservando
  las tres últimas. El backup diario externo no cambia
  ([#171](https://github.com/povedica/tick-tack-done/pull/171)).
- Dependabot: grupo minor y patch
  ([#165](https://github.com/povedica/tick-tack-done/pull/165)),
  Vite 6 → 8 ([#126](https://github.com/povedica/tick-tack-done/pull/126)),
  `@vitejs/plugin-react` 4 → 6
  ([#127](https://github.com/povedica/tick-tack-done/pull/127))
  y el grupo de GitHub Actions
  ([#164](https://github.com/povedica/tick-tack-done/pull/164)).
  Son herramientas de build y de CI. Las PRs de Dependabot aún abiertas el
  25 de noviembre (vitest 4, bullmq 6, web-push 4 y otras) no entran aquí.

### Base de datos y pasos manuales

Entran con el despliegue de esta versión. Prisma aplica tres migraciones. El
SQL de índices concurrentes no: hay que ejecutarlo aparte, en la base de ese
entorno, antes de dar por bueno el calendario nuevo.

- `20261029221000_calendar_local_days`: añade `local_start_day` y
  `local_end_day` a tareas y eventos, más descripción y lugar en
  `external_events`. El rollback está comentado en `migration.sql` (no hay
  `down.sql` aparte): quita esas columnas y sus índices.
- `20261030081000_calendar_versions`: tabla `calendar_versions` por dueño.
  Rollback comentado: `DROP TABLE "calendar_versions"`.
- `20261030090000_calendar_summary_index`: índice
  `external_events_summary_idx`. Rollback comentado: `DROP INDEX`.
- Paso manual, fuera de Prisma porque `CREATE INDEX CONCURRENTLY` no puede ir
  en la transacción de una migración:
  `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/prisma/manual/20261029_calendar_range_indexes.sql`.
  Vuelta atrás:
  `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/prisma/manual/20261029_calendar_range_indexes.down.sql`.

No hay otro cambio incompatible de API. Los endpoints de resumen y rango son
nuevos. El calendario público sigue leyendo el camino anterior.

## 0.2.0 (10 de noviembre de 2026)

Las secciones siguientes ya estaban en el archivo al etiquetar `v0.2.0` y no
llevaban número. Quedan dentro de esta versión para no perderlas.

### Backlog en GitHub Projects

- Plantillas de issues y PR, workflow y scripts de sincronización del backlog.
- Espejo del backlog, registro de decisiones y protocolo de trabajo.
- Reglas compartidas en AGENTS.md y skill de backlog para Cursor y Codex, compatibles
  con el campo nativo Status de GitHub. Espejo regenerado desde las issues reales.

### En la aplicación

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

### Revisión del paquete de listas

- Planificar un día completo conserva la estimación de esfuerzo. Antes se
  guardaba como 0 y desaparecía de la carga del día.
- Un proyecto no marca «vencida» una próxima acción cuyo inicio ya pasó si el
  vencimiento sigue por delante. Un inicio futuro tampoco cuenta como vencida.
- `GET /projects` incluye `owner_id`. Una lista de otro dueño no ofrece «Mover
  a carpeta».
- El cliente declara `before_id` y `move_to_end` al actualizar una lista.
- En el tablero de proyectos, una pulsación larga abre el menú de la tarjeta.

### Algún día más visible en la planificación

- La hoja «¿Cuándo?» muestra «Algún día» como píldora neutra, pareja de la X,
  en escritorio y en móvil. El calendario de la hoja no cambia.
- En la tarjeta de escritorio, duración y hora comparten fila y «Algún día»
  queda visible junto a Hecha y No lo haré. El menú «⋯» de esa tarjeta solo
  elimina. La tarjeta móvil sigue con sus controles de siempre.

### Carpetas, listas y lista-proyecto

- Una lista puede marcarse como proyecto (`is_project`) con resultado, estado
  En marcha o Pausado, y fecha de archivo (`closed_at`). Archivado es el mismo
  `closed` de la lista: no hay un estado «Hecho». Desarchivar vuelve a En marcha,
  salvo que se pida otro estado. Borrar un proyecto exige que esté archivado.
- Carpetas con totales, mover listas entre carpetas, y herramientas MCP de
  carpetas y de estado. El borrado de listas sigue siendo lógico.

### Contexto laboral

- Ajustes › Jornada guarda días laborables, carpetas, listas y etiquetas de
  trabajo, y puede ocultar lo laboral fuera de horario. «Mostrar trabajo» dura
  hasta el próximo inicio de jornada en todos los dispositivos. Los avisos
  laborales se retrasan hasta ese inicio (`work_hours`). El scope nuevo
  `workday:write` obliga a reautorizar los conectores que ya existían.

### Algún día en la hoja «¿Cuándo?»

- Al planificar, la hoja «¿Cuándo?» ofrece «Algún día» en la cabecera, a la
  izquierda del cierre. Un toque usa la misma decisión que la tecla A: marca la
  tarea como algún día, cierra la hoja y pasa a la siguiente. La tecla A y el
  menú «⋯» siguen igual.

### Integraciones más compactas

- Ajustes → Integraciones pasa a una sola lista: una fila por servicio, interruptores
  etiquetados y las acciones destructivas dentro de «⋯». En el móvil esas acciones
  salen en una hoja inferior. La conexión, los permisos y los textos de tratamiento
  de datos no cambian.

### Corrección del modo de sesión en producción

- Las compilaciones de producción activan siempre sesiones por cookie y CSRF,
  también cuando se generan fuera de Docker. Evita 403 al planificar el día,
  registrar ubicación y realizar otras escrituras con sesión.
- Regresión en CI sobre el artefacto de producción: apertura de planificación y
  ubicación exigen el token CSRF y no envían la identidad de desarrollo.

### Refinamientos de Hábitos, Calendario y Planificación

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

### Desarrollo local — copia de tareas

- RF-1703/1705: comando `scripts/refresh-local-task-data.py` para refrescar datos
  de tareas desde una cuenta de producción hacia la cuenta demo local. Incluye
  listas, etiquetas y relaciones, con lectura remota estricta, backup local
  verificado, importación transaccional e identificadores locales estables.
- Perfil privado fuera de Git y comprobaciones que rechazan bases de producción
  y Docker remoto como destino. No copia cuentas, credenciales, integraciones,
  hábitos, calendarios ni archivos binarios de adjuntos.

### Sin publicar — ajustes visuales PR77

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

### Staging — Telegram por usuario y Resend (23 de octubre de 2026)

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

### Sin publicar — PR75

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
