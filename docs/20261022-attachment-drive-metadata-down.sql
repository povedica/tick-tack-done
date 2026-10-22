BEGIN;
DROP TABLE "drive_folders";
ALTER TABLE "attachments" DROP COLUMN "icon_link", DROP COLUMN "drive_folder_id", DROP COLUMN "source";
ALTER TABLE "users" DROP COLUMN "google_status";
COMMIT;
