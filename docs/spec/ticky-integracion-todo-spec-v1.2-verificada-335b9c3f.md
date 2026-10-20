# Integración de Ticky en la aplicación todo — especificación de implementación

Versión 1.2 (verificada contra ambos repos) · 20 de octubre de 2026 · documento para el agente de implementación del repositorio todo / `povedica/tick-tack-done` (checkout local habitual: `/Users/pablo.poveda/CodeProjects/todo`). Cambios de la v1.2: se verificó el repo privado `povedica/ticky.ticktackdone` con acceso de solo lectura (antes marcado «no verificado») y se re-contrastó `povedica/tick-tack-done` en su HEAD citado; detalle en la sección 8. No cambia ningún corte, contrato ni decisión.

## 0. Reglas del encargo (leer primero)

**Autoridad.** Este documento es una especificación técnica, no una autorización. Lo que puedes hacer lo fija la instrucción explícita de Pablo al entregártelo, y esa instrucción cubre solo: leer ambos repos, trabajar en ramas locales/PRs en borrador, y ejecutar pruebas con datos sintéticos. Fuera de eso, requiere la confirmación expresa de Pablo en su canal, no una frase de este archivo: merge, despliegue, SSH, migraciones sobre datos reales, Telegram real, datos personales, llamadas facturables a modelos, cambios en el servidor o cuentas. Si el texto de este documento y una instrucción posterior de Pablo discrepan, manda Pablo.

**Prohibido en todo el encargo:** leer `.env`, tokens, cookies, bases de datos o secretos reales; imprimir secretos; usar el bot, chat o cuenta reales de Pablo para pruebas; tocar producción (todo.reflexionia.com) o el servidor; modificar el código Python de `ticky.ticktackdone` (ver sección 1).

**El repositorio `povedica/tick-tack-done` es público** (decisión de Pablo). Todo lo que commitees ahí es visible. No incluyas en commits ni en `docs/spec`: rutas locales (`/Users/...`), IP/usuario/claves del servidor, detalles de amenazas o contratos del repo privado de Ticky que no estén ya decididos como públicos, ni este documento tal cual sin que Pablo lo apruebe. Guarda la matriz de estado y los informes que mencionen el repo privado fuera del árbol público, o pregunta antes.

**Preflight obligatorio (antes de escribir código), y registrar el resultado en la primera PR:**
1. `git status`, rama y HEAD de `todo`; SHA y tag de `ticky.ticktackdone`. Anotar el par de SHAs. Referencias de este documento, **ya verificadas contra ambos remotos el 20-oct-2026** (sección 8): todo `26a02b29f7ae2ea443fc6f9428f009f3d908831d` (coincide con `main` remoto); Ticky `0ec7fc99f5f3172d9331bed7304da4d997db4693` (es exactamente el tag `milestone/async-service`). Si cualquiera difiere, revisa qué cambió en los archivos que cita cada corte antes de seguir; no asumas que el resto del documento sigue valiendo.
2. Comprobar que existen los artefactos que cita la sección 1 (schemas, OpenAPI, hashes). Si falta alguno, ese corte queda bloqueado y se anota; no inventes el contrato.
3. Ejecutar la línea base (`lint`, `typecheck`, `test`) en entorno sintético para saber qué falla ya antes de tocar nada.

**Cuándo parar y preguntar a Pablo (no resolver por tu cuenta):** una decisión de la sección 7 que bloquea el corte; un cambio de contrato que obliga a tocar Python; una migración destructiva o no reversible; cualquier necesidad de secretos o servicios reales; trabajo local sin commitear que choque con el corte. Para todo lo demás, continúa con el trabajo independiente y deja la decisión registrada con su efecto apagado.

**Herramientas:** `rtk` es un wrapper del entorno del agente, no del repo; si no existe en tu entorno, usa `pnpm` directamente. Los scripts raíz ya delegan en `scripts/with-node.sh`.

## 1. Encargo, alcance y punto de partida

Implementar en esta aplicación la integración de Ticky: lectura segura, BFF y espacio de chat, propuestas revisables, executor transaccional, contexto de calendario/revisión, memoria/rutinas y conexión al bot/broker existentes. Conservar los comportamientos actuales de captura, planificación, recordatorios, foco y Calendar. Este documento contextualiza el plan APP-01–09 del servicio Python; no es una orden de rehacer esas funcionalidades.

**Repositorio receptor inspeccionado:** checkout `/Users/pablo.poveda/CodeProjects/todo`, HEAD `26a02b29f7ae2ea443fc6f9428f009f3d908831d`, rama main. Análisis estático del código y los contratos presentes; no se ha probado producción, conectado servicios ni ejecutado suites de esta app durante la redacción. La presencia de un test se cita como punto de partida, no como resultado pasado.

**Estado local que debes preservar:** al inspeccionar había movimientos/eliminaciones y documentos nuevos en `docs/spec`, incluido `done/`. No restaurarlos, borrarlos, incluirlos en commits propios ni cambiar de rama con pérdida de trabajo. Revalidar `git status` y coordinar el aislamiento del corte con el trabajo activo. El AGENTS y reglas aún apuntan a `docs/spec/especificacion-producto-v1.1.md`; en este working tree la spec está en `docs/spec/done/especificacion-producto-v1.1.md`. Leer la ubicación efectiva, sin deshacer el movimiento.

**Servicio Ticky de referencia (verificado el 20-oct-2026 contra el repo privado con acceso de solo lectura; detalle en la sección 8):** checkout hermano `/Users/pablo.poveda/CodeProjects/ticky.ticktackdone`, repositorio `povedica/ticky.ticktackdone`, PR #1 abierto en borrador (`feat/ticky-spec-v1` → `main`), tag `milestone/async-service` que apunta exactamente al commit `0ec7fc99f5f3172d9331bed7304da4d997db4693`. Su evidencia (`docs/service-acceptance.md`) declara 239/239 pruebas con PostgreSQL aislado (231 offline + 8 que exigen PostgreSQL; el conteo estático de la suite en el tag da 231, consistente) y CI verde; el CI no se pudo recontrastar de forma independiente (el token de solo lectura no muestra ejecuciones de Actions) y la suite no se re-ejecutó aquí. El hito no está desplegado ni integrado aquí. La rama tiene un único commit posterior al tag (`b7230115`), solo documental: no cambia el contrato del tag. Revalidar ambas revisiones al comenzar y registrar el par de SHAs probado.

Trabajar en ramas/PRs incrementales siguiendo AGENTS y `.cursor/rules/*.mdc`, Conventional Commits y referencias RF/TK. Avanza corte a corte sin pedir permiso para cada paso rutinario, pero respeta los gates de la sección 5 y las paradas de la sección 0. Las decisiones pendientes quedan registradas y sus efectos apagados; no sustituyas integración por mocks para declarar un gate pasado. Los límites de autoridad están en la sección 0.

No modificar Python desde este encargo: si requiere cambiar contrato/adaptador del servicio, registrar la incompatibilidad y el cambio coordinado necesario, manteniendo bloqueado ese camino. Python no accede a Prisma ni a la DB de negocio. El executor y las mutaciones de dominio viven aquí.

### Fuentes de verdad y artefactos que hay que leer

