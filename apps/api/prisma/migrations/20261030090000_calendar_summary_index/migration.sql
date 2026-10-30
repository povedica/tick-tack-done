-- Covering index for the year summary. It does not copy calendar rows.
-- Rollback: DROP INDEX "external_events_summary_idx";

CREATE INDEX "external_events_summary_idx"
  ON "external_events"("owner_id", "deleted_at", "local_start_day", "local_end_day", "subscription_id");
