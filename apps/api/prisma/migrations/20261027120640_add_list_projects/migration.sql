-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'paused');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "closed_at" TIMESTAMPTZ(6),
ADD COLUMN     "is_project" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "outcome" VARCHAR(200),
ADD COLUMN     "project_reviewed_at" TIMESTAMPTZ(6),
ADD COLUMN     "project_status" "ProjectStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "project_status_changed_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "projects_owner_project_idx" ON "projects"("owner_id", "is_project", "closed");

-- Backfill the archive timestamp for lists that were already closed.
UPDATE "projects" SET "closed_at" = "updated_at" WHERE "closed" = true AND "closed_at" IS NULL;