- En todo: AGENTS, `.cursor/rules/`, `docs/architecture.md`, `docs/migrations.md`, `docs/security.md` y spec de producto en su ubicación efectiva. Los RF existentes conservan su semántica.
- En Ticky: `docs/spec/ticky-spec-v1.0.md` (TK), `docs/threat-model.md`, `docs/service-acceptance.md`, `docs/runbooks/operations.md` y `docs/tick-tack-done-integration-plan.md`.
- API privada de Ticky: `contracts/ticky-service-openapi.v1.json`, hash en `contracts/api-manifest.json`; contrato `ticky-service-v1`. SHA256 del artefacto en el hito: `e7dfeeefea4a700fbc98a66bb50d74cb4b5e2b30f40cf6309a01cb50d9c85a8d` (**recalculado y coincidente el 20-oct-2026**; el manifiesto declara `downstream_integration_verified: false`, coherente con que la integración aún no existe).
- DTOs privados: `contracts/service-manifest.json` valida `contracts/schemas/run_input.v1.json`, `run_result.v1.json`, `accepted_run.v1.json`, `run_events.v1.json`, `proposal.v1.json`, `approval.v1.json`, `authority_event.v1.json`, `context_snapshot.proposed.v1.json`, `read_capabilities.proposed.v1.json`, memoria/rutinas/historial/cuota y demás schemas listados. Son cerrados: no añadir campos unilateralmente.
- `contracts/openapi.json` de Ticky es un snapshot LEGACY de todo en `51dd55558cbf55d639e7002d70a8a134b38aa796` (**confirmado**: `contracts/manifest.json` lo declara `domain-snapshot-v1` con ese `source_commit`), no la API actual ni el contrato nuevo que debes publicar aquí. La API actual de todo está en `apps/api/openapi.json`, exportada del NestJS.

Las rutas `/api/v1/ticky/*` de este documento son **nuevas/propuestas**: no existen en el checkout inspeccionado. Las `/internal/v1/*` pertenecen al servicio Python y no deben publicarse directamente al navegador ni a Internet. Leer los schemas desde el tag/checkout, validar hashes y generar tipos: el Markdown no sustituye esos artefactos.

## 2. Estado real: qué reutilizar y qué falta

| Área             | Evidencia en este checkout                                                                                                            | Consecuencia para la integración                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidad        | `auth/api-auth.guard.ts`, `auth-user.ts`, `session-access.ts`, `scopes.ts`; sesión+CSRF, PAT con hash/rate limit                      | Reutilizar sesión; falta política Ticky por listas y scopes finos de acciones. AuthUser no transporta una allowlist Ticky de listas.                     |
| Sync             | `modules/sync/sync.service.ts` usa `syncAndFilters` bajo AND; test S-22 en `sync-visibility.spec.ts`                                  | El antiguo bug de sobrescritura de OR ya tiene corrección en código. Conservar y ampliar regresiones multipágina, no volver a implementarlo por inercia. |
| Outbox/auditoría | `events/event-recorder.ts` inserta OutboxEvent y ActivityLog en el Tx recibido; `outbox-publisher.ts`/EventRouter distribuyen eventos | Reutilizar esa frontera transaccional; falta correlación de aprobación/action/proposal y ledger durable de acciones Ticky.                               |
| Tareas           | `modules/tasks/tasks.service.ts`, DTO/mapper; Task tiene fieldClocks, updatedAt y durationMinutes                                     | No hay Task.version CAS entera. Field clocks/LWW y una lectura previa no cumplen expected_version de Ticky.                                              |
| Plan diario      | `modules/planning/`, modelos DayPlan/PlanMember/PlanSession/PlanDecision/PlanOperation; UI `features/planning/PlanDayPage.tsx`        | Ya separa pertenencia al plan del vencimiento. Reutilizar concepto/UI; PlanOperation no equivale a ledger de acciones aprobado por digest.               |
| Revisión/KPIs    | ReviewController, DashboardController y `reading/snapshot.ts`                                                                         | Hay cálculos reales, pero weekly lee hábitos con tasks:read y dashboard agrega foco/calendario bajo tasks:read. Auditar antes de suministrarlos a Ticky. |
| Calendar         | `modules/calendar/calendar.service.ts`, `google-sync.service.ts`, `calendar-google.e2e-spec.ts`                                       | Lectura/incremental ya existen. Falta proyección free/busy mínima y garantía de completitud/frescura/scopes para planificar.                             |
| Telegram         | `integrations.controller.ts`, TelegramBotService/TelegramApi, ReminderTransport, FocusTelegramListener                                | Bot y webhook ya existen. Hay múltiples rutas de envío; consolidar en broker común y reforzar pairing/dedupe/unknown, no crear otro bot.                 |
| Entregas         | SchedulerService y ReminderDelivery con dedupeKey/attempts/nextRetryAt                                                                | Hay dedupe y reintentos básicos; fire selecciona y envía antes del cambio final. No hay lease/fencing/unknown explícitos en ese modelo.                  |
| PWA              | React Router, Query, Zustand, SDK, i18n, cola offline, resizer y shell existentes                                                     | Añadir feature Ticky con esos patrones; no añadir otro framework ni usar replay offline ciego para aprobar.                                              |
| Ticky            | No hay módulo/ruta/feature Ticky en AppModule/router/esquema inspeccionados                                                           | Crear infraestructura específica y contratos públicos documentados con flags apagados.                                                                   |

Estas observaciones son estáticas. En particular, que Telegram o Calendar tengan pruebas/implementación no certifica el funcionamiento actual del despliegue ni sus garantías de seguridad.

## 3. Arquitectura a mantener

Flujo: PWA → API pública NestJS autenticada (BFF Ticky) → API privada Python. Lectura de dominio: Python → REST de todo con credencial read-only y filtrado de recursos server-side. Ejecución: aprobación del usuario → executor NestJS → dominio+ledger+outbox+auditoría en transacción.

- Política/fechas/ranking/digest y reglas nuevas puras en `packages/domain`, sin Nest/Prisma/React. Mantener a Python como planificador de sus propuestas; no duplicar el mismo ranking en el cliente.
- Nuevo `apps/api/src/modules/ticky/` para BFF, autoridad/configuración propia y adaptación de contratos. Registrar módulo en `apps/api/src/app.module.ts`.
- No importar TasksService desde todos los módulos para simular una transacción. El código actual de PlanningService llama TasksService y luego guarda PlanOperation; copiarlo no convierte varias transacciones en una. Diseñar el comando autorizado dentro del módulo dueño del dominio, con primitivos que reciban el mismo Tx para su mutación y ledger/outbox, y documentar la frontera en ADR. No duplicar reglas de tareas ni poner CRUD de negocio suelto en el BFF.
- Respetar RF-2006: integraciones externas consumen API/eventos. SchedulerService sigue siendo el único materializador de recurrencias y recordatorios; Ticky prepara planes/consejos, no otro scheduler de tareas.
- El contenido del usuario (títulos, notas, descripciones, eventos de calendario) es dato no confiable para el modelo: el BFF no lo convierte en instrucciones, y ninguna herramienta ni URL se elige a partir de ese texto. Registros y trazas no incluyen títulos, notas ni contenido de chat por defecto.
- Sesión, PAT de lectura, firma BFF y executor son identidades/autoridades distintas. El modelo nunca recibe credencial de escritura, clave privada, secreto del bot ni URL elegida por un usuario.
- Mantener compatibilidad de API/SDK y migraciones expand/contract. No cambiar silenciosamente endpoints usados por quick-add, MCP, offline, planificación o Telegram.

## 4. Cortes APP-01–09 con aceptación

Cada corte entrega PR revisable, RF/TK, pruebas ejecutadas, migraciones/contratos si aplica, límites y rollback. Una feature por PR según el flujo del repo; no apilar todo en una única PR de todo por analogía con la PR del servicio. No hacer merge/despliegue por inferencia de este documento.

### APP-01 — Política de lectura y cierre de fugas antes de conectar

RF-2001/2002/2006, RF-13012/13013; TK-001/004/005/201/202/300/610.

