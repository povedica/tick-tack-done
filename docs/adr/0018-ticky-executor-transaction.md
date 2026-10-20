# ADR 0018 — Frontera transaccional del executor Ticky

## Estado

Aceptado (implementación con flags apagados).

## Contexto

Las propuestas de Ticky deben aplicar mutaciones de dominio con CAS, ledger durable y
outbox/auditoría en la misma transacción. Copiar el patrón de `PlanningService` (llamar
`TasksService` y luego persistir un registro) no garantiza atomicidad.

## Decisión

1. El BFF (`modules/ticky`) no ejecuta CRUD de negocio suelto.
2. Las mutaciones autorizadas viven en el módulo dueño (`tasks/ticky-task-command.ts`) y
   reciben el mismo `Tx` de Prisma que el insert del ledger y el `EventRecorder.record`.
3. Si falla el ledger o la auditoría, la mutación se revierte.
4. La repetición de un `action_id` devuelve el resultado guardado; otro digest se rechaza.

## Consecuencias

- Rollback operativo: apagar `TICKY_EXECUTION_ENABLED` conserva ledger y tombstones.
- Migración `20261020120000_ticky_integration` es expand/contract; el trigger de
  `tasks.version` mantiene CAS aunque un writer olvide incrementar a mano.
