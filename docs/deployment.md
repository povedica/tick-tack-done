# Despliegue

Requisitos: un VPS con Docker y Docker Compose, un dominio y un proxy Caddy (u otro) que termine TLS.

1. `cp .env.example .env` y genera secretos con `openssl rand -hex 32`. No dejes `APP_SECRET` de ejemplo ni `AUTH_MODE=dev` si `NODE_ENV=production`.
2. Define `PUBLIC_URL`, `SMTP_FROM`, `VAPID_SUBJECT`, `DATA_ENCRYPTION_KEY`, `REDIS_PASSWORD` y `AGE_RECIPIENT` (clave pública de `age`).
3. `docker compose up -d` para un laboratorio, o `deploy/production/docker-compose.yml` detrás del proxy.
4. El proxy debe reenviar `X-Forwarded-For` (Caddy lo hace) y unirse a la red `EDGE_NETWORK` (por defecto `todo_edge`).
5. Crea el primer usuario y deja `REGISTRATION_OPEN=false`.
6. Los backups se cifran con `age` antes de salir de la máquina. Programa `deploy/production/cron-backup.sh` con `APP_DIR`, `BACKUP_DIR` y `RUNTIME_ENV_FILE` en el entorno, nunca dentro del repositorio.
7. Actualiza con el script `deploy/production/deploy.sh`.

En el servidor, comprueba que solo escuchan 22, 80 y 443 hacia fuera, que SSH no acepta contraseñas ni root, y que Postgres, Redis y el socket de Docker no están publicados.
