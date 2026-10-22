DO $$ BEGIN IF current_database() <> 'ttd_r80' THEN RAISE EXCEPTION 'Use ttd_r80'; END IF; END $$;
BEGIN;
\i docs/audit/r80/102-notification-preferences-down.sql
\i apps/api/prisma/migrations/20261022150322_notification_channel_preferences/migration.sql
DO $$ BEGIN IF to_regclass('public.notification_preferences') IS NULL THEN RAISE EXCEPTION 'Reapply failed'; END IF; END $$;
ROLLBACK;
