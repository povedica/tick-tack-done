-- AlterTable
ALTER TABLE "users" ADD COLUMN     "google_calendar_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "google_drive_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "google_granted_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[];
