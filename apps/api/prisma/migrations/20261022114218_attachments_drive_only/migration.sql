-- Generated with pnpm db:migrate --create-only; reviewed for r80.
-- Preserve drive_url through a rename instead of Prisma's generated DROP/ADD.
-- Local references must have been retired by the backed-up maintenance script.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "attachments" WHERE COALESCE("storage_key", '') <> '' OR COALESCE("thumbnail_key", '') <> '') THEN
    RAISE EXCEPTION 'TTD-AUD-99: local attachment references remain. Run migrate-attachments-to-drive with backup and approved retirement first; no columns were removed.';
  END IF;
  IF EXISTS (SELECT 1 FROM "attachments" WHERE "drive_file_id" IS NULL OR "drive_url" IS NULL) THEN
    RAISE EXCEPTION 'TTD-AUD-99: incomplete Drive metadata remains. Preserve the backup and resolve the migration before deploying.';
  END IF;
  IF EXISTS (SELECT 1 FROM "attachments" GROUP BY "task_id", "drive_file_id" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'TTD-AUD-99: duplicate Drive links remain. Resolve duplicates with a backed-up maintenance script before deploying.';
  END IF;
END $$;
ALTER TABLE "attachments" RENAME COLUMN "drive_url" TO "web_view_link";
ALTER TABLE "attachments" DROP COLUMN "storage_key", DROP COLUMN "thumbnail_key",
  ALTER COLUMN "web_view_link" SET NOT NULL,
  ALTER COLUMN "byte_size" SET DATA TYPE BIGINT,
  ALTER COLUMN "drive_file_id" SET NOT NULL;
CREATE UNIQUE INDEX "attachments_task_id_drive_file_id_key" ON "attachments"("task_id", "drive_file_id");
COMMIT;
