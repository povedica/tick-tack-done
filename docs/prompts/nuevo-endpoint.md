# Plantilla: nuevo endpoint / recurso de API

```
Añade a la API el recurso <recurso> según la sección 10.3 de la spec:

- Rutas: <pegar las rutas exactas de la spec>
- Scopes (10.1): <scopes>
- DTOs con class-validator y @ApiProperty; errores con códigos estables {error:{code,message,details}}.
- Paginación por cursor; Idempotency-Key en POST de creación.
- Publica los eventos de dominio <lista> en la misma transacción (outbox) y alimenta ActivityLog.
- Regenera el OpenAPI y el SDK (pnpm --filter api openapi:generate && pnpm --filter @reflexionia/sdk generate).
- Tests de integración con Supertest citando los RF.
```
