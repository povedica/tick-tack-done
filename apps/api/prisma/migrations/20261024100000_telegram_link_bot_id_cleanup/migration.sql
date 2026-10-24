-- AlterTable
ALTER TABLE "telegram_links" ADD COLUMN     "bot_id" TEXT;

-- CreateIndex
CREATE INDEX "telegram_links_owner_id_bot_id_idx" ON "telegram_links"("owner_id", "bot_id");

-- Remove unusable global-bot links and publish a transactional outbox event per link.
WITH removed AS (
  UPDATE telegram_links SET deleted_at = now()
  WHERE deleted_at IS NULL
    AND owner_id NOT IN (SELECT owner_id FROM telegram_bot_configuration)
  RETURNING id, owner_id
), recorded AS (
  INSERT INTO outbox_events (id, owner_id, type, actor_kind, actor_id, data)
  SELECT gen_random_uuid(), owner_id, 'telegram.legacy_unlinked@v1', 'system', owner_id,
    jsonb_build_object('link_id', id, 'reason', 'legacy_bot_removed') FROM removed
  RETURNING owner_id, data
)
INSERT INTO activity_log (id, owner_id, actor_id, entity_type, entity_id, action, changes, updated_at)
SELECT gen_random_uuid(), owner_id, owner_id, 'telegram_link', (data->>'link_id')::uuid, 'deleted',
  data || '{"_event_type":"telegram.legacy_unlinked@v1"}'::jsonb, now() FROM recorded;

UPDATE telegram_links AS l SET bot_id = c.bot_id
FROM telegram_bot_configuration AS c
WHERE l.owner_id = c.owner_id AND l.deleted_at IS NULL;
