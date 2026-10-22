DROP TABLE notification_actions;
DROP TABLE notification_receipts;
DROP TABLE notification_preferences;
ALTER TABLE users DROP COLUMN quiet_hours_days, DROP COLUMN quiet_allow_high;
UPDATE reminder_deliveries SET kind='daily_digest' WHERE kind::text IN ('focus_end','habit');
ALTER TYPE "ReminderDeliveryKind" RENAME TO "ReminderDeliveryKind_r102";
CREATE TYPE "ReminderDeliveryKind" AS ENUM ('task','daily_digest','shutdown_digest','overdue','due_soon','countdown');
ALTER TABLE reminder_deliveries ALTER COLUMN kind TYPE "ReminderDeliveryKind" USING kind::text::"ReminderDeliveryKind";
DROP TYPE "ReminderDeliveryKind_r102";
