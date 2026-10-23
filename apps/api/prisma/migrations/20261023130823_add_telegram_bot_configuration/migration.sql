/*
  Warnings:

  - A unique constraint covering the columns `[owner_id,chat_id]` on the table `telegram_links` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "telegram_links_chat_id_key";

-- CreateTable
CREATE TABLE "telegram_bot_configuration" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "webhook_secret" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "webhook_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "telegram_bot_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_bot_configuration_owner_id_key" ON "telegram_bot_configuration"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_bot_configuration_bot_id_key" ON "telegram_bot_configuration"("bot_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_owner_id_chat_id_key" ON "telegram_links"("owner_id", "chat_id");

-- AddForeignKey
ALTER TABLE "telegram_bot_configuration" ADD CONSTRAINT "telegram_bot_configuration_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
