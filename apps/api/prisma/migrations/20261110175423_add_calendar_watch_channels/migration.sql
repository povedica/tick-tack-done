-- RF-2566. Nullable so existing subscriptions keep polling until a channel exists.
ALTER TABLE "calendar_subscriptions"
    ADD COLUMN "watch_channel_id" TEXT,
    ADD COLUMN "watch_expires_at" TIMESTAMPTZ(6),
    ADD COLUMN "watch_resource_id" TEXT,
    ADD COLUMN "watch_token_hash" TEXT;

-- Multiple NULL channel ids stay allowed; a live channel id is unique.
CREATE UNIQUE INDEX "calendar_subscriptions_watch_channel_id_key" ON "calendar_subscriptions"("watch_channel_id");