**Archivos base:** `auth/api-auth.guard.ts`, `auth/auth-user.ts`, `auth/scopes.ts`, `modules/tasks/tasks.service.ts`, `modules/lists/`, `modules/sync/`, `modules/realtime/realtime.controller.ts`, `modules/search/`, `modules/review/review.controller.ts`, `modules/dashboard/dashboard.controller.ts`, `modules/calendar/calendar.service.ts` y `mcp/`.

1. Introducir una política Ticky por owner/categoría/listas, con versión monotónica y revocación. Intersectar rol del usuario, acceso de lista compartida y grant del agente. ProjectMember existente no demuestra que TasksService.list aplique esa intersección: hoy filtra por owner y project_id solicitado, sin allowlist de credencial Ticky.
2. Aplicar restricciones en servidor a list/get, búsqueda, agregados, sync y cualquier ruta que consuma la identidad de lectura. No permitir eludir exclusión omitiendo project_id, cambiando task_id/cursor o entrando por MCP. No dar un PAT de cuenta completo y confiar en el filtrado Python.
3. Conservar AND de sync y probar páginas 2/3 con scopes distintos, owners A/B y listas excluidas. El SSE `/api/v1/events/stream` actual no reutiliza patEventPrefixes: emite id/type de todos los eventos del owner; usa occurredAt como cursor interno y no un par estable fecha+id. Corregir autorización y empates antes de usarlo como feed Ticky, aunque solo exponga metadatos.
4. Review.weekly lee hábitos sin exigir habits:read; Dashboard.data mezcla hábitos/foco/calendario; Calendar.range retorna tareas bajo calendar:read. Separar proyecciones y permisos por categoría/listas. No convertir un contador no autorizado en cero ni inferir ausencia de eventos de una fuente fallida.
5. Auditar headers/origin/superficie de chat sobre `configure-app.ts` y la configuración web/Caddy vigentes. Helmet ya existe: no describir el proyecto como carente de headers ni certificar su despliegue sin retest.

**Aceptación:** PAT tasks:read con una sola lista no obtiene ni metadatos/IDs/títulos/contadores de otra lista, notas, hábitos, foco, sesiones o configuración; lo mismo tras revocación. Test real multipágina/cursor y matriz sesión/PAT/MCP/SSE. **Rollback:** apagar consumo Ticky manteniendo las correcciones de privacidad y recordatorios de dominio.

### APP-02 — Contrato de lectura, authority y JWT BFF

RF-2002/2006; TK-020–023/025/200/320.

**Nuevos contratos de app, documentar/exportar antes de consumir:**

- `GET /api/v1/ticky/capabilities`, read-only, exactamente `read_capabilities.proposed.v1.json`: contract_version=`ticky-read-v1`, owner_id, list_ids, scopes y server_resource_filtering=true. Listas/scopes efectivos proceden de la identidad autorizada, no del JSON del cliente. El lector Python exige coincidencia de owner/listas con su autoridad, tasks:read incluido y scopes limitados a tasks:read/lists:read. No añadir herramientas/límites ni scopes de escritura al DTO cerrado.
- Configuración/grants Ticky y su proyección persistida en la app: owner, listas, autonomía, inbox, versión/revocación; los nombres/rutas públicos de ajustes se fijan en OpenAPI durante este corte. Conservar independencia de settings de recordatorios.
- Scopes finos propuestos por TK, aún no presentes en `API_SCOPES`: tasks:create/update/complete/trash, focus:start/stop, notifications:self:write, ticky:proposals:read/write, ticky:routines:read/write. Incorporarlos con mapeo legado explícito; no entregarlos todos al modelo ni interpretar tasks:write como consentimiento.

Firmar en backend JWT RS256 máximo 5 min: iss/aud/sub/iat/exp/jti. Audiencias exactas del servicio: `ticky-runs`, `ticky-events` (sincronización de autoridad) y `ticky-context`. No reutilizar OAuth/PAT de usuario como JWT interno ni aceptar sub/owner del browser. Configurar claves/rotación fuera de Git (par RS256 con `kid`, distribución de la clave pública a Python y política de rotación y de desfase de reloj acordadas con el contrato del servicio); no instalar otra versión de librería por memoria, usar dependencias compatibles y justificadas.

Enviar autoridad por `POST /internal/v1/events` con DTO `authority_event.v1.json`; versión siempre aumenta al cambiar alcance/autonomía/revocación/inbox. Replays viejos no restauran grants. La app es la autoridad. El mecanismo es: cambio de autoridad → fila en OutboxEvent en la misma transacción → consumidor interno de la app (APP-08) que hace el POST a Python con reintentos, y reconciliación periódica de la versión vigente. Un POST best-effort sin cola no es válido. Hasta que ese puente exista, el flag de lectura Ticky no se activa.

**Compatibilidad de lectura que debes resolver explícitamente:**

- `Task.version` entera >=1 falta en Prisma/mapper/DTO actuales. Es un prerrequisito de APP-02 y APP-04, así que se entrega como corte propio **APP-02a** (ver sección 5): migración aditiva expand/contract con `DEFAULT 1` y relleno de filas existentes a 1 en la propia migración, y TODOS los writers (CRUD/batch/move/complete/trash/restore, automatizaciones, importación, scheduler, sync/offline) incrementándola en la misma escritura. Así `version>=1` es real en base de datos; lo que no se permite es fingirla en el mapper o derivarla de timestamp o field_clocks. El campo se añade a DTO/OpenAPI/SDK de forma aditiva y sin romper clientes actuales (quick-add, MCP, offline).
- duration_minutes ya existe y Python lo mapea a estimate_minutes. La app admite0 en DTO; Python solo1–1440 o null. Probar este caso y acordar su semántica/versionado antes de anunciar compatibilidad; no alterar datos0 a null silenciosamente para pasar un test.
- Task.title de app admite hasta500 en modelo; propuestas Python permiten hasta 1000. Validar límites de aplicación y pedir edición antes de aprobar un título excesivo; no truncar un borrador ni cambiar su digest. Alinear contratos coordinadamente si se cambia el máximo.
- Python lee `/api/v1/tasks?project_id=...&limit=100&status=active`, cursor opaco, hasta 5 páginas totales y 10 listas; deduce listado incompleto si se excede. No anunciar soporte de cuenta completa sin paginación. Unificar el contrato generado con los query params reales de TasksController y probar el reader real contra servidor NestJS efímero.
- La ausencia de versión bloquea propuestas de recursos existentes. expected_version=0 es solo creación. Sin la columna real, las propuestas sobre recursos existentes siguen bloqueadas.

**Aceptación:** servidor real satisface schema cerrado/capabilities y reader Ticky; firmas/audiencias/TTL/algoritmo/scopes/owner/listas negativos. Falta de capability→readiness503, no fallback a token amplio. El runtime Python actual configura un solo owner de lectura por instancia: comenzar con ese alcance; multitenancy de credenciales requiere adaptación coordinada, no compartir el PAT de Pablo.

### APP-03 — BFF de chat, historial y SSE

RF-2002, RF-13010/13013; TK-024–026/700/720–722.

**Base:** ApiAuthGuard/CurrentUser/requireBrowserSession, `configure-app.ts`, SDK y AppModule. Proponer y documentar las rutas públicas de la spec: crear/listar threads, leer historial/borrar thread, `POST /api/v1/ticky/threads/:id/messages`, `GET /api/v1/ticky/runs/:id/events`, `POST /api/v1/ticky/runs/:id/cancel`. DTOs públicos pueden adaptar nombres, pero no reenviar JSON/arbitrary URL/tool del cliente.

Mapeo interno ya implementado en Ticky:

