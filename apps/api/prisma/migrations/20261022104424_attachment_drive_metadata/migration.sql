-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "drive_folder_id" TEXT,
ADD COLUMN     "icon_link" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'legacy';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "google_status" TEXT NOT NULL DEFAULT 'disconnected';

-- CreateTable
CREATE TABLE "drive_folders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID,
    "drive_folder_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drive_folders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drive_folders_user_id_idx" ON "drive_folders"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "drive_folders_user_id_project_id_key" ON "drive_folders"("user_id", "project_id");
