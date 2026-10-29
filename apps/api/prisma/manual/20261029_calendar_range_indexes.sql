-- Partial indexes for calendar range reads.
-- Run with psql, outside Prisma migrate. CREATE INDEX CONCURRENTLY cannot
-- run inside the transaction Prisma wraps around a migration.
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/prisma/manual/20261029_calendar_range_indexes.sql
-- Roll back: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/prisma/manual/20261029_calendar_range_indexes.down.sql

CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_owner_start_live_idx
  ON tasks (owner_id, start_date)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS external_events_owner_live_starts_idx
  ON external_events (owner_id, starts_at)
  WHERE deleted_at IS NULL;
