# Contribuir

1. Copia `.env.example` a `.env`. No subas `.env`, claves ni datos reales.
2. Arranca la infraestructura con `docker compose -f docker-compose.dev.yml up -d`.
3. `pnpm install`, `pnpm db:migrate` y `pnpm dev`.
4. `pnpm test` antes de abrir la PR. Los commits siguen [Conventional Commits](https://www.conventionalcommits.org/) en inglés.
5. Una feature, una PR, desde `main`.

Los secretos de ejemplo deben fallar si `NODE_ENV=production`. Genera los reales con `openssl rand -hex 32` y déjalos fuera del repositorio.
