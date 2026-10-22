-- Run only against the isolated r80 database with psql -v ON_ERROR_STOP=1.
DO $$ BEGIN
  IF current_database() NOT LIKE 'ttd_r80%' THEN RAISE EXCEPTION 'Use the isolated r80 validation database'; END IF;
END $$;
CREATE TEMP TABLE attachments (
  id uuid, task_id uuid, storage_key text NOT NULL, thumbnail_key text,
  drive_file_id text, drive_url text, byte_size integer
);
INSERT INTO attachments VALUES (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002', '', NULL,
  'synthetic-drive-id', 'https://drive.google.com/file/d/synthetic-drive-id/view', 123
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='attachments'::regclass AND relnamespace=pg_my_temp_schema()) THEN
    RAISE EXCEPTION 'The fixture must shadow the real table';
  END IF;
END $$;
\i apps/api/prisma/migrations/20261022114218_attachments_drive_only/migration.sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM attachments WHERE web_view_link='https://drive.google.com/file/d/synthetic-drive-id/view' AND byte_size=123) THEN
    RAISE EXCEPTION 'Forward migration changed metadata';
  END IF;
END $$;
\i docs/20261022-attachments-drive-only-down.sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM attachments WHERE drive_url='https://drive.google.com/file/d/synthetic-drive-id/view' AND byte_size=123 AND storage_key='' AND thumbnail_key IS NULL) THEN
    RAISE EXCEPTION 'Rollback changed metadata';
  END IF;
END $$;
