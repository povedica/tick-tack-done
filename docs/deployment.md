# Despliegue (Hetzner, D4)

1. DNS: `todo.reflexionia.com` → IP del servidor.
2. En el servidor: `git clone … && cd reflexionia-tasks && cp .env.example .env` y rellenar
   (`APP_SECRET` con `openssl rand -hex 32`, `BACKUP_REMOTE` obligatorio).
3. `docker compose up -d --build`. Caddy obtiene y renueva el TLS solo.
4. Migraciones: corren solas al arrancar `api` (`migrate deploy` en el CMD de la imagen).
5. Cron del host:
   - `0 4 * * *` backup diario → `scripts/backup.sh` (copia fuera de la máquina, RF-1704)
   - `0 5 * * 0` prueba de restauración → `scripts/restore-verify.sh`
6. Actualizar: `git pull && docker compose up -d --build`.

Desarrollo local: `pnpm dev` levanta Postgres/Redis/Mailpit con `docker-compose.dev.yml`
y la API/web con hot reload.
