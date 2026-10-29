-- RF-1801. Invitations sit on project_members. Existing rows stay accepted.

CREATE TYPE "ShareStatus" AS ENUM ('pending', 'accepted', 'declined', 'left', 'revoked');

ALTER TABLE "project_members"
  ADD COLUMN "status" "ShareStatus" NOT NULL DEFAULT 'accepted',
  ADD COLUMN "invite_email" TEXT,
  ADD COLUMN "invited_by_id" UUID,
  ADD COLUMN "responded_at" TIMESTAMPTZ(6),
  ADD COLUMN "expires_at" TIMESTAMPTZ(6);

ALTER TABLE "project_members"
  ADD CONSTRAINT "project_members_invited_by_id_fkey"
  FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "project_members_active_member_uq";

CREATE UNIQUE INDEX "project_members_active_member_uq"
  ON "project_members" ("project_id", "member_id")
  WHERE "deleted_at" IS NULL
    AND "member_id" IS NOT NULL
    AND "status" IN ('pending', 'accepted');

CREATE UNIQUE INDEX "project_members_pending_email_uq"
  ON "project_members" ("project_id", "invite_email")
  WHERE "deleted_at" IS NULL
    AND "member_id" IS NULL
    AND "status" = 'pending';

CREATE INDEX "project_members_member_id_status_idx"
  ON "project_members" ("member_id", "status");
