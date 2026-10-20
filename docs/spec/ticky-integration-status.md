# Revalidación de integración Ticky — 20-10-2026

La app en producción ejecuta `8b1ad1f`; la inspección SSH confirma flags Ticky y
TICKY_SERVICE_URL sin configurar, sin contenedores Python ni LiteLLM. La integración
incluida en main no equivale a conexión operativa. No se ha modificado producción.

Rama actual `codex/ticky-end-to-end`, base revalidada `ef89694`. Se conserva el checkout del
usuario y sus movimientos locales de documentos. Cambios del corte APP-03:

- Hilos e historial canónicos en Python; la app mantiene una proyección owner/id.
- El flag de modelo no impide consultas deterministas; selección model_id explícita.
- GET `/api/v1/ticky/models`: catálogo server-side con `{items:[{id,label}]}`;
  vacío con generación apagada. POST de mensaje admite model_id público opcional.
- GET `/api/v1/ticky/threads/:id/messages`: historial canónico privado, con los
  scopes de lectura de propuestas. La paginación privada no se expone aún completa.
- DELETE de hilo devuelve el resultado real `pending` (202) o `deleted` (200),
  borra contenido cacheado local y conserva tombstones de idempotencia.
- Replay se revalida contra Python; no sirve contenido cacheado fuera de retención.
- UI consume accepted/SSE, resultado final y títulos; reconecta el stream con cursor,
  sin repetir POST. Las propuestas todavía necesitan su UI y almacenamiento.
- Lint/tipos/pruebas anteriores de la app se han actualizado sin desactivar gates:
  pairing one-time y replay Telegram sintéticos; flags existentes; APIs vigentes.

Prueba real HTTP correcta con NestJS, FastAPI, bases PostgreSQL separadas y Redis:
PAT acotado/capabilities → tarea real sintética → admisión async → SSE → replay →
historial → borrado remoto y purga de cache local. No proveedor ni Telegram real.
Harness reproducible en `scripts/crossrepo_smoke.sh` del repo Python. No acredita
executor CAS/outbox, reinicio de checkpoints, UI completa ni producción.

Contexto firmado compatible y enviado a Python con revisiones monotónicas; calendario requiere grant calendar:read y jornada explícita. Memoria tipada con mensaje de origen verificado y listado de rutinas usan Python como fuente canónica. Prueba cruzada: origen ajeno rechazado, memoria creada/listada/olvidada, propuesta de captura por lote generada en Python y aprobación de un subconjunto en dominio sin duplicación al repetir. UI de propuestas con selección vacía inicial, aprobación parcial y reconciliación del ledger; historial recuperable tras recarga y cancelación. Pruebas reales de CAS concurrente, revocación bajo lock, listas excluidas y unicidad de tarea/ledger/auditoría/outbox. Reinicio de ambos procesos con saver PostgreSQL confirma ledger, pausa y borrado persistentes. UI ahora permite seleccionar listas propias, scopes finos, nivel A0–A2, bandeja y jornada, además de pausar/revocar; sin concesión de listas compartidas o permisos por defecto. CRUD de rutinas y activación operativa siguen pendientes.
La aceptación generativa y las decisiones operativas siguen sin acreditarse.

Despliegue autorizado por Pablo sobre infraestructura existente; nueva app privada
con dominio confirmado ia-ticky.reflexionia.com (Pablo, 20-10-2026). La definición preparada en el repo Python conserva
los efectos/modelo apagados, exige retención e imágenes por digest y un artefacto
de migraciones. Pablo registra la revisión de políticas/privacidad y ocho HIGH sin fix el 20-10-2026. Aprueba 30 días con borrado automático, OpenAI pequeño, preferencia UE si disponible y límites EUR 0,02/llamada, 0,50/día, 10/mes. Backup/restore y gates del artefacto final siguen pendientes antes del rollout.

Evidencia previa en `9dbdd84`: lint/tipos, 9 SDK,81 API,82 web,96 integración,
OpenAPI/SDK y builds API/UI correctos; CI remota verde. La revisión humana de
políticas/privacidad e imagen quedó registrada por Pablo el 20-10-2026. El corte
actual de ajustes está sujeto a gates locales/remotos nuevos. Harness crossrepo
incluye Playwright con build de producción a 390 y 1280px, SSE y títulos
sintéticos, más reinicio real y recuperación durable; no acredita despliegue ni
Telegram real.

