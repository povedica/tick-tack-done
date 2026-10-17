DROP INDEX IF EXISTS "users_inbound_email_token_hash_key";
ALTER TABLE "users" DROP COLUMN IF EXISTS "inbound_email_token_hash";
