DO $$ BEGIN IF current_database() <> 'ttd_r80' THEN RAISE EXCEPTION 'Use ttd_r80'; END IF; END $$;
BEGIN;
\i docs/audit/r80/97-drive-separation-down.sql
\i apps/api/prisma/migrations/20261022161823_google_granular_service_permissions/migration.sql
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='google_granted_scopes') THEN RAISE EXCEPTION 'Reapply failed'; END IF; END $$;
ROLLBACK;