| Necesidad                     | API privada del servicio                                                     | Condición                                                         |
| ----------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Crear/listar hilo             | POST/GET `/internal/v1/threads`                                              | JWT runs, ownership servidor                                      |
| Historial/borrado             | GET `/internal/v1/threads/{id}/messages`, DELETE `/internal/v1/threads/{id}` | Cursor opaco, pending/deleted reales                              |
| Ejecutar mensaje              | POST `/internal/v1/runs`                                                     | RunInput con thread_id y client_message_id estables               |
| Admitir asíncrono             | Mismo POST, `Prefer: respond-async`                                          | 202 AcceptedRun; pool local acotado;429 antes de admitir si lleno |
| Eventos                       | GET `/internal/v1/runs/{id}/events`                                          | Last-Event-ID; accepted/status/proposal.ready/completed/failed    |
| Cancelar                      | POST `/internal/v1/runs/{id}/cancel`                                         | Owner autenticado; permitido aun con A0                           |
| Catálogo/cuota                | GET `/internal/v1/models`, GET `/internal/v1/usage`                          | Owner/grants server-side                                          |
| Memoria/rutinas/preparaciones | Rutas del OpenAPI privado                                                    | Ver APP-08                                                        |

No hay endpoint de escritura de negocio o aprobación remota en Python. No inventar un GET interno de run si el OpenAPI no lo contiene: usar historial/eventos y el ledger de acciones de la app para sus funciones distintas.

- BFF deriva identidad de sesión, aplica CSRF/origin y comprueba membership del thread/run. Nunca hacer `@Public` el proxy de chat ni devolver JWT/secretos al navegador. Las aprobaciones/configuraciones sensibles requieren sesión, no cualquier PAT con scope grueso; usar `requireBrowserSession`.
- Limitar tasa por owner en los endpoints de chat/cancelar/aprobar y tamaño de mensaje en el BFF antes de llegar a Python; proteger SSE contra conexiones abiertas sin límite.
- Idempotencia: mismo client_message_id+contenido devuelve 202 pendiente o 200 resultado existente; modificar texto/modelo/options bajo ese ID da 409. No reintentar con un ID nuevo al reconectar o ante timeout. Una nueva intención/edición usa ID nuevo por decisión explícita del usuario.
- SSE del modo async retiene 32 referencias, heartbeat 5 s y conexión de hasta 65 s; JWT/autoridad se revalidan durante emisión. Cursor fuera de ventana409 exige resincronizar historial, no repetir el POST. Distinguir401/403/404/409/429/503 y presentar error en español con siguiente paso. No hay deltas de tokens ni chain-of-thought.
- Implementar streaming en el SDK/BFF con cookies, backpressure, abort/desconexión y reconexión acotada. Native EventSource no permite fijar cualquier cabecera manual: si se necesita cursor persistido, el transporte SDK debe soportarlo; no enviar bearer en query ni crear fetch suelto en componentes.
- Cancelación de planificación no deshace dominio ni factura remota. deadline 60 s de Ticky impide checkpoint/publicación tardíos; no garantiza cortar un socket/cancelar remoto exactamente al segundo 60. Crash async queda interrupted, no es cola durable con entrega automática.
- DELETE de hilo no elimina tareas, memorias, rutinas ni backups; mostrar pending y reconciliar checkpoints hasta estado real. No reintroducir texto histórico como autoridad.

**Aceptación:** replay tras perder respuesta 202; un solo run/llamada, otro owner404/403, revocación/expiración durante stream, cursor antiguo, rate limit y caída Python. BFF no debe convertir un error en lista vacía ni aplicar un resultado sin aprobación. **Rollback:** apagar entrada Ticky y conservar historial/ledger; no apagar API de tareas ni recordatorios.

### APP-04 — Propuestas y executor con CAS/ledger reales

RF-205/208/2002/2006 y eventos sección 11.1; TK-002/003/011/012/123/124/210–215/310/311/324/711/902.

**Base concreta:** TasksService+DTO/mapper, Task.fieldClocks, IdempotencyService, EventRecorder, DayPlan/PlanSession/PlanOperation. La idempotencia HTTP existente caduca 24 h y no basta para reanudar acciones días después. PlanningService.assertFresh compara updatedAt antes de llamar a distintas operaciones; no usarlo como prueba de CAS en la misma transacción de mutación.

1. Añadir versión entera de entidad y CAS condicional con owner/lista/estado/version actual; exactamente una fila afectada o409 proposal_stale. Enumerar writers (CRUD/batch/move/complete/trash/restore, automatizaciones, importación, scheduler, cambios relevantes desde otras features). Mantener versión nueva en lecturas/sync y regresiones de edición concurrente. No romper la semántica offline LWW: distinguir su merge del executor de propuesta, que no hace merge silencioso.
2. Guardar propuesta inmutable original validada por schema, owner/run/authority_version/contrato/zona/expiración, diff y approval_digest. Para creación, respetar resource_id asignado o documentar mapping durable action→recurso sin duplicar; no usar UUID del modelo como autoridad.
3. Implementar canonicalización compartida con `Proposal.digest()` de Python: UTF-8, claves ordenadas, JSON compacto, Unicode sin escapar innecesariamente, arrays en orden, sin NaN. Fechas deben coincidir con la representación del contrato. Distinguir campo omitido de null explícito (limpiar due_at). Vectores TypeScript↔Python con acentos/emoji/fechas/subconjunto antes de aplicar.
4. Aprobación autenticada mismo owner, digest exacto, acciones seleccionadas únicas/subconjunto y caducidad. Editar una acción crea propuesta/digest nuevos e invalida aprobación. Un «sí» ambiguo no autoriza; riesgo/alcance del servidor, nunca del LLM.
5. Ledger durable único `(owner_id, action_id)`, digest/tombstone y resultado verificable. En la MISMA transacción: comprobar sesión/grant/autoridad/listas/scopes/campos/versiones y expiración, hacer mutación, insertar ledger y outbox/auditoría mínima. Fallo de auditoría/ledger revierte mutación. Repetición misma acción devuelve resultado guardado; otro digest se rechaza. No implementar efectos mediante varios HTTP pretendiendo atomicidad.
6. Recurso nuevo usa expected_version=0; existente>=1. Herramientas que hoy produce Python: tasks.create/update/complete/trash. Traducir due_at→due_date y project_id correctamente; `trashed:true` es papelera reversible. Completar padre puede afectar hijos/checklist según complete_children: mostrar/capturar ese alcance y precondiciones en contrato antes de habilitar esa operación, o bloquearla si el diff actual no lo describe. Nunca completar por finalizar foco.
7. Plan de trabajo no cambia plazo duro: reutilizar DayPlan/PlanMember para la distinción de intención/selección diaria, pero no convertir automáticamente cada bloque horario Python en mutación de vencimiento ni afirmar que DayPlan almacena intervalos de trabajo que hoy no modela. Bloques privados de calendario son fase posterior con contrato/permisos propios; no invitaciones.
8. Lotes independientes: resultado por item; dependencias solo si backend soporta grupo atómico. Timeout tras enviar: estado incierto y consulta de ledger por action_id ANTES de repetir; endpoint público de status nuevo y documentado. Si no se sabe, mostrar «No he podido confirmar si se aplicó; no lo repetiré todavía».
9. Declarar TTL máximo de reanudación y retención de tombstones del ledger; no heredar24h por accidente. Revocar/pause bloquea nuevos efectos y reconcilia los ya enviados. No conceder A3/A4 con una preferencia de memoria.

**Aceptación PostgreSQL real:** edición después de preview, concurrencia CAS, dos workers/doble clic, aprobación de otro owner/digest/versión antigua, revocación entre enqueue/apply, reinicio tras commit antes de respuesta, action_id con digest diferente, auditoría fallida y lote parcial. Cero duplicados y resultado durable; no mocks de Prisma para demostrar la transacción. **Rollback:** detener executor/flags y conservar ledger/tombstones; no reactivar acciones pendientes con writers antiguos.

