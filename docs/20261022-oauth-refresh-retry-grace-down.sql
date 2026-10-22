-- TTD-AUD-80. Roll back code before applying; requires a database backup.
BEGIN;
ALTER TABLE "oauth_refresh_tokens" DROP COLUMN "replacement_pair", DROP COLUMN "replacement_access_id";
COMMIT;
