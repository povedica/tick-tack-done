-- Cheap per-owner counter for calendar ETags (F6, B0).
-- Incremented in the same transaction as a calendar change. It does not copy rows.
--
-- Rollback:
-- DROP TABLE IF EXISTS "calendar_versions";

CREATE TABLE "calendar_versions" (
    "owner_id" UUID NOT NULL,
    "version" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "calendar_versions_pkey" PRIMARY KEY ("owner_id")
);

ALTER TABLE "calendar_versions"
ADD CONSTRAINT "calendar_versions_owner_id_fkey"
FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
