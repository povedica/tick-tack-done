-- CreateIndex
CREATE INDEX "projects_owner_deleted_idx" ON "projects"("owner_id", "deleted_at");

-- CreateIndex
CREATE INDEX "tags_owner_deleted_idx" ON "tags"("owner_id", "deleted_at");

-- CreateIndex
CREATE INDEX "tasks_owner_status_deleted_due_idx" ON "tasks"("owner_id", "status", "deleted_at", "due_date");

-- CreateIndex
CREATE INDEX "tasks_owner_deleted_created_idx" ON "tasks"("owner_id", "deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "tasks_owner_parent_deleted_idx" ON "tasks"("owner_id", "parent_id", "deleted_at");
