# Decisiones de ttd

Registro de decisiones de producto y técnicas. Una fila por decisión. Destino en el repo: `docs/backlog/DECISIONES.md`.

**Cómo se usa**
- Las decisiones las toma Pablo. Los agentes solo proponen opciones y una recomendación.
- Al decidir, se cambia el estado a **Decidida**, se rellena la última columna con la fecha, la elección y el motivo, y se hace en la misma PR que aplica la decisión (el check de backlog lo exige).
- Las decisiones que ya no aplican pasan a **Obsoleta**; no se borran.
- Las columnas Issue y Origen enlazan el BKL y el documento, citado por su nombre.

_Semilla: 29/10/2026 (hora de Madrid)._

## Abiertas

| ID | Pregunta | Opciones | Recomendación | Origen | Issue | Estado | Fecha · decisión |
|---|---|---|---|---|---|---|---|
| DEC-002 | Herramienta de versionado | release-please (automático desde commits) · changesets (a mano por PR) | release-please; el agente de versiones pule el texto en la PR de release | repo-publico/VERSIONADO.md, HARNESS.md §8-2 | BKL-017 | Abierta | |
| DEC-003 | Cómo limpiar el historial | B: reescribir este repo con `git filter-repo` · C: repo público nuevo y este como archivo privado | B si el repo va a volver a ser público (ensayado: de 95 a 5,6 MiB). Si sigue privado siempre, es opcional | repo-publico/PLAN-LIMPIEZA.md §3.0 | BKL-018 | Abierta | |
| DEC-004 | Protección de `main` con el repo privado | a) contratar GitHub Pro ya · b) seguir en Free y proteger cuando vuelva a ser público (hook local `pre-push` + CI mientras tanto) | b), salvo que el repo vaya a seguir privado mucho tiempo con varios agentes empujando | repo-publico/PLAN-LIMPIEZA.md §1.0 | BKL-018 | Abierta | |
| DEC-005 | Revisores con veto en el harness | Cualquier subconjunto de especialistas | Seguridad y privacidad, DBA y Rendimiento | repo-publico/HARNESS.md §8-5 | BKL-016 | Abierta | |
| DEC-006 | Memoria de los agentes | Engram compartido con el otro proyecto (proyecto `ttd`) · sin memoria hasta verificarlo | Sin memoria hasta verificar el CLI (Ola 4) | repo-publico/HARNESS.md §8-4 | BKL-016 | Abierta | |
| DEC-007 | Observabilidad | Autoalojada (OpenTelemetry + Prometheus/Grafana) · solo `Server-Timing` y logs | Empezar por `Server-Timing` y logs | repo-publico/HARNESS.md §8-6 | BKL-016 | Abierta | |
| DEC-008 | Cómo acepta `POST /tasks` el scope `tasks:create` | Implicación `tasks:write ⇒ tasks:create` · decorador `@AnyScopes` | Implicación, con un test que impida que llegue a Ticky | paquete-compartir-listas-scope/README.md D-1 | BKL-009 | Abierta | |
| DEC-009 | `raw_text` con un token que solo puede crear | Rechazar (403) · parsear sin crear listas ni etiquetas | Rechazar | paquete-compartir-listas-scope D-3, complemento-correo/SPEC.md D-5 | BKL-009 | Abierta | |
| DEC-010 | `POST /members` pasa a ser upsert (200 si actualiza, 201 si crea) | Sí · no | Sí; revisar Ajustes, que lo usa hoy | paquete-compartir-listas-scope D-4 | BKL-009 | Abierta | |
| DEC-011 | Dónde corren los 5 Playwright nuevos en CI | Job nuevo · dentro de `r80-browser-contracts` (cada spec ×4) | Job nuevo | paquete-compartir-listas-scope D-6 | BKL-009 | Abierta | |
| DEC-012 | Scope de Gmail del complemento | `current.message.readonly` (sensible, formulario relleno) · `current.message.action` (no sensible, un clic antes) | `readonly` en v1 y prueba de `action` antes de publicar | complemento-correo/SPEC.md D-1 | BKL-010 | Abierta | |
| DEC-013 | «Deshacer» tras crear desde el correo | A: quitarlo · B: `undo-create` limitado · C: pedir `tasks:trash` | A en v1 | complemento-correo/SPEC.md D-2 | BKL-010 | Abierta | |
| DEC-014 | Qué significa «Esta semana» | Viernes (hoy si ya es viernes a domingo) · domingo · +7 días | Viernes, y hoy si ya es viernes, sábado o domingo | complemento-correo/SPEC.md D-4 | BKL-010 | Abierta | |
| DEC-015 | Fecha por defecto de la tarea creada desde un correo | Sin fecha · mañana | Sin fecha | complemento-correo/SPEC.md D-8 | BKL-010 | Abierta | |
| DEC-016 | ¿La cuenta de correo del trabajo permite complementos personalizados? | Comprobación, no decisión | Probarlo en aka.ms/olksideload antes de invertir en Outlook | complemento-correo/SPEC.md U-1 | BKL-010 | Abierta | |
| DEC-017 | Zona horaria de referencia de la vista agregada del calendario | Perfil del usuario (servidor) · dispositivo (como hoy) | Perfil, con aviso si el dispositivo está en otra zona | arquitectura-calendario/ARQUITECTURA.md §8-1 | BKL-012 | Abierta | |
| DEC-018 | Ocurrencias futuras de tareas recurrentes en el calendario | Sí (y en qué vistas) · no | Sí en mes, semana y día; no en el año | ARQUITECTURA.md §8-2 | BKL-012 | Abierta | |
| DEC-019 | Modelo de fechas | A1 (día local derivado) · A2 (fecha civil como verdad, con migración) | A1 ahora; A2 solo si aparecen bugs de medianoche | ARQUITECTURA.md §8-3 | BKL-012 | Abierta | |
| DEC-020 | Listas compartidas en el read model | M1 · otra opción | M1, verificando antes qué ve hoy un miembro | ARQUITECTURA.md §8-4 | BKL-012 | Abierta | |
| DEC-021 | Consistencia del read model | B1 (misma transacción) · B2 (asíncrona) | B1 con un reparador asíncrono | ARQUITECTURA.md §8-5 | BKL-012 | Abierta | |
| DEC-022 | Resto de preguntas del techlead (§8-6 a §8-14) | Ver documento | Ver documento | ARQUITECTURA.md §8 | BKL-012 | Abierta | |
| DEC-023 | 1 petición extra al tocar un día con el endpoint agregado del año | Aceptable (con prefetch) · no | Aceptable | perf-vista-anual/SPEC.md §7-2 | BKL-011 | Abierta | |
| DEC-024 | Prueba de carga k6 contra producción | Sí (1 VU, 30 s, token de solo lectura) · solo staging | Sin recomendación en el documento. Propuesta: sí, fuera de horas | perf-vista-anual/SPEC.md §7-5 | BKL-011 | Abierta | |
| DEC-025 | Activar push (claves VAPID) en producción ya | Sí · más adelante | Sí: es solo configuración (B1) y lo primero de la hoja de ruta | perf-vista-anual/PWA-PUSH.md §6-1 | BKL-013 | Abierta | |
| DEC-026 | Actualizaciones de la PWA | Aviso «Nueva versión» · silenciosa con recarga al volver | Sin recomendación en el documento | PWA-PUSH.md §6-2 | BKL-013 | Abierta | |
| DEC-027 | Qué datos se guardan para leer sin conexión, y cuánto tiempo | Solo Hoy y Próximos · también calendario y proyectos | Sin recomendación en el documento | PWA-PUSH.md §6-3 | BKL-013 | Abierta | |
| DEC-028 | Contenido en la pantalla de bloqueo | Título de la tarea · texto genérico | Preferencia «Ocultar el contenido» (B6); falta elegir el valor por defecto | PWA-PUSH.md §6-4 | BKL-013 | Abierta | |
| DEC-029 | Publicar en tiendas | Play (TWA) sí/no · App Store (Capacitor, cuota anual y revisión) sí/no | Play si se quiere presencia en Android; App Store solo si el push web en iPhone no basta | PWA-PUSH.md §5 y §6-5 | BKL-014 | Abierta | |
| DEC-030 | Login en App Store (norma 4.8) | Sign in with Apple · otra opción que cumpla | Pendiente de DEC-029 | PWA-PUSH.md §6-6 | BKL-014 | Abierta | |
| DEC-031 | Nombre de la revisión semanal | «Mi semana» · «Pausa semanal» · «Riego» | «Mi semana» | revision-semanal/IDEAS.md §6-1 | BKL-015 | Abierta | |
| DEC-032 | Revisión semanal frente a `/review/weekly` y el informe | Fusionar · convivir | Fusionar la revisión; el informe queda como el correo que invita | IDEAS.md §6-2 | BKL-015 | Abierta | |
| DEC-033 | Motivos de «¿por qué no salió?» | Obligatorios · opcionales | Opcionales (1 toque); solo el destino de la tarea es obligatorio | IDEAS.md §6-3 | BKL-015 | Abierta | |
| DEC-034 | Unidad del mapa | Lista · carpeta | Lista, agrupada por carpeta | IDEAS.md §6-4 | BKL-015 | Abierta | |
| DEC-035 | Focos semanales | Número y si hay uno personal | Máximo 3, más un hueco opcional «para ti» | IDEAS.md §6-5 | BKL-015 | Abierta | |
| DEC-036 | Momento por defecto de la revisión | Domingo por la tarde · viernes a mediodía | Domingo a las 18:00, configurable, con el informe antes | IDEAS.md §6-6 | BKL-015 | Abierta | |
| DEC-037 | Desviaciones del Plan del día | Quitar o mantener: selector «Agrupar por», barra de progreso, texto «Sobrecargado · sobran X» | Quitar el selector nativo (no estaba aprobado); la barra es leve; confirmar el texto | revision-2026-10-27.md §3 | BKL-020 | Abierta | |
| DEC-038 | 14 decisiones asumidas en la spec de Filtros (DA-1…DA-14) | Confirmar · cambiar alguna | Confirmar: la PR #96 ya las sigue | filtros/SPEC.md §0 | BKL-001 | Abierta | |
| DEC-039 | Google OAuth | Publicar la app o verificarla · seguir en «Testing» | Publicar, cuando haga falta conectar Google con otra cuenta | addendum-google-mcp.md (TTD-AUD-47) | BKL-023 | Abierta | |
| DEC-040 | PRs de Dependabot | Fusionar las menores · probar vite 8 y vite-plugin-pwa 2 en una rama · cerrar | Fusionar las menores y probar las mayores aparte, antes de reescribir el historial | GitHub #39–#43, #79 | BKL-024 | Abierta | |

## Decididas

| ID | Pregunta | Opciones | Recomendación | Origen | Issue | Estado | Fecha · decisión |
|---|---|---|---|---|---|---|---|
| DEC-001 | Dónde vive el backlog | Fichero en el repo · GitHub Projects | Ambos | repo-publico/HARNESS.md §8-3 | BKL-016 | Decidida | 29/10/2026 · Pablo: los dos. El Project es el estado vivo y BACKLOG.md y DECISIONES.md van versionados en el repo, actualizados con cada cambio (PROTOCOLO-BACKLOG.md) |
| DEC-000 | Repo privado mientras se limpia | Privado ya · limpiar en público | Privado ya | repo-publico/HARNESS.md §8-1 | BKL-018 | Decidida | 28/10/2026 · Pablo puso el repo en privado |
