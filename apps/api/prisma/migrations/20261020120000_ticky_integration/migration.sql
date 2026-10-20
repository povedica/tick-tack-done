-- Expand migration for Ticky. Rollback is documented in docs/adr/0018-ticky-executor-transaction.md.

ALTER TABLE "tasks" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION tasks_bump_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.version IS NULL OR NEW.version < 1 THEN
      NEW.version := 1;
    END IF;
    RETURN NEW;
  END IF;
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_version_biu
BEFORE INSERT OR UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION tasks_bump_version();

ALTER TABLE "personal_access_tokens"
  ADD COLUMN "list_restricted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "list_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "reminder_deliveries"
  ADD COLUMN "lease_until" TIMESTAMPTZ(6),
  ADD COLUMN "lease_owner" TEXT,
  ADD COLUMN "fence_generation" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "channel_state" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "telegram_message_id" TEXT,
  ADD COLUMN "reconcile_required" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ticky_authorities" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "autonomy" INTEGER NOT NULL DEFAULT 0,
  "revoked" BOOLEAN NOT NULL DEFAULT false,
  "paused" BOOLEAN NOT NULL DEFAULT false,
  "inbox_list_id" UUID,
  "read_enabled" BOOLEAN NOT NULL DEFAULT false,
  "estimate_learning_enabled" BOOLEAN NOT NULL DEFAULT false,
  "coaching_silence" JSONB,
  "reminder_silence" JSONB,
  "workday_start" TEXT,
  "workday_end" TEXT,
  "source_revision" INTEGER NOT NULL DEFAULT 1,
  "action_scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ticky_authorities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticky_authorities_owner_id_key" ON "ticky_authorities"("owner_id");
ALTER TABLE "ticky_authorities" ADD CONSTRAINT "ticky_authorities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ticky_list_grants" (
  "id" UUID NOT NULL,
  "authority_id" UUID NOT NULL,
  "list_id" UUID NOT NULL,
  CONSTRAINT "ticky_list_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticky_list_grants_authority_id_list_id_key" ON "ticky_list_grants"("authority_id", "list_id");
ALTER TABLE "ticky_list_grants" ADD CONSTRAINT "ticky_list_grants_authority_id_fkey" FOREIGN KEY ("authority_id") REFERENCES "ticky_authorities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ticky_proposals" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "authority_version" INTEGER NOT NULL,
  "timezone" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "digest" TEXT NOT NULL,
  "body" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticky_proposals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticky_proposals_owner_id_created_at_idx" ON "ticky_proposals"("owner_id", "created_at");
ALTER TABLE "ticky_proposals" ADD CONSTRAINT "ticky_proposals_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ticky_action_ledger" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "action_id" UUID NOT NULL,
  "proposal_id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "digest" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "result" JSONB NOT NULL DEFAULT '{}',
  "tombstone" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticky_action_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticky_action_ledger_owner_id_action_id_key" ON "ticky_action_ledger"("owner_id", "action_id");
CREATE INDEX "ticky_action_ledger_owner_id_proposal_id_idx" ON "ticky_action_ledger"("owner_id", "proposal_id");
ALTER TABLE "ticky_action_ledger" ADD CONSTRAINT "ticky_action_ledger_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ticky_threads" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "ticky_threads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticky_threads_owner_id_created_at_idx" ON "ticky_threads"("owner_id", "created_at");
ALTER TABLE "ticky_threads" ADD CONSTRAINT "ticky_threads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ticky_client_messages" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "thread_id" UUID NOT NULL,
  "client_message_id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "run_id" UUID,
  "status_code" INTEGER NOT NULL,
  "response" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticky_client_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticky_client_messages_owner_id_client_message_id_key" ON "ticky_client_messages"("owner_id", "client_message_id");
ALTER TABLE "ticky_client_messages" ADD CONSTRAINT "ticky_client_messages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ticky_memories" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "body" TEXT NOT NULL,
  "source_message_id" TEXT,
  "forgotten_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ticky_memories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticky_memories_owner_id_idx" ON "ticky_memories"("owner_id");
ALTER TABLE "ticky_memories" ADD CONSTRAINT "ticky_memories_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ticky_routines" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "schedule_revision" INTEGER NOT NULL DEFAULT 1,
  "window_minutes" INTEGER NOT NULL DEFAULT 15,
  "paused" BOOLEAN NOT NULL DEFAULT true,
  "next_at" TIMESTAMPTZ(6),
  "schedule_issue" TEXT,
  "shadow" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ticky_routines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticky_routines_owner_id_idx" ON "ticky_routines"("owner_id");
ALTER TABLE "ticky_routines" ADD CONSTRAINT "ticky_routines_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "telegram_pairings" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "code_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_pairings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_pairings_code_hash_key" ON "telegram_pairings"("code_hash");
CREATE INDEX "telegram_pairings_owner_id_idx" ON "telegram_pairings"("owner_id");
ALTER TABLE "telegram_pairings" ADD CONSTRAINT "telegram_pairings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "telegram_update_receipts" (
  "update_id" TEXT NOT NULL,
  "owner_id" UUID,
  "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_update_receipts_pkey" PRIMARY KEY ("update_id")
);

CREATE TABLE "telegram_callbacks" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resource_id" UUID NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_callbacks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_callbacks_token_hash_key" ON "telegram_callbacks"("token_hash");
CREATE INDEX "telegram_callbacks_owner_id_idx" ON "telegram_callbacks"("owner_id");
ALTER TABLE "telegram_callbacks"
  ADD CONSTRAINT "telegram_callbacks_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ticky_bridge_deliveries" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "next_retry_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ticky_bridge_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticky_bridge_deliveries_owner_id_event_id_kind_key" ON "ticky_bridge_deliveries"("owner_id", "event_id", "kind");
