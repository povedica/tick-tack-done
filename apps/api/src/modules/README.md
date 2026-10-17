# Módulos de dominio

Un módulo NestJS por dominio de la sección 4. Plantilla por módulo:

```
tasks/
  tasks.module.ts
  tasks.controller.ts      # rutas de la sección 10.3, decoradores OpenAPI completos
  tasks.service.ts         # lógica de aplicación; delega reglas puras a packages/domain
  dto/                     # class-validator + @ApiProperty en cada campo
  tasks.service.spec.ts    # unitarios
  tasks.e2e-spec.ts        # integración (en test/)
```

Reglas: sin imports entre módulos; comunicación por eventos del bus (`src/events/`).
Toda mutación publica su evento en la misma transacción (outbox) y alimenta ActivityLog.
