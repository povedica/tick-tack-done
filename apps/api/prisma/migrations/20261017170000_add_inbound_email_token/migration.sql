-- AlterTable
ALTER TABLE "users" ADD COLUMN "inbound_email_token_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_inbound_email_token_hash_key" ON "users"("inbound_email_token_hash");
