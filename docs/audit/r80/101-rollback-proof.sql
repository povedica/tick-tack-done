DO $$ BEGIN IF current_database() <> 'ttd_r80' THEN RAISE EXCEPTION 'Use ttd_r80'; END IF; END $$;
BEGIN;
\i docs/audit/r80/101-focus-settings-down.sql
\i apps/api/prisma/migrations/20261022144811_focus_sound_goal_preferences/migration.sql
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='focus_settings' AND column_name='daily_goal') THEN RAISE EXCEPTION 'Reapply failed'; END IF; END $$;
ROLLBACK;
