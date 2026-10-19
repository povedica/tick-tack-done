-- Account appearance and the default reminder for dated tasks.
ALTER TABLE "users" ADD COLUMN "density" TEXT NOT NULL DEFAULT 'comfortable';
ALTER TABLE "users" ADD COLUMN "accent" TEXT NOT NULL DEFAULT 'indigo';
ALTER TABLE "users" ADD COLUMN "default_reminder_trigger" TEXT;

-- Null inherits the account reminder. 'off' keeps the list quiet.
ALTER TABLE "projects" ADD COLUMN "default_reminder_trigger" TEXT;

-- Rollback:
-- ALTER TABLE "projects" DROP COLUMN "default_reminder_trigger";
-- ALTER TABLE "users" DROP COLUMN "default_reminder_trigger";
-- ALTER TABLE "users" DROP COLUMN "accent";
-- ALTER TABLE "users" DROP COLUMN "density";
