DROP INDEX IF EXISTS "project_members_member_id_status_idx";
DROP INDEX IF EXISTS "project_members_pending_email_uq";
DROP INDEX IF EXISTS "project_members_active_member_uq";

CREATE UNIQUE INDEX "project_members_active_member_uq"
  ON "project_members" ("project_id", "member_id")
  WHERE "deleted_at" IS NULL AND "member_id" IS NOT NULL;

ALTER TABLE "project_members" DROP CONSTRAINT IF EXISTS "project_members_invited_by_id_fkey";
ALTER TABLE "project_members"
  DROP COLUMN IF EXISTS "expires_at",
  DROP COLUMN IF EXISTS "responded_at",
  DROP COLUMN IF EXISTS "invited_by_id",
  DROP COLUMN IF EXISTS "invite_email",
  DROP COLUMN IF EXISTS "status";

DROP TYPE IF EXISTS "ShareStatus";
