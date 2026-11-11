-- Local civil days for calendar reads (E-perfil).
-- Tasks keep the capture zone. Timed events use the profile zone.
-- local_end_day is inclusive. location and description leave `raw` for list responses later.
-- The public calendar still reads the previous path until activation.
--
-- Rollback:
-- DROP INDEX IF EXISTS "external_events_owner_local_start_day_idx";
-- DROP INDEX IF EXISTS "tasks_owner_local_start_day_idx";
-- ALTER TABLE "external_events" DROP COLUMN IF EXISTS "description",
--   DROP COLUMN IF EXISTS "location",
--   DROP COLUMN IF EXISTS "local_end_day",
--   DROP COLUMN IF EXISTS "local_start_day";
-- ALTER TABLE "tasks" DROP COLUMN IF EXISTS "local_end_day",
--   DROP COLUMN IF EXISTS "local_start_day";

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "local_start_day" DATE,
ADD COLUMN "local_end_day" DATE;

-- AlterTable
ALTER TABLE "external_events" ADD COLUMN "local_start_day" DATE,
ADD COLUMN "local_end_day" DATE,
ADD COLUMN "location" TEXT,
ADD COLUMN "description" TEXT;

-- CreateIndex
CREATE INDEX "tasks_owner_local_start_day_idx" ON "tasks"("owner_id", "local_start_day");

-- CreateIndex
CREATE INDEX "external_events_owner_local_start_day_idx" ON "external_events"("owner_id", "local_start_day");
