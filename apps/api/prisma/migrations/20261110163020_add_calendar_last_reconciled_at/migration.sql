-- RF-2560. Nullable so existing subscriptions reconcile on the next sync.
ALTER TABLE "calendar_subscriptions" ADD COLUMN "last_reconciled_at" TIMESTAMPTZ(6);
