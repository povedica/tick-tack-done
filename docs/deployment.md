# Despliegue (Hetzner, D4)

1. DNS: `todo.reflexionia.com` → IP del servidor.
2. En el servidor: `git clone … && cd reflexionia-tasks && cp .env.example .env` y rellenar
   (`APP_SECRET` con `openssl rand -hex 32`, `BACKUP_REMOTE` obligatorio).
3. `docker compose up -d --build`. Caddy obtiene y renueva el TLS solo.
4. Migraciones: corren solas al arrancar `api` (`migrate deploy` en el CMD de la imagen).
5. Cron del host (ejemplo en `deploy/reflexionia.cron`):
   - `0 4 * * *` backup diario → `scripts/backup.sh` (copia fuera de la máquina, RF-1704)
   - `0 5 * * 0` prueba de restauración → `scripts/restore-verify.sh`
6. Actualizar: `git pull && docker compose up -d --build`.

Producción no usa `AUTH_MODE=dev` ni el seed. El compose deja `AUTH_MODE` vacío.
La primera cuenta se crea en `/register` mientras no haya usuarios. Después el registro
queda cerrado salvo `REGISTRATION_OPEN=true`. `BACKUP_REMOTE` es obligatorio: sin destino
rclone, `scripts/backup.sh` avisa y el archivo se queda en la máquina.

`POST /api/v1/backups/restore` verifica el gzip y no pisa la base viva. La restauración
se aplica en el host con `scripts/restore.sh`.

Desarrollo local: `pnpm dev` levanta Postgres/Redis/Mailpit con `docker-compose.dev.yml`
y la API/web con hot reload.