Rollback: revertir el corte o apagar flags UI/read/model. No hay migraciones nuevas;
conservar ledger/tombstones/supresiones y drenar escritores Python compatibles.

## Matriz histórica (anterior a esta revalidación)

# Matriz de integración Ticky (APP/TK/RF)

Actualizado con la implementación en `feat/ticky-integration`. Flags de efecto apagados
por defecto. Decisiones de la sección 7 de la spec quedan registradas; sus caminos
permanecen deshabilitados.

## Preflight

| Artefacto                           | Valor verificado                                                    |
| ----------------------------------- | ------------------------------------------------------------------- |
| `tick-tack-done` base               | `origin/main` al abrir el corte (rebaseado)                         |
| Spec incluida                       | `docs/spec/ticky-integracion-todo-spec-v1.2-verificada-335b9c3f.md` |
| Ticky tag `milestone/async-service` | `0ec7fc99…` (`git rev-parse milestone/async-service^{commit}`)      |
| OpenAPI privado SHA256              | `e7dfeeefea4a700fbc98a66bb50d74cb4b5e2b30f40cf6309a01cb50d9c85a8d`  |
| Schemas privados                    | Presentes bajo `contracts/schemas/` (26)                            |

## Cortes

| Corte   | Estado                  | Notas                                                                              |
| ------- | ----------------------- | ---------------------------------------------------------------------------------- |
| APP-01  | implementado            | `listIds` en PAT, filtrado en list/get/review, SSE con prefijos+cursor estable     |
| APP-07a | implementado            | Pairing one-time, dedupe `update_id`, callbacks opacos, link por chat_id → 410     |
| APP-02a | implementado            | Columna `tasks.version` + trigger; DTO/mapper aditivos                             |
| APP-02  | implementado (apagado)  | Capabilities, authority, JWT RS256, reader PAT acotado; `TICKY_READ_ENABLED=false` |
| APP-03  | implementado (apagado)  | BFF threads/messages/SSE/cancel; modelo off → guidance sin proveedor               |
| APP-04  | implementado (apagado)  | Digest/ledger/CAS; `TICKY_EXECUTION_ENABLED=false`                                 |
| APP-05  | implementado (parcial)  | ContextSnapshot + free/busy; jornada editable en permisos Ticky                     |
| APP-06  | implementado (apagado)  | Ruta `/ticky`, rail, i18n; UI flag off por defecto                                 |
| APP-07b | implementado (parcial)  | Lease/fencing, clasificación 403/429/5xx/timeout→unknown                           |
| APP-08  | implementado (parcial)  | Bridge outbox→authority POST, memories/routines shadow                             |
| APP-09  | pendiente de activación | Sin deploy; contratos documentados; kill switch listo                              |

## Decisiones bloqueadas (sección 7)

Jornada/silencios efectivos, listas compartidas, `duration_minutes=0`,
título 500 vs 1000, side-effects complete/trash, política unknown Telegram, backend de trazas:
efectos apagados hasta confirmación explícita.

## Evidencia del corte transaccional

Gates completos correctos:236 dominio +9 SDK +81 API +79 web;86 integración con PostgreSQL, dos pruebas crossrepo omitidas deliberadamente en la suite normal y ejecutadas aparte. Harness real con saver PostgreSQL, reinicio de FastAPI y nuevo proceso NestJS: flujo, UI 390/1280px, ledger, pausa y borrado correctos. La admisión de un hilo borrado mantiene403 y el historial404 conforme al contrato existente; se comprueba también que una conversación nueva funciona tras reactivar la autoridad.

El executor bloquea la fila de autoridad y revalida grant/listas/A2 en la misma transacción del efecto; actualización de autoridad serializada con el mismo lock. Creación y movimiento comprueban grant de destino además de ownership. Rollback: apagar execution y conservar ledger/outbox; no aplicar downgrades ni repetir acciones inciertas.
