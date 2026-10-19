-- Delivery retries, cancellation, and per-user notification preferences.
ALTER TYPE "ReminderDeliveryStatus" ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE "ReminderDeliveryStatus" ADD VALUE IF NOT EXISTS 'cancelled';

ALTER TABLE "reminder_deliveries" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "reminder_deliveries" ADD COLUMN "next_retry_at" TIMESTAMPTZ(6);

CREATE INDEX "reminder_deliveries_status_next_retry_at_idx" ON "reminder_deliveries"("status", "next_retry_at");

ALTER TABLE "users" ADD COLUMN "quiet_hours_start" TEXT;
ALTER TABLE "users" ADD COLUMN "quiet_hours_end" TEXT;
ALTER TABLE "users" ADD COLUMN "telegram_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "focus_notifications" BOOLEAN NOT NULL DEFAULT true;

-- Rollback:
-- ALTER TABLE "users" DROP COLUMN "focus_notifications";
-- ALTER TABLE "users" DROP COLUMN "telegram_enabled";
-- ALTER TABLE "users" DROP COLUMN "quiet_hours_end";
-- ALTER TABLE "users" DROP COLUMN "quiet_hours_start";
-- DROP INDEX "reminder_deliveries_status_next_retry_at_idx";
-- ALTER TABLE "reminder_deliveries" DROP COLUMN "next_retry_at";
-- ALTER TABLE "reminder_deliveries" DROP COLUMN "attempts";
-- PostgreSQL cannot drop enum values in place. Restoring the old status
-- labels needs a new type, a cast, and a rename. Do that only after every
-- row has left 'failed' and 'cancelled'.
