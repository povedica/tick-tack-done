DO $$ BEGIN IF current_database() <> 'ttd_r80' THEN RAISE EXCEPTION 'Use ttd_r80'; END IF; END $$;
BEGIN;
\i docs/audit/r80/103-telegram-status-down.sql
\i apps/api/prisma/migrations/20261022152829_telegram_link_status_profile/migration.sql
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='telegram_links' AND column_name='status') THEN RAISE EXCEPTION 'Reapply failed'; END IF; END $$;
ROLLBACK;
