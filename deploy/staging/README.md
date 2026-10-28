# Staging R80

Cubre la aceptación desplegada de RF-2001/2002, RF-2003/2004/2005 y RF-802/804/808. El backup restaurable de producción sigue siendo RF-1704 y requisito previo a su migración.

## Aislamiento

- Directorio `<APP_DIR>`, proyecto Compose `todo-staging`.
- Secretos nuevos en `<APP_DIR>` (0600), fuera del código.
- PostgreSQL `ttd_staging`, volúmenes `todo-staging_pgdata` y `todo-staging_redisdata`.
- Red privada interna y red `todo_staging_edge`; solo el proxy compartido se conecta a esta última. Sin puertos publicados.
- Cookies `__Host-` sin Domain: la cookie de staging queda limitada a su host.
- `PUBLIC_URL` y `APP_WEB_URL`: `https://staging-todo.reflexionia.com`.
- Cuenta y tareas sintéticas. Sin copia de producción, sin tokens Google personales ni bot de producción.
- SMTP y Telegram vacíos hasta configurar canales exclusivos de prueba. VAPID propio. No hay volumen de adjuntos.

## Despliegue

Ejecutar `deploy.sh` con `RUNTIME_ENV_FILE` y `GIT_COMMIT` explícitos. El script construye secuencialmente y levanta solo el proyecto de staging. No activa ni reinicia el proxy.

El Caddy compartido actual es 2.10.2 con `admin off`: no admite recarga por API ni SIGUSR1. Instalar `staging.caddy` en `<APP_DIR>` y validar la configuración completa es seguro sin activarla; la activación requiere resolver esa limitación con Pablo antes de interrumpir el proxy compartido. No usar el reinicio automático de `deploy/production/deploy.sh` para staging.

## Configuración externa pendiente

Usar un cliente OAuth web propio de staging; habilitar Calendar, Drive y Picker en su proyecto Cloud. Registrar el origen `https://staging-todo.reflexionia.com` y el callback `https://staging-todo.reflexionia.com/api/v1/integrations/google/callback`. Guardar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PICKER_API_KEY` y `GOOGLE_PICKER_APP_ID` en el archivo privado. Restringir la clave de Picker a las APIs necesarias y a los referrers documentados por Google, incluyendo el iframe `https://docs.google.com/*`.

Configurar `TELEGRAM_BOT_TOKEN` y `TELEGRAM_WEBHOOK_SECRET` de un bot exclusivo de staging y un SMTP dedicado con buzón de prueba. No reutilizar el webhook del bot de producción. El consentimiento Google, iPhone físico y recepción/acciones desde el sistema requieren intervención humana. No confundir transporte simulado con aceptación externa.

## Retirada al terminar la aceptación

1. Instalar `index.html` como `<APP_DIR>` y sustituir únicamente `staging.caddy` por `retired.caddy`.
2. Validar y activar el proxy por el procedimiento acordado. Comprobar que el dominio sirve la página estática y producción sigue sana.
3. Conservar evidencias saneadas fuera del repositorio. Ejecutar Compose con `-p todo-staging`, su archivo y su env: `down --volumes --remove-orphans`. Esto elimina exclusivamente los volúmenes sintéticos de staging.
4. Desconectar el proxy de `todo_staging_edge` y retirar esa red y los secretos de staging cuando ya no se necesiten.
5. No borrar imágenes compartidas, otros volúmenes, el volumen histórico de adjuntos ni apagar el host.

Los criterios 81/85 sobre copia de producción siguen bloqueados hasta autorización concreta de contenido, destino, protección y eliminación. No exportar ni copiar subconjuntos para evitar ese bloqueo.
