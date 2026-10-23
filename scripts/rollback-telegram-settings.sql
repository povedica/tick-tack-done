-- Rollback de 20261023130823_add_telegram_bot_configuration.
-- Hacer backup primero. Se niega a borrar configuraciones o vínculos incompatibles.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM telegram_bot_configuration) THEN
    RAISE EXCEPTION 'Export and explicitly remove bot configurations before rollback';
  END IF;
  IF EXISTS (SELECT chat_id FROM telegram_links GROUP BY chat_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Resolve cross-owner duplicate chat ids before rollback';
  END IF;
END $$;
DROP TABLE telegram_bot_configuration;
DROP INDEX telegram_links_owner_id_chat_id_key;
CREATE UNIQUE INDEX telegram_links_chat_id_key ON telegram_links(chat_id);
COMMIT;
