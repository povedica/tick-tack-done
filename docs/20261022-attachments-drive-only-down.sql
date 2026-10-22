-- Schema rollback only: binaries are never recreated on the server.
-- The forward guard required empty local keys, so restoring empty values loses no keys.
BEGIN;
DROP INDEX "attachments_task_id_drive_file_id_key";
ALTER TABLE "attachments" RENAME COLUMN "web_view_link" TO "drive_url";
ALTER TABLE "attachments" ALTER COLUMN "drive_url" DROP NOT NULL,
  ALTER COLUMN "drive_file_id" DROP NOT NULL,
  ALTER COLUMN "byte_size" SET DATA TYPE INTEGER USING "byte_size"::integer,
  ADD COLUMN "storage_key" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "thumbnail_key" TEXT;
ALTER TABLE "attachments" ALTER COLUMN "storage_key" DROP DEFAULT;
COMMIT;
