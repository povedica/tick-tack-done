# Despliegue (Hetzner, D4)

El servidor `46.224.6.154` ya ejecuta otra aplicación (`ia.turugby`) con su propio
Compose, su Postgres y su Caddy. Ese Caddy es el único proceso que puede escuchar
en 80 y 443. Todo es una pila distinta: directorio, proyecto Compose `todo`,
volúmenes y `/etc/todo/production.env`. No comparte base de datos ni secretos.

1. DNS: `todo.reflexionia.com` ya apunta a esa IP.
2. Secretos fuera de git, en `/etc/todo/production.env` (modo 0640, grupo del usuario
   `deploy`). `APP_SECRET` y `POSTGRES_PASSWORD` se generan en el servidor
   (`openssl rand -hex 32`). `AUTH_MODE` queda vacío. `APP_WEB_URL` y `PUBLIC_URL`
   son `https://todo.reflexionia.com`.
3. En el checkout del servidor: `sh deploy/production/deploy.sh`.
   Construye api, web, Postgres y Redis. No publica puertos en el host.
   La API y la web se unen a la red `turugby-production_public` con los alias
   `todo-api` y `todo-web`.
4. El Caddy de `/opt/turugby/production` importa `/etc/caddy/sites/*.caddy` y monta
   ese directorio. Ahí se copia `deploy/production/todo.caddy`. Caddy pide el
   certificado de `todo.reflexionia.com` y enruta `/api`, `/feeds` y `/open` a la
   API y el resto a la PWA. El `docker-compose.yml` de la raíz no se usa en este
   host: su servicio `caddy` intentaría ocupar 80 y 443. El import y el volumen
   ya están en el servidor. En git van en la PR #59 de ia.turugby
   (`hotfix/todo-caddy-site` contra `production`). Mergearla republica
   ia.turugby, así que no se mergea sola. Sin ese merge, una release posterior
   de ia.turugby borra el sitio.
5. Migraciones: corren solas al arrancar `api` (`migrate deploy` en el CMD de la imagen).
6. Cron del usuario `deploy` (`deploy/reflexionia.cron`):
   - `0 4 * * *` → `deploy/production/cron-backup.sh` (RF-1704). El dump va a
     `/opt/todo/backups`. Si el host no tiene Node, la subida a Drive corre en
     `node:22-alpine` con el refresh token de la base, sin imprimirlo.
   - `0 5 * * 0` → `deploy/production/cron-restore-verify.sh`
7. Actualizar: `git pull` en `/opt/todo/app` y `sh deploy/production/deploy.sh`.
8. Telegram, cuando la API ya responde en público: `bash scripts/with-env.sh node scripts/telegram-webhook.mjs`.
   El sondeo `scripts/telegram-poll.mjs` es solo local: borra el webhook.

Producción no usa `AUTH_MODE=dev` ni el seed. El compose deja `AUTH_MODE` vacío.
La primera cuenta se crea en `/register` mientras no haya usuarios. Después el registro
queda cerrado salvo `REGISTRATION_OPEN=true`. El backup sale de la máquina por
`BACKUP_REMOTE` (rclone) o, si ese valor está vacío, por `GOOGLE_DRIVE_FOLDER_ID`
(`scripts/backup-to-drive.mjs`, con el refresh token guardado en el usuario). Sin
ninguno de los dos, `scripts/backup.sh` avisa y el archivo se queda en la máquina.

`POST /api/v1/backups/restore` verifica el gzip y no pisa la base viva. La restauración
se aplica en el host con `scripts/restore.sh`.

Desarrollo local: `pnpm dev` levanta Postgres/Redis/Mailpit con `docker-compose.dev.yml`
y la API/web con hot reload.
