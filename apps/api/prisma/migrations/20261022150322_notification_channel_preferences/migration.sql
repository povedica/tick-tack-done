-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReminderDeliveryKind" ADD VALUE 'focus_end';
ALTER TYPE "ReminderDeliveryKind" ADD VALUE 'habit';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "quiet_allow_high" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quiet_hours_days" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[];

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "kind" "ReminderDeliveryKind" NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id","kind","channel")
);

-- CreateTable
CREATE TABLE "notification_receipts" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "delivery_id" UUID,
    "kind" "ReminderDeliveryKind" NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_actions" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_receipts_owner_id_created_at_id_idx" ON "notification_receipts"("owner_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_actions_token_hash_key" ON "notification_actions"("token_hash");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_receipts" ADD CONSTRAINT "notification_receipts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_receipts" ADD CONSTRAINT "notification_receipts_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "reminder_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_actions" ADD CONSTRAINT "notification_actions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_actions" ADD CONSTRAINT "notification_actions_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "reminder_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