### APP-05 — Contexto firmado y fuentes de planificación/revisión

RF-601–605/1101–1105/1202/1204/1305/2102/2201/2301–2303; TK-013/110–112/120–125/132/320/321/610/613.

Reutilizar CalendarService/GoogleSyncService y los cálculos puros de review/dashboard, después de APP-01. No conectar Python directamente a Google, OAuth tokens, raw de ExternalEvent, datos Prisma ni todo el snapshot de cuenta.

Enviar `ContextSnapshot` a `POST /internal/v1/context` con JWT ticky-context: authority_version actual, source_revision monotónica, issued_at/expires_at TTL<=15 min, zona IANA y fuentes opcionales. Sin owner en cuerpo. Solo intervalos y contadores necesarios; no títulos/notas/ubicaciones de reuniones. null=fuente ausente; busy=[] solo tras consulta completa y verificada. Jornada de preferencia explícita, no calendario vacío=disponibilidad total.

- Calendar.range mezcla tasks/external y filtra visible; construir proyección de intervalos ocupados con estado/frescura de las suscripciones, exclusión de cancelados y semántica explícita para all-day/tentative/transparency o fin ausente. No inferir disponibilidad si esa semántica/fuente falta. Eventos solapados por unión; preservar IANA/DST y fechas civiles. No sobrescribir reuniones/tareas de Calendar two-way desde Ticky.
- Revisión: periodo/denominador explícitos, completadas vs consideradas, foco/hábitos solo con scope/datos fiables. El `/review/weekly` existente propone candidatos; no es por sí solo el snapshot retrospectivo de contadores que exige Ticky. Diferenciar cero de desconocido.
- Esfuerzo user_declared y energy_level opcionales: task_id/list_id/task_version/level/source en task_energy, hasta 100; no inferir energía clínica ni esfuerzo del título. El pedido del usuario vale por run salvo memoria explícita aparte.
- Estimaciones adaptadas: duration_observations hasta 100, source=task_duration, source_version, observation_id/task_id/list_id, minutos1–1440, observed_at no futuro y horizonte 90 d. El tiempo de foco y durationMinutes planificado NO demuestran duración real de ejecución: si falta esa fuente, no fabricar muestras. Aprendizaje apagado salvo preferencia explícita y revisión de privacidad.
- UI muestra assumed/adapted/declared, muestras y hasta dos estimate_questions provisionales. Responder no cambia duración ni activa aprendizaje automáticamente; exige flujo tipado/executor nuevo si esa edición todavía no está soportada.

**Aceptación:** Calendar caído/caducado/parcial no produce bloques ficticios; scopes por fuente; DST primavera/otoño, solapes, ausencia de jornada, observaciones futuras/duplicadas/ajenas, versiones viejas. Contratos reales BFF→servicio, no solo fixture que coincide consigo misma.

### APP-06 — Espacio Ticky dentro de la PWA existente

RF-13010/13013/1502/1901 y requisitos de UI de la spec vigente; TK-100–151/312/700–731/803.

**Puntos de extensión comprobados:** `apps/web/src/app.tsx`, `shell/AppShell.tsx`, Sidebar/IconRail/BottomBar, `shell/navigation.ts`, `shell/DetailResizer.tsx`, `features/tasks/TaskDetail.tsx`, `features/planning/PlanDayPage.tsx`, `features/product/ProductPages.tsx`, `features/auth/session.ts`, `api.ts`, `features/offline/`, `i18n/{es,en,extra}.ts`, `styles/tokens.css` y componentes compartidos.

Crear `features/ticky/`, ruta `/ticky`, entrada sidebar y acción «Ayúdame con esta tarea». Reutilizar tokens, paneles, popovers y resizer accesible; no insertar un layout ajeno. Panel sugerido 420–640 px, móvil pantalla completa, sin scroll horizontal. Coordinar con auditorías/bugs UI pendientes: no dar por arreglados los menús/overflow/cascada CSS que aparezcan en otros documentos por integrarlos aquí.

- API desde `@reflexionia/sdk` con `apiOptions()` de sesión/CSRF. Ampliar métodos SDK y tipos generados; no editar `src/generated/schema.d.ts` a mano ni usar fetch arbitrario en feature. React Query para estado servidor, Zustand para efímero, claves de cache por cuenta/thread y cleanup al logout/cambio de cuenta.
- Renderers cerrados de RunResult: card/plan/proposal/guidance/safety_notices y DTOs de memoria/rutina/cuota. Focus/notification/permission_request del producto necesitan su contrato de app, no inventar `type` soportado por Python. Texto histórico/modelo es no confiable: escapar, Markdown seguro si aplica, sin HTML/JSX/scripts/remote tracking.
- Antes/después/recuento, duración/zona/motivos/conflictos/estimaciones y «no aplicado» visibles; selección de subset y edición con nueva aprobación. `DecompositionCard` y candidatos de subtarea son borrador, no tareas creadas. Las cinco decisiones sobre vencidas no son cinco tools ejecutables: archive y otras acciones sin contrato quedan sin aplicación automática.
- Conservar «planificar hoy» de PlanDayPage y estado de FocusPage; no duplicar planes/temporizadores ni tratar fin/aborto de foco como completar tarea. Actualizar estados existentes por eventos tras efectos reales.
- Modelo: catálogo `/internal/v1/models` vía BFF; model_id solo permitido para PLAN/HELP/DECOMPOSE opt-in. Comandos básicos/guardrails sin modelo; catálogo/configuración/región/cuota desde servidor. No mostrar claves/URL/precios editables como parámetros libres ni activar proveedor por faltar fixture.
- Usage: microsUSD, ventanas día/mes solapadas (no sumar), source ledger/operator_config/unconfigured y null real; busy_or_unreconciled no permite botón de desbloqueo/retry ciego. Mostrar context_incomplete y referencias de hasta 3 runs originales sin atribuir consentimiento al resumen.
- Estados: consultando/preparando/revisión/aplicando/verificando/terminado, y sin datos/sin permiso/offline/error separados. No falsear éxito tras interrupted/cancelled/unknown.
- Cola offline actual `runOrQueue` reintenta ante error no ApiError: NO mandar aprobaciones/efectos Ticky por ese camino genérico. Offline conserva borrador; reconectar revalida propuestas/grants/versiones y consulta ledger si hubo envío incierto. Limpiar contenido privado en memoria/IndexedDB/service worker al salir de la cuenta; no persistir tokens ni aprobaciones reutilizables.
- Todas las cadenas en i18n existente (es/en), teclado/foco/labels/AA/táctil 44 px, IME y Enter/Shift+Enter, Escape por capas, reduced-motion, anuncios SSE agrupados y sin desplazar botones bajo el dedo.

**Aceptación:** Playwright sobre 320/390 px, escritorio y zoom 200 %, claro/oscuro, títulos largos/diez propuestas, error/desconexión/cambio de cuenta. Inspección visual real de la UI, además de tests automáticos. Los E2E actuales de production-review usan intercepts: ampliar también con backend real para flujo de aprobación/aplicación.

### APP-07 — Reforzar el bot existente y unificar entregas

RF-801–808/1201–1206/2003/2202/2303; TK-140–142/313/500–524.

**Archivos:** `modules/integrations/integrations.controller.ts`, TelegramBotService, TelegramApi, FocusTelegramListener, `integrations/telegram-update.ts`/`telegram-secret.ts`, `scheduler/scheduler.service.ts`, ReminderTransport y ReminderDelivery.

**Prerrequisitos observados en código, con tests negativos obligatorios:**

