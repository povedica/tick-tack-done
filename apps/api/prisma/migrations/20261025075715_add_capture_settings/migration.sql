-- AlterTable
ALTER TABLE "users" ADD COLUMN     "capture_settings" JSONB NOT NULL DEFAULT '{}';
