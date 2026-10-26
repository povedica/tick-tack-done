-- Reverting removes capture preferences; existing task values are preserved.
ALTER TABLE "users" DROP COLUMN "capture_settings";