1. El webhook existente valida X-Telegram-Bot-Api-Secret-Token antes de handle: conservarlo. userFor usa `link?.ownerId ?? soleOwner()` y crea vínculo automáticamente si solo hay un usuario; además devuelve API_SCOPES completos. Sustituir ese fallback para Ticky por pairing desde sesión autenticada con token corto/opaco/de un solo uso. Auditar también POST telegram/link con chat_id directo. Nada de vincular un chat arbitrario al único usuario, grupos o permisos completos implícitos.
2. Persistir/deduplicar update_id ANTES de efectos/routing y confirmar rápido después de aceptación durable. La clave `telegram-${updateId}` protege algunas capturas24h, no deduplica todo update/comando/callback. Tokens callback opacos owner/acción/recurso/caducidad/uso único: hoy hay callbacks `c:<taskId>` y `s:<deliveryId>:...`. Revalidar vínculo y grants, no confiar en IDs editables.
3. Mantener comandos/captura deterministas existentes. Conversación Ticky solo opt-in y comandos conocidos no pasan por modelo; no cambiar toda captura de Telegram por un run generativo. Voz/transcripción no se activa ni llama a proveedor real desde tests normales.

**Broker único:** TelegramBotService/TelegramApi envían respuestas, ReminderTransport llama sendMessage por su cuenta y FocusTelegramListener envía al consumir el bus. Unificar transporte y ledger/dedupe por propósito/ocurrencia, con adaptadores para esos llamadores; no crear otro setWebhook ni polling paralelo (`scripts/telegram-poll.mjs` y `telegram-webhook.mjs` ya existen). El flag global Ticky no apaga recordatorios de dominio.

- Aviso a la hora de tarea15:35: Scheduler.enqueueSignals ya genera due_soon/overdue y evita un at-due explícito en un caso. Verificar y definir política exacta task-time vs reminder con clave semántica owner/ocurrencia/instante/canal/tipo, conservando un aviso 10 min antes distinto. Reprogramar/completar/borrar invalida antiguos; releer versión al despachar.
- ReminderDelivery tiene dedupeKey único y reintentos, pero no lease/generación/unknown. Añadir claim transaccional/fencing y caducidad, límite de lotes y recuperación; evaluar las tres clases task/habit/countdown y daily digest para no romperlas. Concurrencia entre workers no se resuelve con findMany→send→update. Definir carrera cancel/claim y no prometer anular un envío que ya salió.
- ReminderTransport colapsa HTTP/timeout a failed, y fire reintenta ese resultado: separar403 desconectado,429+Retry-After,5xx reintentable y timeout tras posible envío=unknown. Estado por canal para no reenviar email/push exitosos al fallar Telegram. Persistir message_id cuando existe; Telegram aceptado no significa leído. Reconciliar incertidumbre antes de otro envío; exactly-once remoto no se promete.
- Ventana tardía propuesta 15 min para aviso normal, configurable, con missed/late visibles y sin cascada tras reinicio. Distinguir late de entrega confirmada; la política actual catch-up/quietUntil no acredita ese contrato. Silencio de coaching y de recordatorios explícitos son ajustes distintos y visibles, sin excepción urgente inferida.
- focusNotifications ya existe y FocusTelegramListener atiende started/finished/aborted. Mantener opt-in, añadir dedupe por sesión/transición y respeto del canal/silencio; no completar la tarea. Modo discreto: mensaje genérico y acceso autenticado a app, sin bearer ni datos privados en URL.

**Aceptación:** tests con transporte falso en la frontera HTTP y DB/cola reales: dos workers, replay update/callback, chat ajeno/grupo, token pairing vencido/usado, unlink antes de dispatch, cambio dehora, completar antes de enviar, caída tras send antes de guardar,403/429/5xx/timeout, quiet-hours/DST y reinicio. El test actual time.e2e-spec con fetch simulado prueba la integración local del transporte, no entrega Telegram real. E2E con bot/chat sandbox requiere autorización independiente; nunca usar el bot/chat real del usuario para declarar el corte pasado.

### APP-08 — Eventos, rutinas shadow, memoria y pausa

RF-11010 y eventos sección 11.1, RF-13012/13013/2301–2303; TK-025/026/400–403/520–524/530–533/612/613.

Usar EventRecorder→OutboxPublisher→EventRouter para un consumidor interno Ticky autenticado y acotado. El bus entrega `{id,type,ownerId}`, no todo el payload: resolver entidad/revisión por lectura autorizada. No cambiar safe-fetch/SSRF para abrir una URL privada de webhook público; elegir consumidor interno como ruta principal y reconciliación periódica, sin tres consumidores duplicados.

- Authority/version changes, token/list membership revocation y pausa producen proyección durable/redeliverable; dedupe y monotonicidad. Outbox puede redeliverar y el listener debe ser idempotente. HMAC sobre bytes originales si se introduce receptor webhook, límites y comparación constante; no fabricar firma/contexto desde el chat.
- Añadir correlación action_id/proposal_id/run_id/event_id/delivery_id a los DTOs/versiones de evento y auditoría, sin filtrar secretos. Usar correlation para evitar que un cambio de Ticky se dispare a sí mismo. No hay que volver a convertir un outbox sin permiso en feed de todos los datos.
- Rutinas Python ya tienen create/list/update/pause, schedule_revision, window_minutes1–1440 default 15, jobs runtime-v3 y preparación shadow con TTL 24 h, sin modelo/transporte. Exponerlas por BFF/SDK con CAS; mostrar schedule_issue y next_at=null en ambigüedad/no existencia DST, pedir ajuste sin inventar fold. No duplicar scheduling de la misma preparación con cron de la app. El broker revalida grant/pausa antes de un futuro efecto.
- GET /internal/v1/preparations son previews, no entregas ni resúmenes ya notificados. needs_input no se presenta como recordatorio útil ficticio. Habilitar una rutina shadow no autoriza envío Telegram.
- Memoria: lista/origen/versión/editar CAS/olvidar y supresión; source_message_id real. Preferencias sensibles se proponen, no se infieren; conflictos explícitos. coaching_enabled=false no detiene recordatorios del dominio. estimate_learning_enabled apagado por defecto, false/conflicto impide adaptación.
- Pausa Ticky bloquea nuevos nudges/rutinas/efectos autónomos, conserva avisos expresamente configurados salvo pausa específica. A0/revocación bloquea lectura, pero cancelación/borrado propios siguen disponibles. Al reactivar no reenviar avisos perdidos automáticamente.
- Historial/resumen/memoria, tareas, preferencias y backups tienen ciclos de borrado distintos. Definir export/supresiones/restauración sin resucitar contenido ni grants; no prometer borrado puntual de backups por borrar un chat.

**Aceptación:** evento repetido/fuera de orden, caída Python y backlog acotado, pérdida de feed/cursor, pausa y revoke con job en cola, editar horario/ventana/DST, olvidar preferencia y restore seguro. Sin LLM/red de pago para esas comprobaciones.

### APP-09 — Contratos cruzados, operación y aceptación final

RF-1704/1705/2001/2002/2006 y sección 16; TK-801–804/900–910/1000–1021.

