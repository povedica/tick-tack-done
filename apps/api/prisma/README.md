# Prisma

- `schema.prisma`: modelo de la sección 5 de la spec (nombres y enums tal cual).
- Migraciones: `pnpm db:migrate` (nunca `db push`, nunca editar migraciones aplicadas).
- `seed.ts`: usuario demo + inbox de sistema + datos de ejemplo; idempotente (`upsert`).
- Convenciones completas: `.cursor/rules/70-database-prisma.mdc`.
