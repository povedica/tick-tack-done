-- Reverses 20261017124655_add_recurrence_series_and_reminder_queue.
-- Drops the reminder queue, push subscriptions, series advances and the series columns.

DROP TABLE IF EXISTS "series_advances" CASCADE;
DROP TABLE IF EXISTS "push_subscriptions" CASCADE;
DROP TABLE IF EXISTS "reminder_deliveries" CASCADE;

DROP INDEX IF EXISTS "tasks_one_active_per_series_idx";
DROP INDEX IF EXISTS "tasks_series_status_idx";

ALTER TABLE "tasks" DROP COLUMN IF EXISTS "series_id";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "recurrence_open";
ALTER TABLE "reminders" DROP COLUMN IF EXISTS "constant_interval_minutes";

DROP TYPE IF EXISTS "ReminderDeliveryKind";
DROP TYPE IF EXISTS "ReminderDeliveryStatus";
