-- AlterEnum
ALTER TYPE "FocusSessionType" ADD VALUE 'stopwatch';

-- AlterTable
ALTER TABLE "focus_sessions" ADD COLUMN     "paused_at" TIMESTAMPTZ(6),
ADD COLUMN     "paused_seconds" INTEGER NOT NULL DEFAULT 0;
