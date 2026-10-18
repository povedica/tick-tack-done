-- One active token per agent name (RF-2002). Prisma cannot express a partial unique index.
CREATE UNIQUE INDEX "personal_access_tokens_active_name_key"
ON "personal_access_tokens" ("owner_id", "name")
WHERE "revoked_at" IS NULL AND "deleted_at" IS NULL;
