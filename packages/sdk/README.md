# @reflexionia/sdk

Cliente TypeScript de la API, **generado del OpenAPI** (sección 18: el OpenAPI se genera
del código, no al revés). No editar `src/generated/` a mano.

Regenerar tras cambios en la API:

```bash
pnpm --filter api openapi:generate
pnpm --filter @reflexionia/sdk generate
```

La web consume la API solo a través de este paquete.
