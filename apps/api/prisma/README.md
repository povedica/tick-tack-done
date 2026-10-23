# Prisma

- `schema.prisma`: modelo de la sección 5 de la spec (nombres y enums tal cual).
- Migraciones: `pnpm db:migrate` (nunca `db push`, nunca editar migraciones aplicadas).
- `seed.ts`: usuario demo + inbox de sistema + datos de ejemplo; idempotente (`upsert`).
- Convenciones completas: `.cursor/rules/70-database-prisma.mdc` y [documentación histórica](https://github.com/povedica/tick-tack-done/blob/340f34be17477ecab681ddc3dbfd790c9346a0ba/docs/migrations.md).
