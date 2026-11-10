-- Reverting removes the Google push channel. Subscriptions and imported events stay.
DROP INDEX IF EXISTS "calendar_subscriptions_watch_channel_id_key";
ALTER TABLE "calendar_subscriptions"
    DROP COLUMN IF EXISTS "watch_channel_id",
    DROP COLUMN IF EXISTS "watch_resource_id",
    DROP COLUMN IF EXISTS "watch_token_hash",
    DROP COLUMN IF EXISTS "watch_expires_at";
