# Plantilla: cambio de modelo con migración

```
Cambio de modelo: <descripción> (afecta a la sección 5.<x> de la spec).

1. Actualiza apps/api/prisma/schema.prisma siguiendo los nombres de la spec.
2. Genera la migración con pnpm db:migrate y revisa el SQL.
3. Si es destructivo (drop/rename), hazlo en dos pasos expand/contract (docs/migrations.md).
4. Actualiza el seed si aplica (idempotente).
5. Decide si el export JSON sube de schema_version (RF-1705).
6. Dime cómo se revierte la migración antes de abrir el PR.
```
