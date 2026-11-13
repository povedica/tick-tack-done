-- Inverse of 20261029_calendar_range_indexes.sql.
-- DROP INDEX CONCURRENTLY also cannot run inside a Prisma migration transaction.

DROP INDEX CONCURRENTLY IF EXISTS tasks_owner_start_live_idx;
DROP INDEX CONCURRENTLY IF EXISTS external_events_owner_live_starts_idx;
