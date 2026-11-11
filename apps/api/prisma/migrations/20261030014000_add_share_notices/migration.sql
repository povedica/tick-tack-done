-- RF-1801. In-app notices for accept, decline, leave and mentions.

CREATE TABLE "share_notices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "task_id" UUID,
    "actor_name" TEXT NOT NULL,
    "list_name" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_notices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "share_notices_user_id_read_at_created_at_idx" ON "share_notices"("user_id", "read_at", "created_at");

ALTER TABLE "share_notices" ADD CONSTRAINT "share_notices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
