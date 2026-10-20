-- Per-user module switches. Missing keys stay enabled.
ALTER TABLE "users" ADD COLUMN "feature_flags" JSONB NOT NULL DEFAULT '{}';

-- Rollback:
-- ALTER TABLE "users" DROP COLUMN "feature_flags";
