-- AlterTable
ALTER TABLE "focus_settings" ADD COLUMN     "alarm_sound" TEXT NOT NULL DEFAULT 'bell',
ADD COLUMN     "ambient_sound" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "daily_goal" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "volume" INTEGER NOT NULL DEFAULT 70;
