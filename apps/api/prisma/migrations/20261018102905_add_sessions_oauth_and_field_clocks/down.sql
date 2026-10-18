-- Rolls back add_sessions_oauth_and_field_clocks.
ALTER TABLE "oauth_authorization_codes" DROP CONSTRAINT IF EXISTS "oauth_authorization_codes_user_id_fkey";
ALTER TABLE "oauth_authorization_codes" DROP CONSTRAINT IF EXISTS "oauth_authorization_codes_client_id_fkey";
ALTER TABLE "oauth_clients" DROP CONSTRAINT IF EXISTS "oauth_clients_owner_id_fkey";
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_user_id_fkey";
DROP TABLE IF EXISTS "oauth_authorization_codes";
DROP TABLE IF EXISTS "oauth_clients";
DROP TABLE IF EXISTS "sessions";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "field_clocks";
