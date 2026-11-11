-- COMP-29. Adds public_list_links. Does not change existing rows.

CREATE TABLE "public_list_links" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_hint" TEXT NOT NULL,
    "include_notes" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "last_viewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "public_list_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_list_links_token_hash_key" ON "public_list_links"("token_hash");
CREATE INDEX "public_list_links_project_id_idx" ON "public_list_links"("project_id");
CREATE INDEX "public_list_links_owner_id_idx" ON "public_list_links"("owner_id");
CREATE UNIQUE INDEX "public_list_links_active_uq" ON "public_list_links" ("project_id") WHERE "revoked_at" IS NULL;

ALTER TABLE "public_list_links" ADD CONSTRAINT "public_list_links_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public_list_links" ADD CONSTRAINT "public_list_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public_list_links" ADD CONSTRAINT "public_list_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
