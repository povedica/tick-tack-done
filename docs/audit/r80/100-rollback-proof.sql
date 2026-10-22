-- Isolated database only; down and reapply inside a rolled back transaction.
DO $$ BEGIN IF current_database() <> 'ttd_r80' THEN RAISE EXCEPTION 'Use ttd_r80'; END IF; END $$;
BEGIN;
\i docs/audit/r80/100-task-links-down.sql
\i apps/api/prisma/migrations/20261022143435_task_links/migration.sql
DO $$ BEGIN IF to_regclass('public.task_links') IS NULL THEN RAISE EXCEPTION 'Missing table after reapply'; END IF; END $$;
ROLLBACK;
