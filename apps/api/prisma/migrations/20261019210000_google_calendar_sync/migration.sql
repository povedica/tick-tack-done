-- RF-2502..2513. Partial unique index: Postgres NULLs do not collide, and the
-- legacy two-way push row (RF-2004) may share a calendar id with a read subscription.
-- Future events.watch would add channel_id / channel_expiration here; pings would
-- reuse POST /subscriptions/:id/refresh. Not implemented.

ALTER TABLE "calendar_subscriptions"
  ADD COLUMN "calendar_id" TEXT,
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "visible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sync_token" TEXT,
  ADD COLUMN "last_error" TEXT,
  ADD COLUMN "sync_failures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "retry_after" TIMESTAMPTZ(6);

ALTER TABLE "external_events"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'confirmed';

CREATE UNIQUE INDEX "calendar_subscriptions_read_calendar_id_key"
  ON "calendar_subscriptions" ("owner_id", "provider", "calendar_id")
  WHERE "deleted_at" IS NULL
    AND "calendar_id" IS NOT NULL
    AND "sync_direction" = 'read';
