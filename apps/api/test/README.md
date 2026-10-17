# Tests de integración de la API

Supertest contra la app NestJS real con Postgres y Redis (compose de CI o `docker-compose.dev.yml`).
Migrar antes de correr: `pnpm db:deploy`. No mockear Prisma aquí.
Nombrar los tests con el RF-xx que cubren.
