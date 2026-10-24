-- Schema rollback only: intentionally do not reactivate insecure legacy links.
-- Restore a pre-migration backup for full data rollback, then reconnect Telegram.
DROP INDEX IF EXISTS "telegram_links_owner_id_bot_id_idx";
ALTER TABLE "telegram_links" DROP COLUMN IF EXISTS "bot_id";
