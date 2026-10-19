-- Day plans, planning sessions, and a real cancelled task status.
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'cancelled';

CREATE TYPE "PlanSessionState" AS ENUM ('draft', 'applying', 'applied', 'discarded');
CREATE TYPE "PlanDecisionKind" AS ENUM ('done', 'plan_day', 'later', 'cancel', 'trash', 'skip');

CREATE TABLE "day_plans" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "local_date" VARCHAR(10) NOT NULL,
  "time_zone" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "day_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plan_members" (
  "id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "rank" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plan_sessions" (
  "id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "state" "PlanSessionState" NOT NULL DEFAULT 'draft',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "sources" JSONB NOT NULL,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "plan_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plan_decisions" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "decision" "PlanDecisionKind" NOT NULL,
  "target_date" VARCHAR(10),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "plan_decisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plan_operations" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "result" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "plan_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "day_plans_owner_id_local_date_time_zone_key" ON "day_plans"("owner_id", "local_date", "time_zone");
CREATE UNIQUE INDEX "plan_members_plan_id_task_id_key" ON "plan_members"("plan_id", "task_id");
CREATE INDEX "plan_members_task_id_idx" ON "plan_members"("task_id");
CREATE INDEX "plan_sessions_owner_id_state_idx" ON "plan_sessions"("owner_id", "state");
CREATE UNIQUE INDEX "plan_decisions_session_id_task_id_key" ON "plan_decisions"("session_id", "task_id");
CREATE UNIQUE INDEX "plan_operations_owner_id_idempotency_key_key" ON "plan_operations"("owner_id", "idempotency_key");

ALTER TABLE "day_plans" ADD CONSTRAINT "day_plans_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_members" ADD CONSTRAINT "plan_members_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "day_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_members" ADD CONSTRAINT "plan_members_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_sessions" ADD CONSTRAINT "plan_sessions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "day_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_sessions" ADD CONSTRAINT "plan_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_decisions" ADD CONSTRAINT "plan_decisions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "plan_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_operations" ADD CONSTRAINT "plan_operations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_operations" ADD CONSTRAINT "plan_operations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "plan_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rollback:
-- ALTER TABLE "plan_operations" DROP CONSTRAINT "plan_operations_session_id_fkey";
-- ALTER TABLE "plan_operations" DROP CONSTRAINT "plan_operations_owner_id_fkey";
-- ALTER TABLE "plan_decisions" DROP CONSTRAINT "plan_decisions_session_id_fkey";
-- ALTER TABLE "plan_sessions" DROP CONSTRAINT "plan_sessions_owner_id_fkey";
-- ALTER TABLE "plan_sessions" DROP CONSTRAINT "plan_sessions_plan_id_fkey";
-- ALTER TABLE "plan_members" DROP CONSTRAINT "plan_members_task_id_fkey";
-- ALTER TABLE "plan_members" DROP CONSTRAINT "plan_members_plan_id_fkey";
-- ALTER TABLE "day_plans" DROP CONSTRAINT "day_plans_owner_id_fkey";
-- DROP TABLE "plan_operations";
-- DROP TABLE "plan_decisions";
-- DROP TABLE "plan_sessions";
-- DROP TABLE "plan_members";
-- DROP TABLE "day_plans";
-- DROP TYPE "PlanDecisionKind";
-- DROP TYPE "PlanSessionState";
-- PostgreSQL cannot drop the 'cancelled' TaskStatus value in place.
