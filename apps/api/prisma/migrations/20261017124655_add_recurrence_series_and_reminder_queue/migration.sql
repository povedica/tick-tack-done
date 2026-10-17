-- CreateEnum
CREATE TYPE "ReminderDeliveryStatus" AS ENUM ('scheduled', 'fired', 'late');

-- CreateEnum
CREATE TYPE "ReminderDeliveryKind" AS ENUM ('task', 'daily_digest', 'overdue', 'due_soon');

-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "constant_interval_minutes" INTEGER;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "recurrence_open" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "series_id" UUID;

-- CreateTable
CREATE TABLE "reminder_deliveries" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "reminder_id" UUID,
    "task_id" UUID,
    "dedupe_key" TEXT NOT NULL,
    "fire_at" TIMESTAMPTZ(6) NOT NULL,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'push',
    "status" "ReminderDeliveryStatus" NOT NULL DEFAULT 'scheduled',
    "kind" "ReminderDeliveryKind" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "fired_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reminder_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "series_advances" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "series_id" UUID NOT NULL,
    "source_task_id" UUID NOT NULL,
    "repeat_rule" TEXT NOT NULL,
    "repeat_from" "RepeatFrom" NOT NULL,
    "time_zone" TEXT NOT NULL,
    "is_all_day" BOOLEAN NOT NULL,
    "due_date" TIMESTAMPTZ(6),
    "start_date" TIMESTAMPTZ(6),
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "series_advances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reminder_deliveries_dedupe_key_key" ON "reminder_deliveries"("dedupe_key");

-- CreateIndex
CREATE INDEX "reminder_deliveries_status_fire_at_idx" ON "reminder_deliveries"("status", "fire_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_owner_id_endpoint_key" ON "push_subscriptions"("owner_id", "endpoint");

-- CreateIndex
CREATE INDEX "series_advances_processed_at_idx" ON "series_advances"("processed_at");

-- CreateIndex
CREATE INDEX "tasks_series_status_idx" ON "tasks"("series_id", "status");

-- One active occurrence per series. Prisma 6 cannot model the predicate.
CREATE UNIQUE INDEX "tasks_one_active_per_series_idx" ON "tasks"("series_id") WHERE "status" = 'active' AND "deleted_at" IS NULL AND "series_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_advances" ADD CONSTRAINT "series_advances_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_advances" ADD CONSTRAINT "series_advances_source_task_id_fkey" FOREIGN KEY ("source_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
