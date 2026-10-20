-- RF-2604, RF-2620, RF-2630, RF-2650, RF-2680
CREATE TYPE "PlanSessionKind" AS ENUM ('plan', 'shutdown', 'replan');

ALTER TYPE "PlanDecisionKind" ADD VALUE 'someday';
ALTER TYPE "ReminderDeliveryKind" ADD VALUE 'shutdown_digest';
ALTER TYPE "SmartListKey" ADD VALUE 'someday';

ALTER TABLE "tasks"
  ADD COLUMN "is_someday" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "evening_only" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "tasks_owner_someday_idx" ON "tasks"("owner_id", "status", "deleted_at", "is_someday");

ALTER TABLE "plan_sessions"
  ADD COLUMN "kind" "PlanSessionKind" NOT NULL DEFAULT 'plan';

ALTER TABLE "plan_decisions"
  ADD COLUMN "evening" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "users"
  ADD COLUMN "shutdown_reminder_time" TEXT,
  ADD COLUMN "work_day_start" TEXT DEFAULT '09:00',
  ADD COLUMN "work_day_end" TEXT DEFAULT '18:00',
  ADD COLUMN "default_task_duration" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "deadline_soon_days" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "evening_start" TEXT NOT NULL DEFAULT '18:00';

UPDATE "users"
SET "work_day_start" = '09:00'
WHERE "work_day_start" IS NULL;

UPDATE "users"
SET "work_day_end" = '18:00'
WHERE "work_day_end" IS NULL;
