-- AlterTable
ALTER TABLE "filters" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "filters_owner_id_pinned_sort_order_idx" ON "filters"("owner_id", "pinned" DESC, "sort_order");