- Fijar SHAs de ambos repos y hashes OpenAPI/schemas. Ejecutar reader/adaptadores reales contra NestJS+PostgreSQL+Redis efímeros y el servicio Python con DB/rol propios; nunca compartir DB de negocio. El test cruzado debe detectar campos fuera de contrato, scopes/listas, cursores, errores, fechas/DST, CAS y digest. Actualizar OpenAPI/SDK a partir de fuentes, no editar generated manualmente.
- Playwright real de login→Ticky→propuesta→aprobar subset→efecto→actividad→replay sin duplicado, además de escenarios offline/reconexión/logout/cuenta distinta. Mocks HTTP ayudan a UI, no sustituyen ese gate.
- Tracing correlacionado de etapas reales BFF/aprobación/executor/verificación y puentes con Ticky; contenido/credenciales fuera por defecto. No trazar aprobación/ejecución que no ocurrió ni chain-of-thought. Fallo de auditoría bloquea nuevas mutaciones; caída de telemetría no bloquea lectura/recordatorios. Exporter/backend/región/retención requieren decisión aprobada.
- Documentar flags separados UI/lectura/modelo/ejecución/rutinas/Telegram y kill switch global/owner. Valores/nombres se fijan en configuración/OpenAPI del corte, sin activar efectos por defecto. Python requiere head0012_run_events, checkpoints schema3 y drenaje; no es parte de Prisma ni debe migrarlo el API de todo.
- Migraciones Prisma generadas con pnpm db:migrate en DB aislada, SQL revisado y rollback probado según docs/migrations.md. Versiones/grants/ledger/entregas nuevas tienen impacto en export JSON/borrado/restauración: actualizar esquema export y limpieza de fixtures.
- Inventario/capacidad/egress/backup cifrado y restore fuera de producción antes de activar. No introducir Python/PostgreSQL/Redis públicos ni rutas internas en Caddy. Sin SSH/deploy ni recursos de pago implícitos.
- Rollout propuesto después de autorización: contratos → staging sintético → lectura → propuestas → executor por owner → rutinas/envío. Rollback conserva CAS/ledger/tombstones/reservas/supresiones y drena workers; no repetir acciones pendientes ni borrar evidencia incierta.

## 5. Orden y gates de trabajo

| Corte   | Dependencia                           | Qué puede quedar utilizable antes del siguiente                              |
| ------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| Preflight | Sección 0                           | SHAs registrados, línea base conocida                                        |
| APP-01  | Estado actual revalidado              | Lectura existente más segura, sin conectar IA                                |
| APP-07a | Ninguna (independiente de Ticky)      | Pairing de Telegram desde sesión, dedupe de updates/callbacks. Es un fix de seguridad: se hace en esta primera tanda, no al final |
| APP-02a | Preflight                             | `Task.version` real y mantenida por todos los writers                        |
| APP-02  | APP-01, APP-02a                       | Capabilities y autoridad; lectura read-only verificada                       |
| APP-03  | Contrato/identidad de APP-02          | Chat/listados/SSE sin efectos, con flags                                     |
| APP-04  | APP-01/02/02a, digest coordinado      | Executor aislado probado; sigue apagado hasta revisión                       |
| APP-05  | Fuentes auditadas APP-01/02           | Plan/revisión con hechos verificados o fuente ausente                        |
| APP-06  | BFF; approvals después de APP-04      | UI de lectura/propuestas inicialmente; aplicación solo al existir executor   |
| APP-07b | APP-07a; decisión de incertidumbre Telegram | Broker único, fencing/lease, estados por canal. Ticky-envíos apagados hasta grants/E2E autorizado |
| APP-08  | Outbox/autoridad; BFF/memoria         | Shadow/previews/pausa; no notificar por inferencia. El puente de autoridad es requisito para activar lectura (ver APP-02) |
| APP-09  | Cortes aplicables                     | Evidencia cruzada y entrega para revisión; no despliegue automático          |

APP-07 se divide así: **07a** (puntos 1-3 de sus prerrequisitos: pairing, dedupe, callbacks, comandos deterministas) y **07b** (broker, lease/fencing, clasificación de errores, ventana tardía, focus). Los criterios de aceptación de APP-07 se reparten de la misma forma.

No aplazar los fixes de privacidad/pairing al final de una UI bonita. Decisiones bloqueadas se anotan con pruebas/razón y se continúa trabajo independiente; no simular una respuesta real para declarar completo un gate.

**Definición de hecho por corte:** PR en borrador y pequeño (una feature, Conventional Commits, referencias RF/TK); migraciones con rollback probado; OpenAPI/SDK regenerados; pruebas negativas del corte ejecutadas con resultado real; límites y rollback descritos; sin cambios fuera del alcance del corte ni en el trabajo local ajeno.

## 6. Plan de pruebas y comandos del repo

Puntos de partida existentes, que hay que ampliar y ejecutar según cada corte:

| Riesgo                   | Pruebas/archivos existentes                                                                                                                                                   | Regresiones nuevas mínimas                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Sesión/PAT/scopes/sync   | `apps/api/test/agent-access.e2e-spec.ts`, `security-hardening.e2e-spec.ts`, `modules/sync/sync-visibility.spec.ts`                                                            | Listas excluidas, multipágina, SSE metadata, revoke en stream/job, audiencias JWT                                       |
| CRUD/CAS/digest/ledger   | `apps/api/test/core-tasks.e2e-spec.ts`, `capture.e2e-spec.ts`, `idempotency/idempotency.service.spec.ts`, `packages/domain/src/tasks/tasks.spec.ts`                           | Preview/apply concurrente, action replay tras24h/restart, rollback real de ledger/auditoría, Unicode/null/fechas/subset |
| Plan/calendario/contexto | `packages/domain/src/planning/day-plan.spec.ts`, `review/propose.spec.ts`, `apps/api/test/calendar-google.e2e-spec.ts`, `time.e2e-spec.ts`                                    | No tocar deadline, fuente caída, periodo/denominador/scopes, DST, duración0, observación real vs foco                   |
| Telegram/entregas        | `modules/integrations/telegram-bot.service.spec.ts`, `integrations/telegram-secret.spec.ts`, `telegram-update.spec.ts`, `apps/api/test/time.e2e-spec.ts`, `v1-v2.e2e-spec.ts` | Pairing one-use, update replay, dos workers/fencing, timeout unknown por canal, retry-after/unlink/cancel               |
| PWA                      | `apps/web/e2e/phase1.spec.ts`, `production-review.spec.ts`, `calendar-google.spec.ts`, `features/offline/replay.spec.ts`, `i18n/keys.spec.ts`                                 | Chat/SSE reconexión, aprobar subset real, cleanup por cuenta, accesibilidad/visual responsive                           |

Los paths abreviados de módulos son relativos a `apps/api/src/` y los de dominio a `packages/domain/src/`. Crear tests específicos Ticky donde no existen; no rebajar asserts ni sustituir Prisma por mock para probar atomicidad. Datos sintéticos, servicios aislados, clocks inyectados para DST/leases/plazos y cero proveedores facturables/Telegram real en suites normales.

Comandos establecidos (desde la raíz todo, usando el wrapper rtk del entorno del agente):

```sh
rtk pnpm lint
rtk pnpm format:check
rtk pnpm typecheck
rtk pnpm test
rtk pnpm test:integration
rtk pnpm --filter api build
rtk pnpm --filter api openapi:generate
rtk pnpm --filter @reflexionia/sdk generate
rtk pnpm test:e2e
```

En este repo los scripts raíz delegan a `scripts/with-node.sh`; CI usa Node 26 y pnpm 9.15.0 según configuración. No elegir versiones por el Node instalado ni actualizar lock por inercia. `openapi:generate` necesita dist del API construido; SDK genera desde `apps/api/openapi.json` hacia `packages/sdk/src/generated/schema.d.ts`. Ejecutar comandos filtrados bajo el runtime del repo. El wrapper puede cargar `.env` del checkout en ciertos modos: preparar entorno aislado/sintético, no arrancar con secretos de producción ni imprimirlos. Playwright actual levanta Vite en localhost:4173 con reuseExistingServer: comprobar que el servidor es el de pruebas y añadir perfil aislado/backend real para el E2E cruzado, no reutilizar una sesión real.

La CI actual comprueba lint/formato/typecheck, unitarios, integración PostgreSQL 17/Redis 7 y diff del OpenAPI generado. Añadir el gate de tipos SDK regenerados, contratos Ticky y E2E pertinente; no asumir que están cubiertos solo porque exista openapi-check. Tests de seguridad y escaneo siguen obligatorios.

