-- AlterTable
ALTER TABLE "telegram_links" ADD COLUMN     "display_name" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'connected',
ADD COLUMN     "username" TEXT;
