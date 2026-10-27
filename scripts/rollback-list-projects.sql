-- Rollback of add_list_projects.
-- Drops the project-list columns, their index and the ProjectStatus enum.
-- Backfilled closed_at values are discarded. Take a backup first.
BEGIN;
DROP INDEX IF EXISTS "projects_owner_project_idx";
ALTER TABLE "projects"
  DROP COLUMN IF EXISTS "closed_at",
  DROP COLUMN IF EXISTS "is_project",
  DROP COLUMN IF EXISTS "project_status",
  DROP COLUMN IF EXISTS "outcome",
  DROP COLUMN IF EXISTS "project_status_changed_at",
  DROP COLUMN IF EXISTS "project_reviewed_at";
DROP TYPE IF EXISTS "ProjectStatus";
COMMIT;
