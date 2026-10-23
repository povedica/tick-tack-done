-- RF-2003. Back up encrypted configuration and stop the API before executing.
BEGIN;
-- Abort rather than discard links which the legacy global uniqueness cannot represent.
CREATE UNIQUE INDEX telegram_links_chat_id_key ON telegram_links(chat_id);
DROP INDEX telegram_links_owner_id_chat_id_key;
DROP TABLE telegram_bot_configuration;
COMMIT;
