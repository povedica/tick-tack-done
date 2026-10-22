-- AlterTable
ALTER TABLE "oauth_refresh_tokens" ADD COLUMN     "replacement_access_id" UUID,
ADD COLUMN     "replacement_pair" TEXT;
