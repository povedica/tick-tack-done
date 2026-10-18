-- Rolls back add_personal_access_tokens. Drop the active-name index first if it is still there.
DROP INDEX IF EXISTS "personal_access_tokens_active_name_key";

ALTER TABLE "activity_log" DROP CONSTRAINT IF EXISTS "activity_log_token_id_fkey";
DROP INDEX IF EXISTS "activity_log_token_id_created_at_idx";
ALTER TABLE "activity_log" DROP COLUMN IF EXISTS "token_id";

DROP TABLE IF EXISTS "personal_access_tokens";

DELETE FROM "activity_log" WHERE "action" = 'accessed';
ALTER TYPE "ActivityAction" RENAME TO "ActivityAction_old";
CREATE TYPE "ActivityAction" AS ENUM ('created', 'updated', 'completed', 'deleted', 'assigned', 'commented');
ALTER TABLE "activity_log" ALTER COLUMN "action" TYPE "ActivityAction" USING "action"::text::"ActivityAction";
DROP TYPE "ActivityAction_old";
