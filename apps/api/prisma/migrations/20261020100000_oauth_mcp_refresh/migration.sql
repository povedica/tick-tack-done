-- OAuth access expiry, dynamic clients, and rotating refresh tokens.

ALTER TABLE "oauth_clients" ALTER COLUMN "owner_id" DROP NOT NULL;
ALTER TABLE "oauth_clients" ADD COLUMN "dynamic" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "oauth_authorization_codes" ADD COLUMN "resource" TEXT;

ALTER TABLE "personal_access_tokens" ADD COLUMN "expires_at" TIMESTAMPTZ(6);
ALTER TABLE "personal_access_tokens" ADD COLUMN "oauth_client_id" UUID;

CREATE TABLE "oauth_refresh_tokens" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "access_token_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "rotated_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_refresh_tokens_token_hash_key" ON "oauth_refresh_tokens"("token_hash");
CREATE INDEX "oauth_refresh_tokens_family_id_idx" ON "oauth_refresh_tokens"("family_id");
CREATE INDEX "oauth_refresh_tokens_user_id_idx" ON "oauth_refresh_tokens"("user_id");
CREATE INDEX "oauth_refresh_tokens_access_token_id_idx" ON "oauth_refresh_tokens"("access_token_id");
CREATE INDEX "personal_access_tokens_oauth_client_id_idx" ON "personal_access_tokens"("oauth_client_id");

ALTER TABLE "personal_access_tokens" ADD CONSTRAINT "personal_access_tokens_oauth_client_id_fkey" FOREIGN KEY ("oauth_client_id") REFERENCES "oauth_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_access_token_id_fkey" FOREIGN KEY ("access_token_id") REFERENCES "personal_access_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
