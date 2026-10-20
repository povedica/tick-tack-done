# Matriz de integración Ticky (APP/TK/RF)

Actualizado con la implementación en `feat/ticky-integration`. Flags de efecto apagados
por defecto. Decisiones de la sección 7 de la spec quedan registradas; sus caminos
permanecen deshabilitados.

## Preflight

| Artefacto | Valor verificado |
| --------- | ---------------- |
| `tick-tack-done` base | `origin/main` al abrir el corte (rebaseado) |
| Spec incluida | `docs/spec/ticky-integracion-todo-spec-v1.2-verificada-335b9c3f.md` |
| Ticky tag `milestone/async-service` | `0ec7fc99…` (`git rev-parse milestone/async-service^{commit}`) |
| OpenAPI privado SHA256 | `e7dfeeefea4a700fbc98a66bb50d74cb4b5e2b30f40cf6309a01cb50d9c85a8d` |
| Schemas privados | Presentes bajo `contracts/schemas/` (26) |

## Cortes

| Corte | Estado | Notas |
| ----- | ------ | ----- |
| APP-01 | implementado | `listIds` en PAT, filtrado en list/get/review, SSE con prefijos+cursor estable |
| APP-07a | implementado | Pairing one-time, dedupe `update_id`, callbacks opacos, link por chat_id → 410 |
| APP-02a | implementado | Columna `tasks.version` + trigger; DTO/mapper aditivos |
| APP-02 | implementado (apagado) | Capabilities, authority, JWT RS256, reader PAT acotado; `TICKY_READ_ENABLED=false` |
| APP-03 | implementado (apagado) | BFF threads/messages/SSE/cancel; modelo off → guidance sin proveedor |
| APP-04 | implementado (apagado) | Digest/ledger/CAS; `TICKY_EXECUTION_ENABLED=false` |
| APP-05 | implementado (parcial) | ContextSnapshot + free/busy; workday/silencios pendientes de decisión |
| APP-06 | implementado (apagado) | Ruta `/ticky`, rail, i18n; UI flag off por defecto |
| APP-07b | implementado (parcial) | Lease/fencing, clasificación 403/429/5xx/timeout→unknown |
| APP-08 | implementado (parcial) | Bridge outbox→authority POST, memories/routines shadow |
| APP-09 | pendiente de activación | Sin deploy; contratos documentados; kill switch listo |

## Decisiones bloqueadas (sección 7)

Proveedor/modelos, jornada/silencios, retención/TTL, listas compartidas, `duration_minutes=0`,
título 500 vs 1000, side-effects complete/trash, política unknown Telegram, backend de trazas:
efectos apagados hasta confirmación explícita.
