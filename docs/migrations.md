# Convenciones de migraciones

1. `pnpm db:migrate` genera y aplica en desarrollo. Revisa el SQL generado antes de commitear.
2. Reversibilidad: cada PR con migración indica cómo se deshace. `prisma migrate` no genera
   `down` automático: documéntalo en la descripción del PR y pruébalo en una BD de desarrollo.
3. Cambios destructivos en dos PRs: expand → contract. Entre medios, doble escritura si hace falta.
4. Producción: `prisma migrate deploy` corre en el arranque del contenedor `api` (ver Dockerfile).
5. Datos semilla idempotentes en `apps/api/prisma/seed.ts`.
6. El export JSON (RF-1703/RF-1705) lleva `schema_version` y un script de migración por versión;
   al cambiar el modelo, decide si sube también la versión del export.

## Bots de Telegram por usuario (RF-2003)

`20261023130823_add_telegram_bot_configuration` añade configuración cifrada por
propietario y unicidad del identificador de bot. Los chats pasan a ser únicos por
`(owner_id, chat_id)`; conserva los vínculos globales existentes.

Rollback: ejecutar `scripts/rollback-telegram-settings.sql` con la API detenida.
El script aborta si un mismo chat aparece en varias cuentas, para no borrar ni
fusionar vínculos silenciosamente. Antes de retirar la tabla, exportar una copia
cifrada de la configuración y retirar manualmente los webhooks nuevos si procede.
La reversión elimina únicamente la configuración nueva; no restaura vínculos
invalidados al cambiar de bot. Los datos anteriores de chats se conservan.
