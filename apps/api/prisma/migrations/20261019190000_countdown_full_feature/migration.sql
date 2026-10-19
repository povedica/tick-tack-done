CREATE TYPE "CountdownType" AS ENUM ('countdown', 'anniversary', 'birthday', 'holiday');
CREATE TYPE "CountdownDayMode" AS ENUM ('standard', 'plus_one');
CREATE TYPE "CountdownRepeat" AS ENUM ('none', 'daily', 'weekly', 'monthly', 'yearly');

ALTER TABLE "countdowns"
  ADD COLUMN "type" "CountdownType" NOT NULL DEFAULT 'countdown',
  ADD COLUMN "emoji" TEXT,
  ADD COLUMN "repeat_rule" "CountdownRepeat" NOT NULL DEFAULT 'none',
  ADD COLUMN "day_mode" "CountdownDayMode" NOT NULL DEFAULT 'standard',
  ADD COLUMN "style" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "show_in_smart_list" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "archived_at" TIMESTAMPTZ(6);

CREATE INDEX "countdowns_target_date_idx" ON "countdowns"("target_date");

CREATE TABLE "countdown_reminders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "countdown_id" UUID NOT NULL,
  "offset_days" INTEGER NOT NULL,
  "constant" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "countdown_reminders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "countdown_reminders_countdown_id_offset_days_constant_key"
    UNIQUE ("countdown_id", "offset_days", "constant"),
  CONSTRAINT "countdown_reminders_countdown_id_fkey"
    FOREIGN KEY ("countdown_id") REFERENCES "countdowns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "countdown_reminders_offset_days_check" CHECK ("offset_days" BETWEEN 0 AND 365)
);
