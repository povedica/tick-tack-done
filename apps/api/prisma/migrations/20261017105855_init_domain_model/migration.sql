-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('task', 'note');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('active', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('none', 'low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "RepeatFrom" AS ENUM ('due_date', 'completion_date');

-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('manual', 'import', 'api', 'automation', 'plugin');

-- CreateEnum
CREATE TYPE "ChecklistStatus" AS ENUM ('active', 'completed');

-- CreateEnum
CREATE TYPE "ProjectViewMode" AS ENUM ('list', 'kanban', 'timeline');

-- CreateEnum
CREATE TYPE "ProjectKind" AS ENUM ('TASK', 'NOTE');

-- CreateEnum
CREATE TYPE "FilterMode" AS ENUM ('normal', 'advanced');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('relative', 'absolute', 'location', 'daily_digest');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('push', 'email', 'both');

-- CreateEnum
CREATE TYPE "FocusSessionType" AS ENUM ('focus', 'short_break', 'long_break');

-- CreateEnum
CREATE TYPE "CalendarSyncDirection" AS ENUM ('read', 'two_way');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('created', 'updated', 'completed', 'deleted', 'assigned', 'commented');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('light', 'dark', 'auto');

-- CreateEnum
CREATE TYPE "WeekStart" AS ENUM ('monday', 'sunday');

-- CreateEnum
CREATE TYPE "SmartListKey" AS ENUM ('today', 'tomorrow', 'next_7_days', 'all', 'inbox', 'assigned_to_me', 'completed', 'trash', 'no_date', 'recently_added');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "display_name" TEXT NOT NULL,
    "avatar" TEXT,
    "time_zone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "locale" TEXT NOT NULL DEFAULT 'es',
    "week_start" "WeekStart" NOT NULL DEFAULT 'monday',
    "date_format" TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
    "theme" "Theme" NOT NULL DEFAULT 'auto',
    "nlp_language" TEXT NOT NULL DEFAULT 'es',
    "daily_reminder_time" TEXT,
    "weekly_report_settings" JSONB NOT NULL DEFAULT '{}',
    "achievement_score" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "focus_settings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "pomodoro_minutes" INTEGER NOT NULL DEFAULT 25,
    "short_break_minutes" INTEGER NOT NULL DEFAULT 5,
    "long_break_minutes" INTEGER NOT NULL DEFAULT 15,
    "cycles_before_long_break" INTEGER NOT NULL DEFAULT 4,
    "auto_start_breaks" BOOLEAN NOT NULL DEFAULT false,
    "auto_start_focus" BOOLEAN NOT NULL DEFAULT false,
    "ambient_sounds" JSONB NOT NULL DEFAULT '[]',
    "strict_mode" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "focus_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" BIGINT NOT NULL DEFAULT 65536,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "folder_id" UUID,
    "view_mode" "ProjectViewMode" NOT NULL DEFAULT 'list',
    "kind" "ProjectKind" NOT NULL DEFAULT 'TASK',
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "is_inbox" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" BIGINT NOT NULL DEFAULT 65536,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "columns" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" BIGINT NOT NULL DEFAULT 65536,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "color" TEXT,
    "parent_id" UUID,
    "sort_order" BIGINT NOT NULL DEFAULT 65536,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "parent_id" UUID,
    "column_id" UUID,
    "title" VARCHAR(500) NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "kind" "TaskKind" NOT NULL DEFAULT 'task',
    "status" "TaskStatus" NOT NULL DEFAULT 'active',
    "priority" "Priority" NOT NULL DEFAULT 'none',
    "is_all_day" BOOLEAN NOT NULL DEFAULT false,
    "start_date" TIMESTAMPTZ(6),
    "due_date" TIMESTAMPTZ(6),
    "time_zone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "duration_minutes" INTEGER,
    "repeat_rule" TEXT,
    "repeat_from" "RepeatFrom" NOT NULL DEFAULT 'due_date',
    "sort_order" BIGINT NOT NULL DEFAULT 65536,
    "assignee_id" UUID,
    "created_by" UUID NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "source" "TaskSource" NOT NULL DEFAULT 'manual',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "search_vector" tsvector GENERATED ALWAYS AS (
        to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("content", ''))
    ) STORED,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_tags" (
    "task_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "task_tags_pkey" PRIMARY KEY ("task_id","tag_id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ChecklistStatus" NOT NULL DEFAULT 'active',
    "sort_order" BIGINT NOT NULL DEFAULT 65536,
    "start_date" TIMESTAMPTZ(6),
    "due_date" TIMESTAMPTZ(6),
    "is_all_day" BOOLEAN NOT NULL DEFAULT false,
    "time_zone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_lists" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "key" "SmartListKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" BIGINT NOT NULL DEFAULT 65536,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "smart_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filters" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "mode" "FilterMode" NOT NULL DEFAULT 'normal',
    "rules" JSONB NOT NULL,
    "sort_order" BIGINT NOT NULL DEFAULT 65536,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "trigger" TEXT NOT NULL,
    "absolute_at" TIMESTAMPTZ(6),
    "type" "ReminderType" NOT NULL,
    "location" JSONB,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'push',
    "constant" BOOLEAN NOT NULL DEFAULT false,
    "snoozed_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habits" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "goal" JSONB NOT NULL,
    "frequency" JSONB NOT NULL,
    "reminder_time" TEXT,
    "motivation_note" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" BIGINT NOT NULL DEFAULT 65536,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "habits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habit_logs" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "habit_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "habit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "focus_sessions" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "task_id" UUID,
    "type" "FocusSessionType" NOT NULL,
    "planned_minutes" INTEGER NOT NULL,
    "actual_seconds" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "ambient_sound" TEXT,
    "interrupted_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "focus_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sticky_notes" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "color" TEXT,
    "pinned_task_id" UUID,
    "position" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sticky_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_subscriptions" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "url" TEXT,
    "provider" TEXT,
    "sync_direction" "CalendarSyncDirection" NOT NULL DEFAULT 'read',
    "color" TEXT,
    "last_synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "calendar_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_events" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "external_uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "is_all_day" BOOLEAN NOT NULL DEFAULT false,
    "time_zone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "raw" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "external_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countdowns" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "target_date" DATE NOT NULL,
    "color" TEXT,
    "show_in_sidebar" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "countdowns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_layouts" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "widgets" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "dashboard_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_reports" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "payload" JSONB NOT NULL,
    "tone" TEXT NOT NULL,
    "delivered_channels" JSONB NOT NULL DEFAULT '[]',
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "weekly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "focus_settings_user_id_key" ON "focus_settings"("user_id");

-- CreateIndex
CREATE INDEX "folders_owner_id_sort_order_idx" ON "folders"("owner_id", "sort_order");

-- CreateIndex
CREATE INDEX "projects_owner_id_sort_order_idx" ON "projects"("owner_id", "sort_order");

-- CreateIndex
CREATE INDEX "columns_project_id_sort_order_idx" ON "columns"("project_id", "sort_order");

-- CreateIndex
CREATE INDEX "tags_owner_id_sort_order_idx" ON "tags"("owner_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "tags_owner_id_name_key" ON "tags"("owner_id", "name");

-- CreateIndex
CREATE INDEX "tasks_project_status_sort_idx" ON "tasks"("project_id", "status", "sort_order");

-- CreateIndex
CREATE INDEX "tasks_due_date_idx" ON "tasks"("due_date");

-- Section 5.1: partial index for active tasks. Prisma 6 cannot model the predicate.
CREATE INDEX "tasks_due_date_active_idx" ON "tasks"("due_date") WHERE "status" = 'active' AND "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "tasks_fts_idx" ON "tasks" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "task_tags_tag_id_idx" ON "task_tags"("tag_id");

-- CreateIndex
CREATE INDEX "checklist_items_task_id_sort_order_idx" ON "checklist_items"("task_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "smart_lists_owner_id_key_key" ON "smart_lists"("owner_id", "key");

-- CreateIndex
CREATE INDEX "filters_owner_id_sort_order_idx" ON "filters"("owner_id", "sort_order");

-- CreateIndex
CREATE INDEX "reminders_task_id_idx" ON "reminders"("task_id");

-- CreateIndex
CREATE INDEX "habits_owner_id_sort_order_idx" ON "habits"("owner_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "habit_logs_habit_id_date_key" ON "habit_logs"("habit_id", "date");

-- CreateIndex
CREATE INDEX "focus_sessions_owner_id_started_at_idx" ON "focus_sessions"("owner_id", "started_at");

-- CreateIndex
CREATE INDEX "calendar_subscriptions_owner_id_idx" ON "calendar_subscriptions"("owner_id");

-- CreateIndex
CREATE INDEX "external_events_owner_id_starts_at_idx" ON "external_events"("owner_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "external_events_subscription_id_external_uid_key" ON "external_events"("subscription_id", "external_uid");

-- CreateIndex
CREATE INDEX "attachments_task_id_idx" ON "attachments"("task_id");

-- CreateIndex
CREATE INDEX "comments_task_id_created_at_idx" ON "comments"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_log_owner_id_created_at_idx" ON "activity_log"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_log_entity_type_entity_id_idx" ON "activity_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "countdowns_owner_id_idx" ON "countdowns"("owner_id");

-- CreateIndex
CREATE INDEX "templates_owner_id_idx" ON "templates"("owner_id");

-- CreateIndex
CREATE INDEX "dashboard_layouts_owner_id_idx" ON "dashboard_layouts"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_reports_owner_id_week_start_key" ON "weekly_reports"("owner_id", "week_start");

-- AddForeignKey
ALTER TABLE "focus_settings" ADD CONSTRAINT "focus_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "columns" ADD CONSTRAINT "columns_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "columns" ADD CONSTRAINT "columns_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "columns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_lists" ADD CONSTRAINT "smart_lists_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filters" ADD CONSTRAINT "filters_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habits" ADD CONSTRAINT "habits_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_habit_id_fkey" FOREIGN KEY ("habit_id") REFERENCES "habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticky_notes" ADD CONSTRAINT "sticky_notes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticky_notes" ADD CONSTRAINT "sticky_notes_pinned_task_id_fkey" FOREIGN KEY ("pinned_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_subscriptions" ADD CONSTRAINT "calendar_subscriptions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_events" ADD CONSTRAINT "external_events_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_events" ADD CONSTRAINT "external_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "calendar_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "countdowns" ADD CONSTRAINT "countdowns_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_layouts" ADD CONSTRAINT "dashboard_layouts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One system inbox per owner (section 5.3). Prisma 6 cannot model this partial unique index.
CREATE UNIQUE INDEX "projects_one_inbox_per_owner_idx" ON "projects"("owner_id") WHERE "is_inbox" = true AND "deleted_at" IS NULL;
