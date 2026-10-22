BEGIN;
UPDATE "tasks" SET source = 'api' WHERE source = 'mcp';
ALTER TYPE "TaskSource" RENAME TO "TaskSource_old";
CREATE TYPE "TaskSource" AS ENUM ('manual', 'import', 'api', 'automation', 'plugin');
ALTER TABLE "tasks" ALTER COLUMN source DROP DEFAULT;
ALTER TABLE "tasks" ALTER COLUMN source TYPE "TaskSource" USING source::text::"TaskSource";
ALTER TABLE "tasks" ALTER COLUMN source SET DEFAULT 'manual';
DROP TYPE "TaskSource_old";
COMMIT;
