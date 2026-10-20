-- Rolls back oauth_mcp_refresh.
ALTER TABLE "oauth_refresh_tokens" DROP CONSTRAINT IF EXISTS "oauth_refresh_tokens_access_token_id_fkey";
ALTER TABLE "oauth_refresh_tokens" DROP CONSTRAINT IF EXISTS "oauth_refresh_tokens_user_id_fkey";
ALTER TABLE "oauth_refresh_tokens" DROP CONSTRAINT IF EXISTS "oauth_refresh_tokens_client_id_fkey";
ALTER TABLE "personal_access_tokens" DROP CONSTRAINT IF EXISTS "personal_access_tokens_oauth_client_id_fkey";
DROP INDEX IF EXISTS "personal_access_tokens_oauth_client_id_idx";
DROP TABLE IF EXISTS "oauth_refresh_tokens";
ALTER TABLE "personal_access_tokens" DROP COLUMN IF EXISTS "oauth_client_id";
ALTER TABLE "personal_access_tokens" DROP COLUMN IF EXISTS "expires_at";
ALTER TABLE "oauth_authorization_codes" DROP COLUMN IF EXISTS "resource";
ALTER TABLE "oauth_clients" DROP COLUMN IF EXISTS "dynamic";
DELETE FROM "oauth_clients" WHERE "owner_id" IS NULL;
ALTER TABLE "oauth_clients" ALTER COLUMN "owner_id" SET NOT NULL;
