-- Reverses 20261017113322_add_outbox_idempotency_and_task_policies.
-- Drops the outbox and idempotency tables, the complete-children policy and column collapse.

DROP TABLE IF EXISTS "idempotency_records" CASCADE;
DROP TABLE IF EXISTS "outbox_events" CASCADE;

ALTER TABLE "users" DROP COLUMN IF EXISTS "task_complete_children";
ALTER TABLE "columns" DROP COLUMN IF EXISTS "collapsed";

DROP TYPE IF EXISTS "CompleteChildrenPolicy";
