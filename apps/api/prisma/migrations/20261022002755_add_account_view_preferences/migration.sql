-- CreateTable
CREATE TABLE "view_preferences" (
    "owner_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "preferences" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "view_preferences_pkey" PRIMARY KEY ("owner_id","key")
);

-- AddForeignKey
ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