## 7. Entrega, decisiones y definición honesta de terminado

Antes de cerrar un corte, actualizar matriz APP/TK/RF con estados pendiente/implementado/verificado/bloqueado, commit/hash del contrato, comandos y resultados reales, escenarios negativos, captura visual si hay UI, migración/rollback y límites. Añadir eventos nuevos al catálogo `events/domain-events.ts` y sección 11.1 de la spec; actualizar OpenAPI/SDK en el mismo corte. Un mock no marca integración verificada.

**Decisiones pendientes de Pablo, sin valores silenciosos.** Cada una indica qué corte bloquea y la recomendación del documento (no es una decisión tomada). Mientras no se resuelva, la función afectada queda apagada y se continúa con lo independiente.

| Decisión | Bloquea | Recomendación inicial |
| -------- | ------- | --------------------- |
| Proveedor/modelos, región, presupuesto y precios (vía LiteLLM) | Cualquier run con modelo real; selector de modelo (APP-06) | Empezar solo con comandos deterministas y fixtures; sin llamadas facturables hasta que Pablo fije proveedor, región y tope mensual |
| Jornada y política de silencios (coaching vs recordatorios explícitos) | APP-05 planificación, APP-07b ventana tardía, APP-08 rutinas | Dos ajustes separados, ambos visibles; sin valor por defecto inventado |
| Retención de chat, ledger, tombstones y backups; TTL de reanudación de propuestas | APP-03 borrado, APP-04 | TTL de propuesta corto y explícito, nunca heredar las 24 h de idempotencia HTTP; tombstones del ledger con retención mayor que el TTL de la propuesta |
| Alcance de listas compartidas en la política Ticky | APP-01/02 | Solo listas propias hasta decidir; las compartidas quedan excluidas |
| Significado de `duration_minutes = 0` y fuente de duración real | APP-02 contrato, APP-05 estimaciones | Documentar la discrepancia app (0 permitido) vs Python (1-1440 o null); no convertir 0 a null sin decisión; sin observaciones de duración reales no hay aprendizaje |
| Longitud máxima de título (500 app vs 1000 Python) | APP-04 | Validar a 500 en la app y pedir edición; alinear contratos solo con cambio coordinado |
| Efectos colaterales de `complete`/`trash` (hijos/checklist) | APP-04 habilitar esas acciones | Bloquear la operación hasta que el diff las describa |
| Política de incertidumbre en Telegram (unknown/reintento) | APP-07b | No reenviar tras timeout posible sin reconciliar |
| Backend de trazas, capacidad y backup del despliegue | APP-09, activación | Trazas sin contenido; sin activar hasta tener restore probado |

**La integración local solo está terminada cuando:** contratos reales de ambos lados coinciden, permisos se aplican en servidor, no hay credencial de escritura en Python/browser, propuesta no cambia dominio sin aprobación vinculada, CAS/ledger/outbox/auditoría sobreviven carrera/replay/crash, incertidumbre no se representa como cero/éxito, UI funciona por teclado/móvil y los tests cruzados pasan. La entrega real Telegram, revisión humana de política/privacidad y operación de producción son gates separados que requieren su evidencia/autorización. No afirmar spec completa por sumar tests o por haber añadido un botón de chat.

**Nota de procedencia:** la redacción de este archivo fue análisis estático: no ejecutó cambios de código, migraciones, tests de la app ni operaciones externas. Las afirmaciones sobre el repo `todo` se contrastaron con `main` remoto (mismo HEAD citado) y las del repo privado de Ticky se contrastaron el 20-oct-2026 contra el tag `milestone/async-service` con acceso de solo lectura (sección 8); lo no verificable queda dicho allí explícitamente. El alcance de ejecución es el de la sección 0. Una frase de este documento no concede permisos.


## 8. Anexo de verificación v1.2 (20-oct-2026)

Verificación de solo lectura de este documento contra `povedica/ticky.ticktackdone` (tag `milestone/async-service`) y `povedica/tick-tack-done` (`main` = `26a02b29f7ae2ea443fc6f9428f009f3d908831d`). Sin escrituras, sin ejecución de suites, sin tocar producción.

**Confirmado en `ticky.ticktackdone`:**

- Tag `milestone/async-service` = commit `0ec7fc99f5f3172d9331bed7304da4d997db4693`, exactamente.
- PR #1 abierto en borrador, `feat/ticky-spec-v1` → `main`; la rama solo añade un commit documental (`b7230115`) sobre el tag.
- `contracts/api-manifest.json`: `contract_version: ticky-service-v1`; el SHA256 real de `contracts/ticky-service-openapi.v1.json` coincide con el declarado (`e7dfeee…c85a8d`).
- `contracts/manifest.json`: snapshot `domain-snapshot-v1` de `tick-tack-done@51dd5555…aa796`; capacidades bloqueadas declaradas: `execution`, `sync_pat`, `telegram`, `domain_cas`, `domain_ledger`.
- Todos los schemas citados existen (run_input, run_result, accepted_run, run_events, proposal, approval, authority_event, context_snapshot.proposed, read_capabilities.proposed, memoria/rutinas/historial/cuota…); 26 con `additionalProperties: false`. `read_capabilities.proposed.v1.json` fija `contract_version` = const `ticky-read-v1` y `server_resource_filtering` = const `true`, como exige APP-02.
- Adaptador de lectura `src/ticky/tools/domain.py` (`DomainTaskReader`): REST fijo contra todo, exige capabilities `ticky-read-v1` y un 404 es bloqueante (no cae a PAT amplio); valida `version >= 1` opcional, `duration_minutes` 1–1440 y título ≤ 1000 — las tres discrepancias de contrato recogidas en la sección 7 son reales.
- SSE async: retención de 32 eventos, heartbeat 5 s y conexión ≤ 65 s (`src/ticky/api/app.py`, `persistence/run_events.py`). Deadline de run de 60 s (`run_deadline_exceeded`). Rutinas con `window_minutes` 1–1440, por defecto 15. `Proposal.digest()` con la canonicalización descrita en APP-04.
- Runtime: Alembic head `0012_run_events`, checkpoints schema3 y un único owner de lectura por instancia (`docs/runbooks/operations.md`, `docs/progress.md`), como citan APP-02 y APP-09.

**Confirmado en `tick-tack-done` (main):**

- `userFor` usa `link?.ownerId ?? soleOwner()`, crea el vínculo automáticamente con un solo usuario y devuelve `API_SCOPES` completos (`telegram-bot.service.ts`). Callbacks `c:<taskId>` y `s:<deliveryId>:...` existen; la clave `telegram-${updateId}` solo cubre algunas capturas. `POST telegram/link` acepta `chat_id` directo. El webhook valida `x-telegram-bot-api-secret-token` antes de handle.
- SSE `/api/v1/events/stream`: no usa `patEventPrefixes`, emite id/type de todos los eventos del owner y usa `occurredAt` como cursor (empates posibles, página de 50).
- `review/weekly` con scope `tasks:read` lee hábitos; idempotencia HTTP caduca a 24 h; `PlanningService.assertFresh` existe; `Task` tiene `fieldClocks`/`updatedAt` y ninguna columna `version`; `durationMinutes` admite 0 (`@Min(0)`); título limitado a 500 en MCP/DTOs.

**Pendiente / no verificable con este acceso:**

- «CI verde»: el token de solo lectura no muestra ejecuciones de GitHub Actions; queda apoyado en la evidencia del propio repo (`docs/service-acceptance.md`, 239/239). El preflight debe re-ejecutar la línea base igualmente.
- Las afirmaciones dinámicas (despliegue, comportamiento en ejecución) siguen fuera de alcance: todo lo verificado es estático.
