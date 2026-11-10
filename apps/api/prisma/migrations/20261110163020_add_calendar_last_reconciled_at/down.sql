-- Reverting removes the reconciliation clock. Synced events stay in place.
ALTER TABLE "calendar_subscriptions" DROP COLUMN "last_reconciled_at";
